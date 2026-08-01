import Foundation
import SQLite3

struct DictSense: Hashable {
    var glossEN: [String]
    var glossVI: [String]
    var reading: String
}

struct DictLookup: Hashable {
    var surface: String
    var matched: String
    var reading: String
    var found: Bool
    var senses: [DictSense]
    var message: String

    var primaryVI: String {
        var parts: [String] = []
        for s in senses.prefix(4) {
            for g in s.glossVI where !g.isEmpty && !parts.contains(g) { parts.append(g) }
        }
        return parts.prefix(5).joined(separator: ", ")
    }

    var primaryEN: String {
        var parts: [String] = []
        for s in senses.prefix(4) {
            for g in s.glossEN where !g.isEmpty && !parts.contains(g) { parts.append(g) }
        }
        return parts.prefix(4).joined(separator: "; ")
    }
}

/// Read-only lookup against bundled `dict.sqlite` — mirrors local-bridge `/dict`.
final class DictionaryService {
    static let shared = DictionaryService()

    private var db: OpaquePointer?
    private let punct = CharacterSet(charactersIn: "　 \t\n\r。、．，！？!?,;:「」『』（）()[]【】…・〜～\"'")

    private init() {
        guard let path = Bundle.main.path(forResource: "dict", ofType: "sqlite") else {
            print("[DictionaryService] dict.sqlite missing from bundle")
            return
        }
        // Bundle is read-only; WAL DBs look "open" but return empty rows without immutable=1.
        let uri = "file://\(path)?mode=ro&immutable=1"
        if sqlite3_open_v2(uri, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_URI, nil) != SQLITE_OK {
            print("[DictionaryService] open failed")
            db = nil
        }
    }

    deinit {
        if let db { sqlite3_close(db) }
    }

    func lookup(surface: String, lemma: String = "") -> DictLookup {
        let raw = surface.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty, db != nil else {
            return DictLookup(surface: surface, matched: "", reading: "", found: false, senses: [], message: "empty")
        }

        let candidates = expandCandidates(surface: raw, lemma: lemma)
        for key in candidates {
            let (senses, reading) = sensesForKey(key)
            if !senses.isEmpty {
                let enriched = enrichVI(senses, key: key)
                return DictLookup(surface: raw, matched: key, reading: reading, found: true, senses: enriched, message: "")
            }
        }

        // Longest prefix fallback
        var bestKey = ""
        var best: [DictSense] = []
        var bestReading = ""
        for cand in candidates {
            guard let pref = longestPrefix(cand) else { continue }
            let (s, r) = sensesForKey(pref)
            if !s.isEmpty, pref.count > bestKey.count {
                bestKey = pref
                best = s
                bestReading = r
            }
        }
        if !best.isEmpty {
            return DictLookup(
                surface: raw, matched: bestKey, reading: bestReading, found: true,
                senses: enrichVI(best, key: bestKey), message: ""
            )
        }
        return DictLookup(surface: raw, matched: "", reading: "", found: false, senses: [], message: "không có trong từ điển")
    }

    /// Legacy one-liner list (CueEditorRow "Tra từ").
    func searchWord(_ word: String) -> [String] {
        let d = lookup(surface: word)
        guard d.found else { return d.message.isEmpty ? [] : [d.message] }
        var lines: [String] = []
        if !d.primaryVI.isEmpty { lines.append("VI: \(d.primaryVI)") }
        if !d.primaryEN.isEmpty { lines.append("EN: \(d.primaryEN)") }
        return lines
    }

    // MARK: - Candidates

