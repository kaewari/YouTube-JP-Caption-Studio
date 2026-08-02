import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Query private var vocabularies: [Vocabulary]

    @AppStorage("sidePanelFraction") private var sidePanelFraction = 0.28
    /// Match desktop `showOnVideo: false` — user enables on a watch page.
    @AppStorage("hardsubOverlayOn") private var overlayOn = false
    @AppStorage("sidePanelOn") private var sidePanelOn = false
    @AppStorage("hardsubShowJA") private var showJA = true
    /// Desktop defaults: barShowEn / barShowVi are on unless explicitly off.
    /// `.v2` keys: older builds stored false; rename so new defaults apply once.
    @AppStorage("hardsubShowEN.v2") private var showEN = true
    @AppStorage("hardsubShowVI.v2") private var showVI = true
    @AppStorage("hardsubShowFurigana") private var showFurigana = true
    @AppStorage("isDarkTheme") private var isDarkTheme = true
    @AppStorage("followTimeline") private var followTimeline = true
    @AppStorage("hardsubBarScale") private var overlayFontScale = 1.0
    @AppStorage("sidePanelFontScale") private var sidePanelFontScale = 1.0

    @State private var urlField = "https://www.youtube.com/watch?v=MOIbaNe4Pmw"
    @State private var videoID = "MOIbaNe4Pmw"
    @State private var currentCues: [ScriptCue] = []
    /// YT sync anchors (class so high-freq writes don't invalidate SwiftUI).
    @State private var playheadSync = PlayheadSync()
    /// Stable id for list highlight / scroll — updated only when the active cue changes.
    @State private var activeCueId: String?
    @State private var isPlaying: Bool = false
    @State private var seekRequest: Double? = nil
    @State private var reloadNonce = 0
    @State private var isLoadingCaptions = false
    @State private var statusMessage: String?
    @State private var toolTab: ToolTab = .subtitles
    @State private var dragStartFraction: CGFloat?
    @State private var videoFrame: CGRect?
    @State private var layoutOK = false
    @State private var layoutNote: String?
    @State private var showSettings = false
    @State private var confirmClearMT = false
    @State private var confirmWipe = false
    @State private var showImporter = false
    @State private var pendingImport: PendingImport?
    @State private var importMode: ScriptCue.ImportMode = .merge
    @State private var importIncludeJA = false
    @State private var exportURL: URL?
    /// From WKWebView `PAGE_NAV` — nil on YT home/search (desktop-equivalent gate).
    @State private var pageWatchID: String?
    @State private var pageNavKnown = false
    /// Side-panel edit in progress — skip auto-scroll (desktop `isEditingAny`).
    @State private var editingCue = false
    /// Bump to force one scroll-to-active after re-enabling follow.
    @State private var followResumeNonce = 0
    /// Ignore drag/scroll that comes from our own `scrollTo` (desktop `ignoreScrollEvent`).
    @State private var ignoreScrollEvent = false
    @FocusState private var urlFocused: Bool

    private enum ToolTab: String, CaseIterable {
        case subtitles = "Phụ đề"
        case vocab = "Từ vựng"
    }

    private var activeCue: ScriptCue? {
        guard let id = activeCueId else { return nil }
        return currentCues.first { $0.id == id && !$0.isDeleted }
    }

    /// Live playhead (ms) from last YT sync + short extrapolate — not @State.
    private var playheadMs: Double {
        if isPlaying {
            let elapsed = Date().timeIntervalSince(playheadSync.at) * 1000
            return playheadSync.timeMs + min(elapsed, 300)
        }
        return playheadSync.timeMs
    }

    /// Desktop: content/side panel only on YouTube watch with `?v=`.
    private var onYouTubeWatch: Bool {
        pageNavKnown ? pageWatchID != nil : !videoID.isEmpty
    }

    private var overlayShown: Bool { overlayOn && onYouTubeWatch }
    private var sidePanelShown: Bool { sidePanelOn && onYouTubeWatch }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Divider()
            GeometryReader { geo in
                let wide = geo.size.width >= 800
                Group {
                    if wide {
                        wideLayout(size: geo.size)
                    } else {
                        compactLayout(size: geo.size)
                    }
                }
            }
        }
        .background(Color.black)
        .preferredColorScheme(isDarkTheme ? .dark : .light)
        // Saved cues first, Drive REST after (needs prior Connect / token in Keychain).
        .task(id: videoID) {
            await loadCaptions(for: videoID)
            guard DriveAuthService.shared.hasToken else { return }
            let result = await DriveScriptsService.sync(videoId: videoID, context: modelContext)
            applyDriveSync(result)
        }
        // ponytail: was 30Hz @State (full tree); now only refresh activeCueId (~8Hz, writes when id changes)
        .onReceive(Timer.publish(every: 0.125, on: .main, in: .common).autoconnect()) { _ in
            guard scenePhase == .active else { return }
            refreshActiveCueId(at: playheadMs)
        }
        .sheet(isPresented: $showSettings) { SidePanelSettingsSheet() }
        .confirmationDialog("Xóa toàn bộ EN/VI?", isPresented: $confirmClearMT, titleVisibility: .visible) {
            Button("Xóa dịch", role: .destructive) { clearTranslations() }
            Button("Hủy", role: .cancel) {}
        }
        .confirmationDialog("Xóa sub đã lưu và tải lại từ YouTube?", isPresented: $confirmWipe, titleVisibility: .visible) {
            Button("Xóa sub", role: .destructive) { wipeAndReload() }
            Button("Hủy", role: .cancel) {}
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.plainText, .json], allowsMultipleSelection: false) { result in
            handleImport(result)
        }
        .sheet(isPresented: Binding(
            get: { exportURL != nil },
            set: { if !$0 { exportURL = nil } }
        )) {
            if let url = exportURL {
                ActivityView(url: url)
            }
        }
        .task {
            BackupService.shared.autoRestoreIfEmpty(context: modelContext)
            if BackupService.shared.syncFromDriveIfNewer(context: modelContext) {
                currentCues = ScriptCue.load(videoId: videoID, context: modelContext).filter { !$0.isDeleted }
            }
            if let s = BackupService.shared.status { statusMessage = s }
        }
        .onChange(of: scenePhase) { _, phase in
            // Flush only — do not pause YouTube when backgrounding.
            if phase == .background {
                BackupService.shared.flushPending(context: modelContext)
            } else if phase == .active {
                // Backup first: its restore rebuilds VideoScript rows, so the Drive sync
                // must run after to re-establish rev.
                let restored = BackupService.shared.syncFromDriveIfNewer(context: modelContext)
                if restored {
                    currentCues = ScriptCue.load(videoId: videoID, context: modelContext).filter { !$0.isDeleted }
                }
                if let s = BackupService.shared.status { statusMessage = s }
                Task {
                    guard DriveAuthService.shared.hasToken else { return }
                    let result = await DriveScriptsService.sync(videoId: videoID, context: modelContext)
                    applyDriveSync(result)
                }
            }
        }
    }

    // MARK: - Layouts

    private func wideLayout(size: CGSize) -> some View {
        let panel = clampedPanelWidth(total: size.width)
        return HStack(spacing: 0) {
            playerPane
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            if sidePanelShown {
                resizeSplit(axis: .horizontal, total: size.width)
                toolsColumn
                    .frame(width: panel)
                    .frame(maxHeight: .infinity)
            }
        }
    }

    private func compactLayout(size: CGSize) -> some View {
        let panel = clampedPanelHeight(total: size.height)
        return VStack(spacing: 0) {
            playerPane
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            if sidePanelShown {
                resizeSplit(axis: .vertical, total: size.height)
                toolsColumn
                    .frame(height: panel)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private func clampedPanelWidth(total: CGFloat) -> CGFloat {
        let minW: CGFloat = 280
        let maxW = max(minW, total * 0.55)
        return min(max(total * sidePanelFraction, minW), maxW)
    }

    private func clampedPanelHeight(total: CGFloat) -> CGFloat {
        let minH: CGFloat = 180
        let maxH = max(minH, total * 0.65)
        return min(max(total * sidePanelFraction, minH), maxH)
    }

    private func resizeSplit(axis: Axis, total: CGFloat) -> some View {
        let thickness: CGFloat = 10
        return ZStack {
            Color(uiColor: .separator).opacity(0.35)
            Capsule()
                .fill(Color.secondary.opacity(0.45))
                .frame(
                    width: axis == .horizontal ? 4 : 36,
                    height: axis == .horizontal ? 36 : 4
                )
        }
        .frame(width: axis == .horizontal ? thickness : nil,
               height: axis == .vertical ? thickness : nil)
        .background(Color(uiColor: .systemBackground))
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 1)
                .onChanged { value in
                    if dragStartFraction == nil { dragStartFraction = sidePanelFraction }
                    let start = dragStartFraction ?? sidePanelFraction
                    let delta: CGFloat = {
                        switch axis {
                        case .horizontal: return -value.translation.width / max(total, 1)
                        case .vertical: return -value.translation.height / max(total, 1)
                        }
                    }()
                    sidePanelFraction = min(0.55, max(0.22, start + delta))
                }
                .onEnded { _ in dragStartFraction = nil }
        )
        .accessibilityLabel("Resize side panel")
        .help("Kéo để đổi kích thước panel")
    }

    // MARK: - Player (full bleed)

    private var playerPane: some View {
        ZStack {
            Color(red: 0.07, green: 0.07, blue: 0.07)
            YouTubePlayerView(
                videoID: videoID,
                onCaptionsReceived: { _, payload in
                    let parsed = SubtitleParser.parseTimedtext(body: payload)
                    guard !parsed.isEmpty else { return }
                    Task { @MainActor in
                        // Owned Drive/import script: keep panel; don't let YT wipe after sync.
                        let d = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoID })
                        if let s = try? modelContext.fetch(d).first, s.owned, !currentCues.isEmpty { return }
                        currentCues = ScriptCue.mergeWithLocal(videoId: videoID, youtubeCues: parsed, context: modelContext)
                        statusMessage = nil
                    }
                },
                onTimeUpdate: { currentTime, _, paused in
                    playheadSync.timeMs = currentTime * 1000
                    playheadSync.at = Date()
                    let playing = !paused
                    if isPlaying != playing { isPlaying = playing }
                    refreshActiveCueId(at: playheadSync.timeMs)
                },
                onVideoRect: { rect in
                    if let prev = videoFrame,
                       abs(prev.minX - rect.minX) < 2, abs(prev.minY - rect.minY) < 2,
                       abs(prev.width - rect.width) < 2, abs(prev.height - rect.height) < 2 {
                        return
                    }
                    videoFrame = rect
                },
                onLayoutCheck: { dict in
                    let noFixed = (dict["noFixedPlayer"] as? Bool) ?? ((dict["noFixedPlayer"] as? NSNumber)?.boolValue ?? false)
                    let hasBottom = (dict["hasBottomChrome"] as? Bool) ?? ((dict["hasBottomChrome"] as? NSNumber)?.boolValue ?? false)
                    let ratio = (dict["ratio"] as? Double) ?? (dict["ratio"] as? NSNumber)?.doubleValue ?? 0
                    layoutOK = noFixed && hasBottom
                    layoutNote = String(format: "Player %.0f%% · bottomChrome=%@ · fixed=%@",
                                        ratio * 100,
                                        hasBottom ? "yes" : "NO",
                                        noFixed ? "no" : "YES")
                    UserDefaults.standard.set(layoutOK, forKey: "debugLayoutOK")
                    UserDefaults.standard.set(layoutNote, forKey: "debugLayoutNote")
                    if let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                        let payload = "ok=\(layoutOK)\n\(layoutNote ?? "")\n"
                        try? payload.write(to: dir.appendingPathComponent("layout_smoke.txt"), atomically: true, encoding: .utf8)
                    }
                    #if DEBUG
                    print("[LayoutSmoke] \(layoutOK ? "ok" : "FAIL") \(layoutNote ?? "")")
                    #endif
                },
                onPageVideoID: { id in
                    pageNavKnown = true
                    pageWatchID = id
                    // Keep url chrome in sync on in-page YT nav without remounting via `.id(videoID)`.
                    if let id, id != videoID {
                        videoID = id
                        urlField = "https://www.youtube.com/watch?v=\(id)"
                    }
                },
                seekRequest: $seekRequest,
                reloadNonce: $reloadNonce
            )

            if overlayShown {
                HardsubOverlayView(
                    activeCue: activeCue,
                    videoFrame: videoFrame,
                    showJA: showJA,
                    showEN: showEN,
                    showVI: showVI,
                    showFurigana: showFurigana
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func saveCues() {
        modelContext.saveAndScheduleBackup()
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("JP Caption Studio")
                    .font(.headline.weight(.semibold))
                Text("Học phụ đề YouTube")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .fixedSize()

            HStack(spacing: 8) {
                Image(systemName: "link")
                    .foregroundStyle(.secondary)
                TextField("Dán link hoặc video ID YouTube", text: $urlField)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .focused($urlFocused)
                    .onSubmit(loadAndRefresh)
                if !urlField.isEmpty {
                    Button {
                        urlField = ""
                        urlFocused = true
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

            iconPill("arrow.clockwise", prominent: true, label: "Tải / làm mới") {
                loadAndRefresh()
            }

            iconPill("captions.bubble.fill", active: overlayShown, label: overlayOn ? "Tắt overlay" : "Bật overlay") {
                guard onYouTubeWatch else { return }
                overlayOn.toggle()
            }
            .disabled(!onYouTubeWatch)
            .opacity(onYouTubeWatch ? 1 : 0.35)

            iconPill("sidebar.trailing", active: sidePanelShown, label: sidePanelOn ? "Ẩn side panel" : "Hiện side panel") {
                guard onYouTubeWatch else { return }
                sidePanelOn.toggle()
            }
            .disabled(!onYouTubeWatch)
            .opacity(onYouTubeWatch ? 1 : 0.35)

            Menu {
                Stepper(value: $overlayFontScale, in: 0.55...2.4, step: 0.1) {
                    Text("Overlay \(String(format: "%.1f", overlayFontScale))×")
                }
                Stepper(value: $sidePanelFontScale, in: 0.7...1.8, step: 0.1) {
                    Text("Side panel \(String(format: "%.1f", sidePanelFontScale))×")
                }
            } label: {
                Image(systemName: "textformat.size")
                    .font(.body.weight(.semibold))
                    .frame(width: 36, height: 36)
                    .foregroundStyle(Color.primary)
                    .background(Color(uiColor: .secondarySystemGroupedBackground), in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cỡ chữ overlay và side panel")

            iconPill(isDarkTheme ? "moon.fill" : "sun.max.fill", label: isDarkTheme ? "Chuyển sang sáng" : "Chuyển sang tối") {
                isDarkTheme.toggle()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(uiColor: .systemBackground))
    }

    private func iconPill(
        _ systemImage: String,
        prominent: Bool = false,
        active: Bool = false,
        label: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .frame(width: 36, height: 36)
                .foregroundStyle(prominent || active ? Color.white : Color.primary)
                .background(
                    prominent || active
                        ? Color(red: 0.08, green: 0.30, blue: 0.36)
                        : Color(uiColor: .secondarySystemGroupedBackground),
                    in: Capsule()
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    // MARK: - Tools

    private var toolsColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            SidePanelToolbar(
                onReload: { Task { await loadCaptions(for: videoID) } },
                onAddCue: addCueAtPlayhead,
                onClearTranslations: { confirmClearMT = true },
                onWipeScript: { confirmWipe = true },
                onExport: exportScript,
                onImport: { showImporter = true },
                onConnectDrive: { Task { await connectDrive() } },
                onSettings: { showSettings = true }
            )

            if pendingImport != nil {
                importPanel
            }

            HStack(spacing: 10) {
                // Isolated so ~4Hz clock ticks don't rebuild the cue List below.
                PlayheadStatusChip(
                    sync: playheadSync,
                    isPlaying: isPlaying,
                    activeStartMs: activeCue?.startTime
                )
                Spacer()
                Toggle(isOn: Binding(
                    get: { followTimeline },
                    set: { on in
                        followTimeline = on
                        if on { followResumeNonce &+= 1 }
                    }
                )) {
                    Text("Theo timeline")
                        .font(.caption)
                }
                .toggleStyle(.button)
                .tint(followTimeline ? Color(red: 0.08, green: 0.30, blue: 0.36) : .secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            if let statusMessage {
                Label(statusMessage, systemImage: isLoadingCaptions ? "arrow.triangle.2.circlepath" : "info.circle")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 6)
            }

            Picker("Công cụ", selection: $toolTab) {
                ForEach(ToolTab.allCases, id: \.self) { tab in
                    Text(tabTitle(tab)).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            Group {
                switch toolTab {
                case .subtitles:
                    subtitlesList
                case .vocab:
                    vocabList
                }
            }
        }
        .background(Color(uiColor: .systemBackground))
    }

    private func tabTitle(_ tab: ToolTab) -> String {
        switch tab {
        case .subtitles: return "Phụ đề (\(currentCues.filter { !$0.isDeleted }.count))"
        case .vocab: return "Từ vựng (\(vocabularies.count))"
        }
    }

    private var subtitlesList: some View {
        Group {
            if currentCues.isEmpty {
                ContentUnavailableView(
                    isLoadingCaptions ? "Đang tải phụ đề…" : "Chưa có phụ đề",
                    systemImage: isLoadingCaptions ? "ellipsis.bubble" : "captions.bubble",
                    description: Text(isLoadingCaptions
                        ? "Đợi timedtext từ YouTube"
                        : "Video này có thể không có CC. Thử video khác hoặc bật phụ đề trên player.")
                )
            } else {
                let live = currentCues.filter { !$0.isDeleted }
                ScrollViewReader { proxy in
                    List {
                        ForEach(live) { cue in
                            let active = activeCueId == cue.id
                            CueEditorRow(
                                cue: cue,
                                isActive: active,
                                neighbors: live,
                                fontScale: sidePanelFontScale,
                                onSeek: { seekRequest = $0 },
                                onSave: {
                                    saveCues()
                                    currentCues = ScriptCue.load(videoId: videoID, context: modelContext)
                                        .filter { !$0.isDeleted }
                                },
                                onEditingChanged: { editing in
                                    editingCue = editing
                                    if editing { followTimeline = false }
                                }
                            )
                                .id(cue.id)
                                .listRowBackground(
                                    active
                                        ? Color(red: 0.08, green: 0.30, blue: 0.36).opacity(0.18)
                                        : Color.clear
                                )
                                .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                                // Bar sits in the leading pad — 12pt gap before text (not flush).
                                .padding(.leading, active ? 12 : 0)
                                .overlay(alignment: .leading) {
                                    if active {
                                        RoundedRectangle(cornerRadius: 2)
                                            .fill(Color(red: 0.08, green: 0.30, blue: 0.36))
                                            .frame(width: 3)
                                            .padding(.vertical, 6)
                                            .allowsHitTesting(false)
                                    }
                                }
                        }
                    }
                    .listStyle(.plain)
                    // ponytail: DragGesture ≈ desktop wheel/touch; trackpad-only scroll may not pause — UIScrollViewDelegate if needed
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 8)
                            .onChanged { _ in pauseFollowFromUser() }
                    )
                    .onChange(of: activeCueId) { _, newId in
                        scrollActiveIntoView(proxy, id: newId)
                    }
                    .onChange(of: followResumeNonce) { _, _ in
                        scrollActiveIntoView(proxy, id: activeCueId)
                    }
                }
            }
        }
    }

    private var vocabList: some View {
        Group {
            if vocabularies.isEmpty {
                ContentUnavailableView(
                    "Chưa lưu từ nào",
                    systemImage: "bookmark",
                    description: Text("Chạm một từ trên overlay hoặc phụ đề → Lưu từ.")
                )
            } else {
                List(vocabularies) { vocab in
                    HStack {
                        Text(vocab.word).font(.body.weight(.medium))
                        Spacer()
                        Text(vocab.meaning).foregroundStyle(.secondary)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var importPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("Nhập bản dịch")
                    .font(.subheadline.weight(.semibold))
                Text("\(pendingImport?.fileName ?? "file") · \(pendingImport?.rows.count ?? 0) mục")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Button {
                    pendingImport = nil
                } label: {
                    Image(systemName: "xmark")
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Đóng phần nhập bản dịch")
            }

            Text("Gộp: khớp theo cue id hoặc thời điểm ±0,35s + JA (mặc định chỉ EN/VI). Full: thay toàn bộ script (dịch + timeline) và xóa bản lưu cũ.")
                .font(.caption2)
                .foregroundStyle(.secondary)

            importModeButton(
                .merge,
                title: "Gộp (partial) — chỉ các mục có trong file"
            )
            importModeButton(
                .replace,
                title: "Thay thế (full) — xóa script cũ, ghi đè toàn bộ dịch + timeline từ file"
            )

            Toggle("Gồm JA/timeline (chỉ Gộp; Full luôn gồm)", isOn: $importIncludeJA)
                .font(.caption)
                .disabled(importMode == .replace)

            Button("Áp dụng", action: applyImport)
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.48, green: 0.28, blue: 0.85))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color(red: 0.086, green: 0.086, blue: 0.122))
        .overlay(alignment: .bottom) { Divider() }
    }

    private func importModeButton(_ mode: ScriptCue.ImportMode, title: String) -> some View {
        Button {
            importMode = mode
            if mode == .replace { importIncludeJA = true }
        } label: {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: importMode == mode ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(importMode == mode ? Color.accentColor : .secondary)
                Text(title)
                    .font(.caption)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Actions

    private func refreshActiveCueId(at timeMs: Double) {
        let id = ScriptCue.active(in: currentCues, atMs: timeMs)?.id
        if id != activeCueId { activeCueId = id }
    }

    /// Desktop `pauseFollowFromUser` — user drag on subtitle list stops auto-scroll.
    private func pauseFollowFromUser() {
        if ignoreScrollEvent { return }
        if !followTimeline { return }
        followTimeline = false
    }

    private func scrollActiveIntoView(_ proxy: ScrollViewProxy, id: ScriptCue.ID?) {
        guard followTimeline, !editingCue, let id else { return }
        ignoreScrollEvent = true
        withAnimation(.easeInOut(duration: 0.2)) {
            proxy.scrollTo(id, anchor: .center)
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            ignoreScrollEvent = false
        }
    }

    private func loadAndRefresh() {
        urlFocused = false
        guard let id = YouTubeURL.videoID(from: urlField) else {
            statusMessage = "Link không hợp lệ — dán URL YouTube hoặc ID 11 ký tự."
            return
        }
        let same = id == videoID
        if !same {
            currentCues = []
            playheadSync.timeMs = 0
            playheadSync.at = Date()
            activeCueId = nil
            isPlaying = false
            videoID = id
            // `.task(id:)` + player `.id` handle first load; still bump nonce so a
            // recycled coordinator can't skip the watch URL.
            reloadNonce += 1
            statusMessage = "Đang tải \(id)…"
        } else {
            // Same video: force page refresh + re-merge YouTube with saved ScriptStore.
            reloadNonce += 1
            statusMessage = "Đang làm mới \(id)…"
            Task { await loadCaptions(for: id) }
        }
        urlField = "https://www.youtube.com/watch?v=\(id)"
    }

    private func loadCaptions(for id: String) async {
        isLoadingCaptions = true
        statusMessage = "Đang lấy phụ đề…"

        let keepOwned: Bool = await MainActor.run {
            let local = ScriptCue.load(videoId: id, context: modelContext).filter { !$0.isDeleted }
            let descriptor = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == id })
            let owned = (try? modelContext.fetch(descriptor).first)?.owned == true
            if !local.isEmpty {
                currentCues = local
                statusMessage = owned
                    ? "Đã giữ script đã import (\(local.count) cue)"
                    : "Đã tải \(local.count) câu từ lưu trữ cục bộ"
            }
            return owned && !local.isEmpty
        }

        // Owned import: keep local timeline; page refresh still via reloadNonce.
        // wipeAndReload deletes the script first, so owned is cleared and YouTube fetch runs.
        if keepOwned {
            await MainActor.run { isLoadingCaptions = false }
            return
        }

        let cues = await CaptionService.fetchCues(videoId: id)
        await MainActor.run {
            isLoadingCaptions = false
            if !cues.isEmpty {
                currentCues = ScriptCue.mergeWithLocal(videoId: id, youtubeCues: cues, context: modelContext)
                statusMessage = "Đã cập nhật \(cues.count) câu phụ đề từ YouTube"
            } else if currentCues.isEmpty {
                statusMessage = "Chưa lấy được timedtext — thử video có CC tiếng Nhật"
            }
        }
    }

    private func connectDrive() async {
        do {
            _ = try await DriveAuthService.shared.connect()
            guard DriveAuthService.shared.hasToken else {
                statusMessage = "Drive: OAuth xong nhưng chưa lưu được token"
                return
            }
            statusMessage = "Drive: đã kết nối · đang tìm \(videoID)…"
            let result = await DriveScriptsService.sync(videoId: videoID, context: modelContext)
            applyDriveSync(result)
        } catch {
            statusMessage = "Drive: \(error.localizedDescription)"
        }
    }

    /// Prefer cues returned by pull/import — `ScriptCue.load` can miss SwiftData relationship.
    private func applyDriveSync(_ result: DriveScriptsService.SyncResult) {
        if let cues = result.cues, !cues.isEmpty {
            currentCues = cues.filter { !$0.isDeleted }
        } else {
            currentCues = ScriptCue.load(videoId: videoID, context: modelContext).filter { !$0.isDeleted }
        }
        statusMessage = result.message
    }

    private func addCueAtPlayhead() {
        let cue = ScriptCue.addCueAtPlayhead(videoId: videoID, atMs: playheadMs, context: modelContext)
        currentCues = ScriptCue.load(videoId: videoID, context: modelContext).filter { !$0.isDeleted }
        let total = Int(cue.startTime / 1000)
        statusMessage = String(format: "Đã thêm cue tại %d:%02d", total / 60, total % 60)
        toolTab = .subtitles
    }

    private func clearTranslations() {
        ScriptCue.clearTranslations(videoId: videoID, context: modelContext)
        currentCues = ScriptCue.load(videoId: videoID, context: modelContext)
        statusMessage = "Đã xóa EN/VI"
    }

    private func wipeAndReload() {
        ScriptCue.wipeAll(videoId: videoID, context: modelContext)
        currentCues = []
        statusMessage = "Đã xóa sub — đang tải lại…"
        Task { await loadCaptions(for: videoID) }
    }

    private func exportScript() {
        let text = ScriptCue.exportTXT(currentCues)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(videoID)-script.txt")
        do {
            try text.write(to: url, atomically: true, encoding: .utf8)
            exportURL = url
            statusMessage = "Export sẵn sàng"
        } catch {
            statusMessage = "Export lỗi: \(error.localizedDescription)"
        }
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let err):
            statusMessage = "Import lỗi: \(err.localizedDescription)"
        case .success(let urls):
            guard let url = urls.first else { return }
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            guard let text = try? String(contentsOf: url, encoding: .utf8) else {
                statusMessage = "Không đọc được file import"
                return
            }
            let parsed = ScriptCue.parseImportRows(text)
            guard !parsed.isEmpty else {
                statusMessage = "Import: không parse được — dùng TXT/JSON export từ app hoặc extension"
                return
            }
            importMode = .merge
            importIncludeJA = false
            pendingImport = PendingImport(fileName: url.lastPathComponent, rows: parsed)
            statusMessage = "Đã đọc \(parsed.count) mục — chọn chế độ rồi Áp dụng"
        }
    }

    private func applyImport() {
        guard let pendingImport else {
            statusMessage = "Chưa chọn file"
            return
        }
        let result = ScriptCue.importRows(
            videoId: videoID,
            rows: pendingImport.rows,
            mode: importMode,
            includeJA: importMode == .replace || importIncludeJA,
            context: modelContext
        )
        if !result.cues.isEmpty {
            currentCues = result.cues.filter { !$0.isDeleted }
        } else {
            currentCues = ScriptCue.load(videoId: videoID, context: modelContext).filter { !$0.isDeleted }
        }
        statusMessage = importMode == .replace
            ? "Import: đã thay thế \(result.replaced) cue"
            : "Import: cập nhật \(result.updated) · bỏ qua \(result.skipped) · không khớp \(result.unmatched)"
        self.pendingImport = nil
        toolTab = .subtitles
    }

}

/// Mutable YT playhead anchors — not @Published; writes must not rebuild ContentView.
private final class PlayheadSync {
    var timeMs: Double = 0
    var at: Date = Date()
}

/// Own timer for the clock so ContentView / cue List don't rebuild on playhead ticks.
private struct PlayheadStatusChip: View {
    let sync: PlayheadSync
    let isPlaying: Bool
    let activeStartMs: Double?
    @State private var displayMs: Double = 0

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: isPlaying ? "play.fill" : "pause.fill")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(Self.format(displayMs))
                .font(.subheadline.monospacedDigit().weight(.semibold))
                .foregroundStyle(Color.primary)
            if let activeStartMs {
                Text("·")
                    .foregroundStyle(.tertiary)
                Text(Self.format(activeStartMs))
                    .font(.subheadline.monospacedDigit().weight(.medium))
                    .foregroundStyle(.primary.opacity(0.75))
            }
        }
        .onReceive(Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()) { _ in
            if isPlaying {
                let elapsed = Date().timeIntervalSince(sync.at) * 1000
                displayMs = sync.timeMs + min(elapsed, 300)
            } else {
                displayMs = sync.timeMs
            }
        }
        .onAppear { displayMs = sync.timeMs }
        .onChange(of: isPlaying) { _, _ in displayMs = sync.timeMs }
    }

    private static func format(_ ms: Double) -> String {
        let total = Int(ms / 1000)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

private struct PendingImport {
    let fileName: String
    let rows: [ScriptCue.ImportRow]
}

// Share sheet for Export
private struct ActivityView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#Preview {
    ContentView()
        .modelContainer(for: [VideoScript.self, ScriptCue.self, Vocabulary.self], inMemory: true)
}
