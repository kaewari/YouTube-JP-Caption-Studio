import SwiftUI
import SwiftData

struct CueEditorRow: View {
    @Bindable var cue: ScriptCue
    var isActive: Bool = false
    /// Side-panel text scale (1 = default).
    var fontScale: Double = 1.0
    let onSeek: (Double) -> Void
    let onSave: () -> Void

    @State private var dictHits: [String] = []
    @State private var saveTask: Task<Void, Never>?

    private var s: CGFloat { CGFloat(max(0.7, min(1.8, fontScale))) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8 * s) {
            HStack {
                Button(action: { onSeek(cue.startTime) }) {
                    Text(formatTime(cue.startTime))
                        .font(.system(size: 15 * s, weight: isActive ? .bold : .semibold).monospacedDigit())
                        .foregroundStyle(isActive ? Color.primary : Color.primary.opacity(0.88))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            isActive
                                ? Color(red: 0.08, green: 0.30, blue: 0.36).opacity(0.22)
                                : Color.primary.opacity(0.06),
                            in: Capsule()
                        )
                }
                .buttonStyle(.plain)

                if isActive {
                    Text("ĐANG PHÁT")
                        .font(.system(size: 12 * s, weight: .bold))
                        .foregroundStyle(Color(red: 0.45, green: 0.82, blue: 0.90))
                }

                Spacer()

                Button("Tra từ") {
                    dictHits = DictionaryService.shared.searchWord(cue.textJA)
                }
                .font(.system(size: 12 * s))
                .buttonStyle(.borderless)

                Button(role: .destructive, action: {
                    cue.softDelete()
                    onSave()
                }) {
                    Image(systemName: "trash")
                        .font(.system(size: 12 * s))
                }
                // List swallows .plain taps; borderless matches "Tra từ".
                .buttonStyle(.borderless)
                .foregroundStyle(.red)
            }

            // ponytail: iOS cannot force IME; JA keyboard is user/OS choice
            TextField("Japanese", text: $cue.textJA, axis: .vertical)
                .font(.system(size: 17 * s, weight: isActive ? .semibold : .medium))
                .foregroundStyle(.primary)
                .textFieldStyle(.roundedBorder)
                .onChange(of: cue.textJA) { _, _ in scheduleSave() }

            TextField("English (Optional)", text: Binding(
                get: { cue.textEN ?? "" },
                set: { cue.textEN = $0.isEmpty ? nil : $0 }
            ), axis: .vertical)
                .font(.system(size: 16 * s))
                .textFieldStyle(.roundedBorder)
                .onChange(of: cue.textEN) { _, _ in scheduleSave() }

            TextField("Vietnamese (Optional)", text: Binding(
                get: { cue.textVI ?? "" },
                set: { cue.textVI = $0.isEmpty ? nil : $0 }
            ), axis: .vertical)
                .font(.system(size: 16 * s))
                .textFieldStyle(.roundedBorder)
                .onChange(of: cue.textVI) { _, _ in scheduleSave() }

            if !dictHits.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(dictHits, id: \.self) { line in
                        Text(line)
                            .font(.system(size: 12 * s))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run { onSave() }
        }
    }

    private func formatTime(_ ms: Double) -> String {
        let total = Int(ms / 1000)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