    private func expandCandidates(surface: String, lemma: String) -> [String] {
        var out: [String] = []
        var seen = Set<String>()
        func add(_ s: String) {
            let v = s.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: punct)
            guard !v.isEmpty, !seen.contains(v) else { return }
            seen.insert(v)
            out.append(v)
            for alt in scriptVariants(v) where !seen.contains(alt) {
                seen.insert(alt)
                out.append(alt)
            }
        }
        add(surface)
        add(lemma)
        for base in [surface, lemma] {
            let t = base.trimmingCharacters(in: punct)
            if t.count > 1 {
                let last = String(t.suffix(1))
                if "はがをにでとものへや".contains(last) { add(String(t.dropLast())) }
            }
            // Kanji head + optional る (best-effort stem)
            let head = String(t.prefix(while: { ("\u{3400}"..."\u{9fff}").contains($0) }))
            if head.count >= 1, head.count < t.count {
                add(head)
                add(head + "る")
            }
        }
        return out.sorted { $0.count != $1.count ? $0.count > $1.count : $0 < $1 }
    }

    private func scriptVariants(_ text: String) -> [String] {
        let hira = text.applyingTransform(.hiraganaToKatakana, reverse: true) ?? text
        let kata = text.applyingTransform(.hiraganaToKatakana, reverse: false) ?? text
        return [text, hira, kata].filter { !$0.isEmpty }
    }

    private func longestPrefix(_ text: String) -> String? {
        let t = text.trimmingCharacters(in: punct)
        guard !t.isEmpty else { return nil }
        let maxLen = min(t.count, 16)
        for n in stride(from: maxLen, through: 1, by: -1) {
            let cand = String(t.prefix(n))
            if hasKey(cand) { return cand }
            for alt in scriptVariants(cand) where alt != cand && hasKey(alt) { return alt }
        }
        return nil
    }

    private func hasKey(_ key: String) -> Bool {
        guard let db else { return false }
        return exists(db: db, sql: """
            SELECT 1 FROM jmdict WHERE expression = ?
            UNION ALL SELECT 1 FROM javi WHERE expression = ?
            UNION ALL SELECT 1 FROM jmdict_vi WHERE expression = ?
            LIMIT 1
            """, binds: [key, key, key])
    }

    // MARK: - Sense building

    private func sensesForKey(_ key: String) -> ([DictSense], String) {
        var senses: [DictSense] = []
        var reading = ""
        for entry in queryJmdict(key) {
            reading = reading.isEmpty ? (entry.reading) : reading
            for s in entry.senses {
                let sr = s.reading.isEmpty ? reading : s.reading
                senses.append(DictSense(
                    glossEN: s.glossEN,
                    glossVI: viGlosses(for: key, reading: sr),
                    reading: sr
                ))
            }
        }
        if senses.isEmpty {
            let vi = viGlosses(for: key, reading: "")
            if !vi.isEmpty {
                senses.append(DictSense(glossEN: [], glossVI: vi, reading: reading))
            }
        }
        return (senses, reading)
    }

    private func enrichVI(_ senses: [DictSense], key: String) -> [DictSense] {
        senses.map { s in
            var vi = s.glossVI
            if vi.isEmpty { vi = viGlosses(for: key, reading: s.reading) }
            if vi.isEmpty { vi = viFromEN(s.glossEN) }
            return DictSense(glossEN: s.glossEN, glossVI: vi, reading: s.reading)
        }
    }

    private func viGlosses(for key: String, reading: String) -> [String] {
        for cand in scriptVariants(key) {
            if let arr = queryJavi(cand), !arr.isEmpty { return Array(arr.prefix(8)) }
        }
        var byReading: [String: [String]] = [:]
        for cand in scriptVariants(key) {
            byReading = queryJmdictVI(cand)
            if !byReading.isEmpty { break }
        }
        if byReading.isEmpty { return [] }
        if !reading.isEmpty, let hit = byReading[reading] { return Array(hit.prefix(8)) }
        let hira = reading.applyingTransform(.hiraganaToKatakana, reverse: true) ?? reading
        if !hira.isEmpty, let hit = byReading[hira] { return Array(hit.prefix(8)) }
        if let hit = byReading[""] { return Array(hit.prefix(8)) }
        return Array((byReading.values.first ?? []).prefix(8))
    }

    private func viFromEN(_ glossEN: [String]) -> [String] {
        var out: [String] = []
        var seen = Set<String>()
        for gloss in glossEN.prefix(2) {
            for lemma in enLemmas(gloss).prefix(1) {
                for vi in queryEnVI(lemma).prefix(5) {
                    let k = vi.lowercased()
                    if seen.insert(k).inserted { out.append(vi) }
                    if out.count >= 5 { return out }
                }
            }
            if !out.isEmpty { break }
        }
        return out
    }

    private func enLemmas(_ gloss: String) -> [String] {
        var s = gloss
        if let re = try? NSRegularExpression(pattern: #"\([^)]*\)"#) {
            s = re.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: " ")
        }
        s = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if let re = try? NSRegularExpression(pattern: #"^(to|a|an|the)\s+"#, options: .caseInsensitive) {
            s = re.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: "")
        }
        let words = s.lowercased().split{ !$0.isLetter }.map(String.init).filter { !$0.isEmpty }
        guard let first = words.first else { return [] }
        var keys = [first]
        if words.count >= 2 { keys.append(words[0] + " " + words[1]) }
        return keys
    }

    // MARK: - SQL

    private struct JmEntry {
        var reading: String
        var senses: [(glossEN: [String], reading: String)]
    }

    private func queryJmdict(_ key: String) -> [JmEntry] {
        guard let db, let payload = stringColumn(db: db, sql: "SELECT payload FROM jmdict WHERE expression = ?", binds: [key]),
              let data = payload.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return root.map { entry in
            let reading = entry["reading"] as? String ?? ""
            let senses = (entry["senses"] as? [[String: Any]] ?? []).map { s in
                (glossEN: s["gloss_en"] as? [String] ?? [], reading: (s["reading"] as? String) ?? reading)
            }
            return JmEntry(reading: reading, senses: senses)
        }
    }

    private func queryJavi(_ key: String) -> [String]? {
        guard let db, let json = stringColumn(db: db, sql: "SELECT glosses FROM javi WHERE expression = ?", binds: [key]) else { return nil }
        return decodeStringArray(json)
    }

    private func queryJmdictVI(_ key: String) -> [String: [String]] {
        guard let db else { return [:] }
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_prepare_v2(db, "SELECT reading, glosses FROM jmdict_vi WHERE expression = ?", -1, &stmt, nil) == SQLITE_OK else { return [:] }
        bind(stmt, 1, key)
        var out: [String: [String]] = [:]
        while sqlite3_step(stmt) == SQLITE_ROW {
            let reading = String(cString: sqlite3_column_text(stmt, 0))
            let glosses = String(cString: sqlite3_column_text(stmt, 1))
            out[reading] = decodeStringArray(glosses) ?? []
        }
        return out
    }

    private func queryEnVI(_ lemma: String) -> [String] {
        guard let db,
              let json = stringColumn(db: db, sql: "SELECT glosses FROM en_vi WHERE lemma = ?", binds: [lemma.lowercased()]) else { return [] }
        return decodeStringArray(json) ?? []
    }

    private func stringColumn(db: OpaquePointer, sql: String, binds: [String]) -> String? {
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
        for (i, b) in binds.enumerated() { bind(stmt, Int32(i + 1), b) }
        guard sqlite3_step(stmt) == SQLITE_ROW, let c = sqlite3_column_text(stmt, 0) else { return nil }
        return String(cString: c)
    }

    private func exists(db: OpaquePointer, sql: String, binds: [String]) -> Bool {
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return false }
        for (i, b) in binds.enumerated() { bind(stmt, Int32(i + 1), b) }
        return sqlite3_step(stmt) == SQLITE_ROW
    }

    private func bind(_ stmt: OpaquePointer?, _ i: Int32, _ s: String) {
        sqlite3_bind_text(stmt, i, (s as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    }

    private func decodeStringArray(_ json: String) -> [String]? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode([String].self, from: data)
    }
}

enum DictionarySmoke {
    static func run() {
        let d = DictionaryService.shared.lookup(surface: "人間")
        assert(d.found, "人間 should be in jmdict")
        assert(!d.primaryEN.isEmpty || !d.primaryVI.isEmpty, "need EN or VI gloss")
        print("[DictionarySmoke] ok found=\(d.found) vi=\(d.primaryVI.prefix(40)) en=\(d.primaryEN.prefix(40))")
    }
}
