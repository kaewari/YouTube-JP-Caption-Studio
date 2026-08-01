import Foundation
import SQLite3

/// Read-only lookup against bundled `dict.sqlite` (same schema as local-bridge).
final class DictionaryService {
    static let shared = DictionaryService()

    private var db: OpaquePointer?

    private init() {
        guard let path = Bundle.main.path(forResource: "dict", ofType: "sqlite") else {
            print("[DictionaryService] dict.sqlite missing from bundle")
            return
        }
        if sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) != SQLITE_OK {
            print("[DictionaryService] open failed")
            db = nil
        }
    }

    deinit {
        if let db { sqlite3_close(db) }
    }

    /// Gloss lines for a surface form (JA→VI curated, else JMDict EN).
    func searchWord(_ word: String) -> [String] {
        let key = word.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty, let db else { return [] }

        if let vi = stringColumn(db: db, sql: "SELECT glosses FROM javi WHERE expression = ?", bind: key),
           let arr = decodeStringArray(vi), !arr.isEmpty {
            return arr.map { "VI: \($0)" }
        }

        if let payload = stringColumn(db: db, sql: "SELECT payload FROM jmdict WHERE expression = ?", bind: key),
           let lines = glossesFromJmdictPayload(payload), !lines.isEmpty {
            return lines
        }

        return []
    }

    private func stringColumn(db: OpaquePointer, sql: String, bind: String) -> String? {
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
        sqlite3_bind_text(stmt, 1, (bind as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        guard sqlite3_step(stmt) == SQLITE_ROW,
              let c = sqlite3_column_text(stmt, 0) else { return nil }
        return String(cString: c)
    }

    private func decodeStringArray(_ json: String) -> [String]? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode([String].self, from: data)
    }

    private func glossesFromJmdictPayload(_ json: String) -> [String]? {
        guard let data = json.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return nil }
        var out: [String] = []
        for entry in root {
            let reading = entry["reading"] as? String ?? ""
            guard let senses = entry["senses"] as? [[String: Any]] else { continue }
            for sense in senses {
                let gloss = (sense["gloss_en"] as? [String])?.prefix(3).joined(separator: "; ") ?? ""
                let r = (sense["reading"] as? String) ?? reading
                if gloss.isEmpty { continue }
                out.append(r.isEmpty ? gloss : "[\(r)] \(gloss)")
                if out.count >= 5 { return out }
            }
        }
        return out
    }
}
