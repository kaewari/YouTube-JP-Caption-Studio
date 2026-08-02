import SwiftUI
import SwiftData
import UIKit

struct CueEditorRow: View {
    @Bindable var cue: ScriptCue
    var isActive: Bool = false
    /// Neighbor cues (live) for timeline clamp + add-after.
    var neighbors: [ScriptCue] = []
    /// Side-panel text scale (1 = default).
    var fontScale: Double = 1.0
    let onSeek: (Double) -> Void
    let onSave: () -> Void
    /// Fired when any field gains/loses edit focus (side panel follow pause).
    var onEditingChanged: ((Bool) -> Void)? = nil

    @Environment(\.modelContext) private var modelContext
    @State private var isEditing = false
    @State private var selectedToken: Token?
    @State private var sheetLookup: DictLookup?
    @State private var saveTask: Task<Void, Never>?
    @State private var startText = ""
    @State private var confirmDelete = false
    @State private var copyToast = false
    private enum FocusField: Hashable { case start, ja, vi, en }
    @FocusState private var focused: FocusField?

    private var s: CGFloat { CGFloat(max(0.7, min(1.8, fontScale))) }
    private var metaH: CGFloat { 32 * s }

    var body: some View {
        rowContent
            .padding(.vertical, 8)
            .toolbar { keyboardDone }
            .onAppear { syncTimeFields() }
            .onChange(of: cue.startTime) { _, _ in syncTimeFields() }
            .onChange(of: cue.duration) { _, _ in syncTimeFields() }
            .onChange(of: isEditing) { _, _ in reportEditing() }
            .onChange(of: focused) { _, _ in reportEditing() }
            .confirmationDialog("Xóa cue này?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Xóa", role: .destructive) {
                    cue.softDelete()
                    onSave()
                }
                Button("Hủy", role: .cancel) {}
            }
            .overlay(alignment: .topTrailing) { copyToastBanner }
            .onChange(of: selectedToken) { _, tok in
                if let tok {
                    sheetLookup = DictionaryService.shared.lookup(surface: tok.surface, lemma: tok.lemma)
                } else {
                    sheetLookup = nil
                }
            }
            .sheet(item: $selectedToken) { _ in dictSheet }
    }

    private var rowContent: some View {
        VStack(alignment: .leading, spacing: 8 * s) {
            metaBar
            // Always reserve height — toggling this label on active caused list flash on cue advance.
            Text("ĐANG PHÁT")
                .font(.system(size: 10 * s, weight: .bold))
                .foregroundStyle(Color(red: 0.45, green: 0.82, blue: 0.90))
                .opacity(isActive ? 1 : 0)
                .accessibilityHidden(!isActive)
            jaBlock
            viBlock
            enBlock
        }
    }

    // ponytail: iOS cannot force IME; JA keyboard is user/OS choice
    @ViewBuilder private var jaBlock: some View {
        if isEditing {
            TextField("Japanese", text: $cue.textJA, axis: .vertical)
                .font(.system(size: 16 * s, weight: .semibold))
                .foregroundStyle(.primary)
                .textFieldStyle(.plain)
                .focused($focused, equals: .ja)
                .onChange(of: cue.textJA) { _, _ in scheduleSave() }
        } else if !cue.textJA.isEmpty {
            TokenizedJAView(
                text: cue.textJA,
                fontSize: 16 * s,
                weight: .semibold,
                showFurigana: true,
                centered: false
            ) { tok in
                guard tok.isContentWord else { return }
                sheetLookup = DictionaryService.shared.lookup(surface: tok.surface, lemma: tok.lemma)
                selectedToken = tok
            }
        } else {
            Text("Japanese")
                .font(.system(size: 16 * s))
                .foregroundStyle(.tertiary)
        }
    }

    @ViewBuilder private var viBlock: some View {
        if isEditing {
            TextField("Vietnamese (Optional)", text: Binding(
                get: { cue.textVI ?? "" },
                set: { cue.textVI = $0.isEmpty ? nil : $0 }
            ), axis: .vertical)
                .font(.system(size: 14 * s, weight: .semibold))
                .foregroundStyle(Color.primary.opacity(0.78))
                .textFieldStyle(.plain)
                .focused($focused, equals: .vi)
                .padding(.leading, 6)
                .onChange(of: cue.textVI) { _, _ in scheduleSave() }
        } else if let vi = cue.textVI, !vi.isEmpty {
            Text(vi)
                .font(.system(size: 14 * s, weight: .semibold))
                .foregroundStyle(Color.primary.opacity(0.78))
                .padding(.leading, 6)
        } else {
            Text("Vietnamese (Optional)")
                .font(.system(size: 14 * s, weight: .semibold))
                .foregroundStyle(.tertiary)
                .padding(.leading, 6)
        }
    }

    @ViewBuilder private var enBlock: some View {
        if isEditing {
            TextField("English (Optional)", text: Binding(
                get: { cue.textEN ?? "" },
                set: { cue.textEN = $0.isEmpty ? nil : $0 }
            ), axis: .vertical)
                .font(.system(size: 12 * s))
                .foregroundStyle(.secondary)
                .textFieldStyle(.plain)
                .focused($focused, equals: .en)
                .padding(.leading, 6)
                .onChange(of: cue.textEN) { _, _ in scheduleSave() }
        } else if let en = cue.textEN, !en.isEmpty {
            Text(en)
                .font(.system(size: 12 * s))
                .foregroundStyle(.secondary)
                .padding(.leading, 6)
        } else {
            Text("English (Optional)")
                .font(.system(size: 12 * s))
                .foregroundStyle(.tertiary)
                .padding(.leading, 6)
        }
    }

    @ToolbarContentBuilder private var keyboardDone: some ToolbarContent {
        ToolbarItemGroup(placement: .keyboard) {
            Spacer()
            Button("Xong") {
                commitTimeline()
                focused = nil
                isEditing = false
            }
        }
    }

    @ViewBuilder private var copyToastBanner: some View {
        if copyToast {
            Text("Đã sao chép")
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(.ultraThinMaterial, in: Capsule())
                .transition(.opacity)
        }
    }

    private var dictSheet: some View {
        NavigationStack {
            DictPopupView(
                lookup: sheetLookup ?? DictLookup(
                    surface: "", matched: "", reading: "", found: false, senses: [], message: ""
                ),
                sentenceJA: cue.textJA,
                sentenceEN: cue.textEN,
                sentenceVI: cue.textVI,
                onSave: { d in
                    let word = d.matched.isEmpty ? d.surface : d.matched
                    let meaning = [d.primaryVI, d.primaryEN].filter { !$0.isEmpty }.joined(separator: " / ")
                    modelContext.insert(Vocabulary(
                        word: word,
                        reading: d.reading,
                        meaning: meaning.isEmpty ? "—" : meaning
                    ))
                    modelContext.saveAndScheduleBackup()
                    selectedToken = nil
                },
                onClose: { selectedToken = nil }
            )
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Đóng") { selectedToken = nil }
                }
            }
        }
        .presentationDetents([.medium])
    }

    /// Equal-width cells spanning the row: start · + · × · Copy · Edit
    private var metaBar: some View {
        HStack(spacing: 6 * s) {
            metaCell {
                if isEditing {
                    TextField("Start", text: $startText)
                        .textFieldStyle(.plain)
                        .keyboardType(.decimalPad)
                        .focused($focused, equals: .start)
                        .font(.system(size: 12 * s, weight: .semibold).monospacedDigit())
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .onSubmit { commitTimeline() }
                } else {
                    Text(startText)
                        .font(.system(size: 12 * s, weight: .semibold).monospacedDigit())
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .contentShape(Rectangle())
                        .onTapGesture { onSeek(cue.startTime) }
                        .accessibilityHint("Chạm để tua")
                }
            }

            metaCell {
                Button(action: addAfter) {
                    Image(systemName: "plus")
                        .font(.system(size: 14 * s, weight: .bold))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Thêm cue sau")
            }

            metaCell {
                Button { confirmDelete = true } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14 * s, weight: .bold))
                        .foregroundStyle(.red.opacity(0.85))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Xóa cue")
            }

            metaCell {
                Button("Copy") { copyCue("full") }
                    .font(.system(size: 12 * s, weight: .semibold))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .buttonStyle(.borderless)
            }

            metaCell {
                Button(isEditing ? "Xong" : "Edit") {
                    if isEditing {
                        commitTimeline()
                        focused = nil
                        isEditing = false
                    } else {
                        isEditing = true
                        focused = .ja
                    }
                }
                    .font(.system(size: 12 * s, weight: .semibold))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .buttonStyle(.borderless)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: metaH)
    }

    private func metaCell<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .frame(maxWidth: .infinity, minHeight: metaH, maxHeight: metaH)
            .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 6 * s))
    }

    private func reportEditing() {
        onEditingChanged?(isEditing || focused != nil)
    }

    private func syncTimeFields() {
        startText = CueTiming.formatInput(ms: cue.startTime)
    }

    private func commitTimeline() {
        guard let start = CueTiming.parseInput(startText) else {
            syncTimeFields()
            return
        }
        // Keep duration; only move start (no end field).
        cue.applyTimeline(
            startMs: start,
            endMs: start + max(cue.duration, CueTiming.minDurMs),
            neighbors: neighbors.isEmpty ? [cue] : neighbors
        )
        syncTimeFields()
        onSave()
    }

    private func addAfter() {
        _ = ScriptCue.addCue(after: cue, context: modelContext)
        onSave()
    }

    private func copyCue(_ format: String) {
        UIPasteboard.general.string = cue.copyText(format: format)
        withAnimation { copyToast = true }
        Task {
            try? await Task.sleep(nanoseconds: 900_000_000)
            await MainActor.run { withAnimation { copyToast = false } }
        }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run { onSave() }
        }
    }
}
