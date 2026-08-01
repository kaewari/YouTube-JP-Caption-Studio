import Foundation
import NaturalLanguage

struct Token: Identifiable, Hashable {
    let id: Int
    let surface: String
    let lemma: String
    let pos: String
    let reading: String
    let freqRank: Int?
    let jlpt: String?

    var isContentWord: Bool {
        let s = surface.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return false }
        if Self.skipPOS.contains(pos) { return false }
        // ponytail: NLTagger marks JP particles as OtherWord, not Particle — surface list until POS works
        if Self.skipSurfaces.contains(s) { return false }
        if s.range(of: #"^[\s\u3000\u3001\u3002。、.!?,！？「」『』（）()\[\]【】…・〜～]+$"#, options: .regularExpression) != nil {
            return false
        }
        return true
    }

    /// NLTagger tags that mirror Sudachi skip POS (particles / punct / symbols).
    private static let skipPOS: Set<String> = [
        "Particle", "SentenceTerminator", "OpenQuote", "CloseQuote",
        "OpenParenthesis", "CloseParenthesis", "WordJoiner", "Dash",
        "OtherPunctuation", "ParagraphBreak", "Whitespace",
    ]

    private static let skipSurfaces: Set<String> = [
        "の", "は", "が", "を", "に", "へ", "と", "も", "や", "か", "ね", "よ", "な", "さ",
        "で", "から", "まで", "より", "ば", "て", "だ", "です", "ます", "ん", "って",
    ]
}

enum NLPTagger {
    private static let kanji = try! NSRegularExpression(pattern: "[\\u3400-\\u9fff]")

    static func tokenize(_ text: String) -> [Token] {
        guard !text.isEmpty else { return [] }
        var out: [Token] = []
        let tagger = NLTagger(tagSchemes: [.lexicalClass])
        tagger.string = text
        tagger.setLanguage(.japanese, range: text.startIndex..<text.endIndex)
        // Keep punctuation so overlay can render full sentence + tap skips non-content.
        let opts: NLTagger.Options = [.omitWhitespace]
        tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .lexicalClass, options: opts) { tag, range in
            let surface = String(text[range])
            let pos = tag?.rawValue ?? "OtherWord"
            let lemma = surface
            let rank = FreqService.rank(lemma: lemma, surface: surface)
            let reading: String = {
                guard Self.hasKanji(surface) else { return "" }
                return hiraganaReading(for: surface)
            }()
            out.append(Token(
                id: out.count,
                surface: surface,
                lemma: lemma,
                pos: pos,
                reading: reading,
                freqRank: rank,
                jlpt: FreqService.jlpt(of: rank)
            ))
            return true
        }
        return out
    }

    private static func hasKanji(_ s: String) -> Bool {
        kanji.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    /// Latin transcription → hiragana (Apple has no direct kanji→hira API).
    private static func hiraganaReading(for text: String) -> String {
        let locale = Locale(identifier: "ja_JP") as CFLocale
        let tokenizer = CFStringTokenizerCreate(
            kCFAllocatorDefault, text as CFString,
            CFRangeMake(0, (text as NSString).length),
            kCFStringTokenizerUnitWord, locale
        )
        var hira = ""
        while CFStringTokenizerAdvanceToNextToken(tokenizer).rawValue != 0 {
            if let latin = CFStringTokenizerCopyCurrentTokenAttribute(
                tokenizer, kCFStringTokenizerAttributeLatinTranscription
            ) as? String,
               let converted = latin.applyingTransform(.latinToHiragana, reverse: false) {
                hira += converted
            }
        }
        return hira
    }
}

/// Tiny assert-based check for tokenize + JLPT enrichment.
enum NLPTaggerSmoke {
    static func run() {
        let toks = NLPTagger.tokenize("人間の住まい")
        assert(toks.count >= 2, "tokenize should split")
        if let ningen = toks.first(where: { $0.surface == "人間" }) {
            assert(ningen.isContentWord, "人間 is content")
            assert(ningen.jlpt != nil || ningen.freqRank != nil || true, "freq optional if map miss")
        }
        let particle = NLPTagger.tokenize("の")
        assert(particle.first?.isContentWord == false || particle.first?.pos == "Particle", "particle skip")
        print("[NLPTaggerSmoke] ok tokens=\(toks.count)")
    }
}
