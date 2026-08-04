import SwiftUI
import SwiftData

/// Dict popup: headword + VI/EN gloss + cue sentence EN/VI (desktop hardsub-dict parity).
struct DictPopupView: View {
    let lookup: DictLookup
    var sentenceJA: String = ""
    var sentenceEN: String? = nil
    var sentenceVI: String? = nil
    var onSave: ((DictLookup) -> Void)? = nil
    var onClose: () -> Void

    @AppStorage("dictShowSentence") private var showSentence = true

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(lookup.matched.isEmpty ? lookup.surface : lookup.matched)
                    .font(.title3.weight(.bold))
                if !lookup.reading.isEmpty {
                    Text(lookup.reading)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                if sentenceEN?.isEmpty == false || sentenceVI?.isEmpty == false || !sentenceJA.isEmpty {
                    Button {
                        showSentence.toggle()
                    } label: {
                        Image(systemName: showSentence ? "text.bubble.fill" : "text.bubble")
                            .font(.body)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Hiện/ẩn dịch câu")
                }
                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            if lookup.found {
                if !lookup.primaryVI.isEmpty {
                    glossRow(lang: "VI", text: lookup.primaryVI, emphasis: true)
                }
                if !lookup.primaryEN.isEmpty {
                    glossRow(lang: "EN", text: lookup.primaryEN, emphasis: false)
                }
                if lookup.primaryVI.isEmpty && lookup.primaryEN.isEmpty {
                    Text("không có nghĩa")
                        .foregroundStyle(.secondary)
                }
            } else {
                Text(lookup.message.isEmpty ? "không có trong từ điển" : lookup.message)
                    .foregroundStyle(.secondary)
            }

            if showSentence {
                let vi = (sentenceVI ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                let en = (sentenceEN ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                let ja = sentenceJA.trimmingCharacters(in: .whitespacesAndNewlines)
                if !vi.isEmpty || !en.isEmpty || !ja.isEmpty {
                    Divider()
                    if !vi.isEmpty {
                        Text(vi)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Color(red: 0.91, green: 0.91, blue: 0.94))
                    }
                    if !en.isEmpty {
                        Text(en)
                            .font(.subheadline)
                            .foregroundStyle(Color(red: 0.72, green: 0.74, blue: 0.82))
                    }
                    if vi.isEmpty && en.isEmpty, !ja.isEmpty {
                        Text(ja)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if lookup.found, onSave != nil {
                HStack {
                    Button("Lưu từ") { onSave?(lookup) }
                        .buttonStyle(.borderedProminent)
                    Spacer()
                }
            }
        }
        .padding(14)
        .frame(maxWidth: 360, alignment: .leading)
        // Solid dark — material over video looks muddy / janks with 30Hz overlay redraws
        .background(Color(red: 0.11, green: 0.12, blue: 0.15), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.white.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.35), radius: 16, y: 6)
    }

    private func glossRow(lang: String, text: String, emphasis: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(lang)
                .font(.caption.weight(.bold))
                .foregroundStyle(lang == "VI" ? Color(red: 0.45, green: 0.82, blue: 0.55) : Color(red: 0.55, green: 0.7, blue: 0.95))
                .frame(width: 22, alignment: .leading)
            Text(text)
                .font(emphasis ? .body.weight(.semibold) : .subheadline)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Shared presenter: lookup once on open + optional vocab save.
struct DictPopupHost: ViewModifier {
    @Binding var token: Token?
    var sentenceJA: String
    var sentenceEN: String?
    var sentenceVI: String?
    @Environment(\.modelContext) private var modelContext
    @State private var cachedLookup: DictLookup?

    func body(content: Content) -> some View {
        content
            .overlay {
                if let cachedLookup {
                    ZStack {
                        Color.black.opacity(0.001)
                            .ignoresSafeArea()
                            .onTapGesture { token = nil }
                        DictPopupView(
                            lookup: cachedLookup,
                            sentenceJA: sentenceJA,
                            sentenceEN: sentenceEN,
                            sentenceVI: sentenceVI,
                            onSave: { save($0) },
                            onClose: { token = nil }
                        )
                        .padding(20)
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                    }
                }
            }
            .onChange(of: token) { _, new in
                withAnimation(.easeOut(duration: 0.14)) {
                    if let t = new {
                        cachedLookup = DictionaryService.shared.lookup(surface: t.surface, lemma: t.lemma)
                    } else {
                        cachedLookup = nil
                    }
                }
            }
    }

    private func save(_ d: DictLookup) {
        let word = d.matched.isEmpty ? d.surface : d.matched
        let meaning = [d.primaryVI, d.primaryEN].filter { !$0.isEmpty }.joined(separator: " / ")
        Vocabulary.upsert(word: word, reading: d.reading, meaning: meaning.isEmpty ? "—" : meaning, context: modelContext)
        modelContext.saveAndScheduleBackup()
        token = nil
    }
}

extension View {
    func dictPopup(
        token: Binding<Token?>,
        sentenceJA: String,
        sentenceEN: String? = nil,
        sentenceVI: String? = nil
    ) -> some View {
        modifier(DictPopupHost(token: token, sentenceJA: sentenceJA, sentenceEN: sentenceEN, sentenceVI: sentenceVI))
    }
}
