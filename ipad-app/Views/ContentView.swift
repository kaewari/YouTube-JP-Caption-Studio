import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var vocabularies: [Vocabulary]

    @AppStorage("sidePanelFraction") private var sidePanelFraction = 0.28
    @AppStorage("hardsubOverlayOn") private var overlayOn = true
    @AppStorage("sidePanelOn") private var sidePanelOn = true
    @AppStorage("hardsubShowJA") private var showJA = true
    @AppStorage("hardsubShowEN") private var showEN = false
    @AppStorage("hardsubShowVI") private var showVI = false
    @AppStorage("isDarkTheme") private var isDarkTheme = true
    @AppStorage("followTimeline") private var followTimeline = true
    @AppStorage("hardsubBarScale") private var overlayFontScale = 1.0
    @AppStorage("sidePanelFontScale") private var sidePanelFontScale = 1.0

    @State private var urlField = "https://www.youtube.com/watch?v=EiISOvl2_tQ"
    @State private var videoID = "EiISOvl2_tQ"
    @State private var currentCues: [ScriptCue] = []
    /// Authoritative playhead from YT; UI reads `currentTimeMs` (extrapolated while playing).
    @State private var syncedTimeMs: Double = 0
    @State private var syncedAt: Date = Date()
    @State private var currentTimeMs: Double = 0
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
    @State private var exportURL: URL?
    @FocusState private var urlFocused: Bool

    private enum ToolTab: String, CaseIterable {
        case subtitles = "Phụ đề"
        case vocab = "Từ vựng"
    }

    private var activeCue: ScriptCue? {
        ScriptCue.active(in: currentCues, atMs: currentTimeMs)
    }

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
        .task(id: videoID) { await loadCaptions(for: videoID) }
        .onReceive(Timer.publish(every: 1.0 / 30.0, on: .main, in: .common).autoconnect()) { _ in
            // Extrapolate from last YT sync — cap so stalled posts can't race ahead of speech.
            if isPlaying {
                let elapsed = Date().timeIntervalSince(syncedAt) * 1000
                currentTimeMs = syncedTimeMs + min(elapsed, 300)
            } else {
                currentTimeMs = syncedTimeMs
            }
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
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.plainText, .json, .data], allowsMultipleSelection: false) { result in
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
    }

    // MARK: - Layouts

    private func wideLayout(size: CGSize) -> some View {
        let panel = clampedPanelWidth(total: size.width)
        return HStack(spacing: 0) {
            playerPane
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            if sidePanelOn {
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
            if sidePanelOn {
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
                        currentCues = ScriptCue.mergeWithLocal(videoId: videoID, youtubeCues: parsed, context: modelContext)
                        statusMessage = nil
                    }
                },
                onTimeUpdate: { currentTime, _, paused in
                    syncedTimeMs = currentTime * 1000
                    syncedAt = Date()
                    isPlaying = !paused
                    currentTimeMs = syncedTimeMs
                },
                onVideoRect: { videoFrame = $0 },
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
                seekRequest: $seekRequest,
                reloadNonce: $reloadNonce
            )
            .id(videoID)

            if overlayOn {
                HardsubOverlayView(
                    cues: currentCues,
                    currentTimeMs: currentTimeMs,
                    videoFrame: videoFrame,
                    showJA: showJA,
                    showEN: showEN,
                    showVI: showVI
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func saveCues() {
        try? modelContext.save()
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

            iconPill("captions.bubble.fill", active: overlayOn, label: overlayOn ? "Tắt overlay" : "Bật overlay") {
                overlayOn.toggle()
            }

            iconPill("sidebar.trailing", active: sidePanelOn, label: sidePanelOn ? "Ẩn side panel" : "Hiện side panel") {
                sidePanelOn.toggle()
            }

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
                overlayOn: overlayOn,
                onReload: { Task { await loadCaptions(for: videoID) } },
                onAddCue: addCueAtPlayhead,
                onToggleOverlay: { overlayOn.toggle() },
                onClearTranslations: { confirmClearMT = true },
                onWipeScript: { confirmWipe = true },
                onExport: exportScript,
                onImport: { showImporter = true },
                onSettings: { showSettings = true }
            )

            if let active = activeCue {
                Text(active.textJA)
                    .font(.system(size: 17 * CGFloat(sidePanelFontScale), weight: .semibold))
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                    .padding(.bottom, 6)
            }

            HStack(spacing: 10) {
                Image(systemName: isPlaying ? "play.fill" : "pause.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(formatTime(currentTimeMs))
                    .font(.subheadline.monospacedDigit().weight(.semibold))
                    .foregroundStyle(Color.primary)
                if let active = activeCue {
                    Text("·")
                        .foregroundStyle(.tertiary)
                    Text(formatTime(active.startTime))
                        .font(.subheadline.monospacedDigit().weight(.medium))
                        .foregroundStyle(.primary.opacity(0.75))
                }
                Spacer()
                Toggle(isOn: $followTimeline) {
                    Text("Theo timeline")
                        .font(.caption)
                }
                .toggleStyle(.button)
                .tint(followTimeline ? Color(red: 0.08, green: 0.30, blue: 0.36) : .secondary)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 6)

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
                            let active = activeCue?.id == cue.id
                            CueEditorRow(cue: cue, isActive: active, fontScale: sidePanelFontScale, onSeek: { seekRequest = $0 }, onSave: {
                                saveCues()
                                // @State array identity doesn't change when ScriptCue.isDeleted flips
                                currentCues = currentCues.filter { !$0.isDeleted }
                            })
                                .id(cue.id)
                                .listRowBackground(
                                    active
                                        ? Color(red: 0.08, green: 0.30, blue: 0.36).opacity(0.18)
                                        : Color.clear
                                )
                                .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
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
                    .onChange(of: activeCue?.id) { _, newId in
                        guard followTimeline, let newId else { return }
                        withAnimation(.easeInOut(duration: 0.2)) {
                            proxy.scrollTo(newId, anchor: .center)
                        }
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
                    description: Text("Chạm giữ một từ trong phụ đề để lưu (sắp có).")
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

    // MARK: - Actions

    private func loadAndRefresh() {
        urlFocused = false
        guard let id = YouTubeURL.videoID(from: urlField) else {
            statusMessage = "Link không hợp lệ — dán URL YouTube hoặc ID 11 ký tự."
            return
        }
        let same = id == videoID
        if !same {
            currentCues = []
            syncedTimeMs = 0
            syncedAt = Date()
            currentTimeMs = 0
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

        await MainActor.run {
            let local = ScriptCue.load(videoId: id, context: modelContext)
            if !local.isEmpty {
                currentCues = local
                statusMessage = "Đã tải \(local.count) câu từ lưu trữ cục bộ"
            }
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

    private func addCueAtPlayhead() {
        let cue = ScriptCue.addCueAtPlayhead(videoId: videoID, atMs: currentTimeMs, context: modelContext)
        currentCues = ScriptCue.load(videoId: videoID, context: modelContext).filter { !$0.isDeleted }
        statusMessage = "Đã thêm cue tại \(formatTime(cue.startTime))"
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
            let n = ScriptCue.importTXT(videoId: videoID, text: text, context: modelContext)
            currentCues = ScriptCue.load(videoId: videoID, context: modelContext).filter { !$0.isDeleted }
            statusMessage = n > 0
                ? "Import: cập nhật \(n)/\(parsed.count) cue"
                : "Import: đọc \(parsed.count) dòng nhưng không khớp/ghi được cue"
        }
    }

    private func formatTime(_ ms: Double) -> String {
        let total = Int(ms / 1000)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
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
