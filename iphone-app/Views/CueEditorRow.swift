import SwiftUI
import SwiftData
import UIKit

/// Timestamp + JA + VI (+ stable ĐANG PHÁT). No cue menu / EN / inline edit chrome.
struct CueEditorRow: View {
    @Bindable var cue: ScriptCue
    var isActive: Bool = false
    /// Side-panel text scale (1 = default).
    var fontScale: Double = 1.0
    let onSeek: (Double) -> Void

    @Environment(\.modelContext) private var modelContext
    @State private var selectedToken: Token?
    @State private var sheetLookup: DictLookup?

    private var s: CGFloat { CGFloat(max(0.7, min(1.8, fontScale))) }
    private var metaH: CGFloat { 32 * s }

    var body: some View {
        VStack(alignment: .leading, spacing: 6 * s) {
            metaBar
            jaBlock
            viBlock
        }
        .padding(.vertical, 8)
        .onChange(of: selectedToken) { _, tok in
            if let tok {
                sheetLookup = DictionaryService.shared.lookup(surface: tok.surface, lemma: tok.lemma)
            } else {
                sheetLookup = nil
            }
        }
        .sheet(item: $selectedToken) { _ in dictSheet }
    }

    @ViewBuilder private var jaBlock: some View {
        if !cue.textJA.isEmpty {
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
        if let vi = cue.textVI, !vi.isEmpty {
            Text(vi)
                .font(.system(size: 14 * s, weight: .semibold))
                .foregroundStyle(Color.primary.opacity(0.78))
                .padding(.leading, 6)
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
                    Vocabulary.upsert(word: word, reading: d.reading, meaning: meaning.isEmpty ? "—" : meaning, context: modelContext)
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

    /// Timestamp + ĐANG PHÁT badge (stable height via opacity — no list flash).
    private var metaBar: some View {
        HStack(spacing: 6 * s) {
            Text(CueTiming.formatInput(ms: cue.startTime))
                .font(.system(size: 12 * s, weight: .semibold).monospacedDigit())
                .frame(minWidth: 52 * s)
                .padding(.horizontal, 8 * s)
                .frame(height: metaH)
                .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 6 * s))
                .contentShape(Rectangle())
                .onTapGesture { onSeek(cue.startTime) }
                .accessibilityHint("Chạm để tua")

            Text("ĐANG PHÁT")
                .font(.system(size: 9 * s, weight: .bold))
                .foregroundStyle(Color(red: 0.45, green: 0.82, blue: 0.90))
                .opacity(isActive ? 1 : 0)
                .accessibilityHidden(!isActive)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .frame(height: metaH)
    }
}
