import Foundation

/// Lemma → frequency rank (Language Reactor style). Bundled `freq_ja.json`.
enum FreqService {
    private static var map: [String: Int] = {
        guard let url = Bundle.main.url(forResource: "freq_ja", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let raw = try? JSONDecoder().decode([String: Int].self, from: data) else {
            print("[FreqService] freq_ja.json missing")
            return [:]
        }
        return raw
    }()

    static func rank(lemma: String, surface: String = "") -> Int? {
        if let r = map[lemma], r > 0 { return r }
        if !surface.isEmpty, let r = map[surface], r > 0 { return r }
        return nil
    }

    /// Rough JLPT band from frequency rank (mirrors local-bridge `vocab_freq.jlpt_of`).
    static func jlpt(of rank: Int?) -> String? {
        guard let r = rank, r > 0 else { return nil }
        if r <= 800 { return "n5" }
        if r <= 1500 { return "n4" }
        if r <= 3000 { return "n3" }
        if r <= 6000 { return "n2" }
        return "n1"
    }
}
