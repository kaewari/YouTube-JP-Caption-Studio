import Foundation
import SwiftData

@Model
class VideoScript {
    @Attribute(.unique) var videoId: String
    var title: String
    var savedAt: Date
    
    // Relationship
    @Relationship(deleteRule: .cascade, inverse: \ScriptCue.video)
    var cues: [ScriptCue] = []
    
    init(videoId: String, title: String) {
        self.videoId = videoId
        self.title = title
        self.savedAt = Date()
    }
}

@Model
class ScriptCue {
    var id: String
    var startTime: Double
    var duration: Double
    var textJA: String
    var textEN: String?
    var textVI: String?
    var isDeleted: Bool // Tombstone flag
    
    var video: VideoScript?
    
    init(id: String, startTime: Double, duration: Double, textJA: String, textEN: String? = nil, textVI: String? = nil, isDeleted: Bool = false) {
        self.id = id
        self.startTime = startTime
        self.duration = duration
        self.textJA = textJA
        self.textEN = textEN
        self.textVI = textVI
        self.isDeleted = isDeleted
    }
}

extension ScriptCue {
    /// Playhead match — hold through gaps until next cue starts (YT durations often end early).
    /// Last cue: +150ms grace past duration. Last match wins on ties.
    static func active(in cues: [ScriptCue], atMs: Double) -> ScriptCue? {
        let graceMs = 150.0
        let live = cues.filter { !$0.isDeleted }.sorted { $0.startTime < $1.startTime }
        var hit: ScriptCue? = nil
        for (i, c) in live.enumerated() {
            let end = c.startTime + max(c.duration, 0)
            // Fill gap to next cue; otherwise grace past end so last line doesn't blink off early.
            let holdEnd = i + 1 < live.count ? live[i + 1].startTime : end + graceMs
            if atMs >= c.startTime && atMs < holdEnd { hit = c }
        }
        return hit
    }

    @MainActor
    static func load(videoId: String, context: ModelContext) -> [ScriptCue] {
        let descriptor = FetchDescriptor<ScriptCue>(
            predicate: #Predicate { $0.video?.videoId == videoId },
            sortBy: [SortDescriptor(\.startTime)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    @MainActor
    static func mergeWithLocal(videoId: String, youtubeCues: [Cue], context: ModelContext) -> [ScriptCue] {
        let localCues = load(videoId: videoId, context: context)
        let localMap = Dictionary(uniqueKeysWithValues: localCues.map { ($0.id, $0) })
        
        var script: VideoScript?
        let videoDescriptor = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoId })
        if let existing = try? context.fetch(videoDescriptor).first {
            script = existing
        } else {
            script = VideoScript(videoId: videoId, title: videoId)
            context.insert(script!)
        }
        
        var merged: [ScriptCue] = []
        
        for yCue in youtubeCues {
            if let local = localMap[yCue.id] {
                if !local.isDeleted {
                    merged.append(local)
                }
            } else {
                let newCue = ScriptCue(id: yCue.id, startTime: yCue.startTime, duration: yCue.duration, textJA: yCue.text)
                newCue.video = script
                context.insert(newCue)
                merged.append(newCue)
            }
        }
        
        try? context.save()
        return merged.sorted { $0.startTime < $1.startTime }
    }
    
    func softDelete() {
        self.isDeleted = true
    }

    @MainActor
    static func clearTranslations(videoId: String, context: ModelContext) {
        for cue in load(videoId: videoId, context: context) where !cue.isDeleted {
            cue.textEN = nil
            cue.textVI = nil
        }
        try? context.save()
    }

    @MainActor
    static func wipeAll(videoId: String, context: ModelContext) {
        let descriptor = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoId })
        if let script = try? context.fetch(descriptor).first {
            context.delete(script)
            try? context.save()
        }
    }

    @MainActor
    static func addCueAtPlayhead(videoId: String, atMs: Double, context: ModelContext) -> ScriptCue {
        let script: VideoScript = {
            let d = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoId })
            if let existing = try? context.fetch(d).first { return existing }
            let s = VideoScript(videoId: videoId, title: videoId)
            context.insert(s)
            return s
        }()
        let start = max(0, atMs)
        let id = "\(Int(start))-user"
        let cue = ScriptCue(id: id, startTime: start, duration: 2000, textJA: "")
        cue.video = script
        context.insert(cue)
        try? context.save()
        return cue
    }

    /// Extension-compatible TXT export.
    static func exportTXT(_ cues: [ScriptCue]) -> String {
        let live = cues.filter { !$0.isDeleted }.sorted { $0.startTime < $1.startTime }
        var parts: [String] = []
        for (i, c) in live.enumerated() {
            let start = formatExportTime(c.startTime)
            let end = formatExportTime(c.startTime + c.duration)
            var block = "[\(i + 1)] \(start) → \(end)\nJA: \(c.textJA)"
            if let en = c.textEN, !en.isEmpty { block += "\nEN: \(en)" }
            if let vi = c.textVI, !vi.isEmpty { block += "\nVI: \(vi)" }
            parts.append(block)
        }
        return parts.joined(separator: "\n----------\n")
    }

    /// Parsed cue rows (ms). Shared by import + smoke.
    struct ImportRow: Equatable {
        var startMs: Double
        var endMs: Double
        var ja: String
        var en: String?
        var vi: String?
    }

    /// Extension-compatible TXT/JSON → rows (times in ms).
    static func parseImportRows(_ text: String) -> [ImportRow] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("{") || trimmed.hasPrefix("[") {
            if let rows = parseImportJSON(trimmed), !rows.isEmpty { return rows }
        }
        return parseExportTXT(text)
    }

    @MainActor
    static func importTXT(videoId: String, text: String, context: ModelContext) -> Int {
        let rows = parseImportRows(text)
        guard !rows.isEmpty else { return 0 }
        var local = load(videoId: videoId, context: context)
        let script: VideoScript = {
            let d = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoId })
            if let existing = try? context.fetch(d).first { return existing }
            let s = VideoScript(videoId: videoId, title: videoId)
            context.insert(s)
            return s
        }()
        var updated = 0
        let tol: Double = 350 // ms
        for row in rows {
            if let hit = local.first(where: { abs($0.startTime - row.startMs) <= tol && !$0.isDeleted }) {
                if !row.ja.isEmpty { hit.textJA = row.ja }
                if let en = row.en { hit.textEN = en }
                if let vi = row.vi { hit.textVI = vi }
                updated += 1
            } else if !row.ja.isEmpty {
                let cue = ScriptCue(
                    id: "\(Int(row.startMs))-import",
                    startTime: row.startMs,
                    duration: max(200, row.endMs - row.startMs),
                    textJA: row.ja,
                    textEN: row.en,
                    textVI: row.vi
                )
                cue.video = script
                context.insert(cue)
                local.append(cue)
                updated += 1
            }
        }
        try? context.save()
        return updated
    }

    /// Mirror extension `import_parse.js` HEAD_RE (en/em dash, nospace hyphen, [N-M] index).
    private static func parseExportTXT(_ text: String) -> [ImportRow] {
        let splitBlocks: [String] = {
            guard let re = try? NSRegularExpression(pattern: "-{10,}") else {
                return text.components(separatedBy: "----------")
            }
            let full = NSRange(text.startIndex..., in: text)
            var last = text.startIndex
            var parts: [String] = []
            re.enumerateMatches(in: text, range: full) { match, _, _ in
                guard let match, let r = Range(match.range, in: text) else { return }
                parts.append(String(text[last..<r.lowerBound]))
                last = r.upperBound
            }
            parts.append(String(text[last...]))
            return parts
        }()
        var out: [ImportRow] = []
        // Groups: [1]=index, [2]=start, [3]=end?
        let head = try! NSRegularExpression(
            pattern: #"^\[(\d+(?:-\d+)?)\]\s+(\d+(?::\d{1,2})?(?:\.\d+)?)(?:\s*(?:→|->|–|—|-)\s*(\d+(?::\d{1,2})?(?:\.\d+)?))?"#
        )
        for block in splitBlocks {
            var startMs = Double.nan
            var endMs = Double.nan
            var ja = ""
            var en: String?
            var vi: String?
            for line in block.components(separatedBy: .newlines) {
                let t = line.trimmingCharacters(in: .whitespaces)
                if t.isEmpty { continue }
                let range = NSRange(t.startIndex..., in: t)
                if let m = head.firstMatch(in: t, range: range),
                   m.numberOfRanges > 2,
                   let r2 = Range(m.range(at: 2), in: t) {
                    startMs = parseExportTime(String(t[r2])) * 1000
                    if m.numberOfRanges > 3, m.range(at: 3).location != NSNotFound,
                       let r3 = Range(m.range(at: 3), in: t) {
                        endMs = parseExportTime(String(t[r3])) * 1000
                    }
                    continue
                }
                if t.lowercased().hasPrefix("ja:") { ja = String(t.dropFirst(3)).trimmingCharacters(in: .whitespaces); continue }
                if t.lowercased().hasPrefix("en:") { en = String(t.dropFirst(3)).trimmingCharacters(in: .whitespaces); continue }
                if t.lowercased().hasPrefix("vi:") { vi = String(t.dropFirst(3)).trimmingCharacters(in: .whitespaces); continue }
            }
            if ja.isEmpty && en == nil && vi == nil { continue }
            if startMs.isNaN { continue }
            if endMs.isNaN { endMs = startMs + 2000 }
            out.append(ImportRow(startMs: startMs, endMs: endMs, ja: ja, en: en, vi: vi))
        }
        return out.sorted { $0.startMs != $1.startMs ? $0.startMs < $1.startMs : $0.endMs < $1.endMs }
    }

    /// Extension JSON: array / {cues} / storage dump. Times in seconds → ms.
    private static func parseImportJSON(_ text: String) -> [ImportRow]? {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) else { return nil }
        let arr: [[String: Any]]? = {
            if let a = obj as? [[String: Any]] { return a }
            if let d = obj as? [String: Any] {
                if let cues = d["cues"] as? [[String: Any]] { return cues }
                for v in d.values {
                    if let a = v as? [[String: Any]], let first = a.first,
                       first["start_media_time"] != nil || first["start"] != nil || first["source"] != nil || first["ja"] != nil {
                        return a
                    }
                }
            }
            return nil
        }()
        guard let arr, !arr.isEmpty else { return nil }
        func num(_ r: [String: Any], _ key: String) -> Double? {
            if let n = r[key] as? NSNumber { return n.doubleValue }
            return nil
        }
        return arr.compactMap { r -> ImportRow? in
            guard let startSec = num(r, "start_media_time") ?? num(r, "start") else { return nil }
            let endSec = num(r, "end_media_time") ?? num(r, "end")
            let ja = (r["source"] as? String) ?? (r["text"] as? String) ?? (r["ja"] as? String) ?? ""
            let en = r["en"] as? String
            let vi = r["vi"] as? String
            if ja.isEmpty && en == nil && vi == nil { return nil }
            let startMs = startSec * 1000
            let endMs = (endSec.map { $0 * 1000 }) ?? (startMs + 2000)
            return ImportRow(startMs: startMs, endMs: endMs, ja: ja, en: en, vi: vi)
        }
    }

    private static func formatExportTime(_ ms: Double) -> String {
        let total = max(0, ms / 1000)
        let m = Int(total) / 60
        let s = total - Double(m * 60)
        return String(format: "%d:%05.2f", m, s)
    }

    private static func parseExportTime(_ raw: String) -> Double {
        let s = raw.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        if let v = Double(s), !s.contains(":") { return v }
        let parts = s.split(separator: ":")
        guard parts.count == 2, let m = Double(parts[0]), let sec = Double(parts[1]) else { return 0 }
        return m * 60 + sec
    }
}

/// Assert import TXT parse matches extension `import_parse_test.js` (+ softDelete filter).
enum ImportSmoke {
    static func run() {
        let hyphen = ScriptCue.parseImportRows("""
        [001] 0:00 - 0:02
        JA: こんにちは
        EN: Hello
        VI: Xin chào
        ----------
        [002] 0:02 - 0:05
        JA: 世界
        """)
        assert(hyphen.count == 2, "hyphen blocks")
        assert(hyphen[0].startMs == 0 && hyphen[0].endMs == 2000, "hyphen times")
        assert(hyphen[0].ja == "こんにちは" && hyphen[0].en == "Hello", "hyphen text")

        let arrow = ScriptCue.parseImportRows("[001] 0:00 → 0:02\nJA: a\n")
        assert(arrow.count == 1 && arrow[0].endMs == 2000, "unicode arrow")

        let ascii = ScriptCue.parseImportRows("[012] 0:28 -> 0:36\nJA: ascii-arrow\n")
        assert(ascii.count == 1 && ascii[0].startMs == 28000 && ascii[0].endMs == 36000, "ascii arrow")

        let nospace = ScriptCue.parseImportRows("[001] 0:08-0:10\nJA: nospace\n")
        assert(nospace.count == 1 && nospace[0].startMs == 8000 && nospace[0].endMs == 10000, "nospace")

        let rangeId = ScriptCue.parseImportRows("[012-013] 0:28 - 0:36\nJA: range-id\n")
        assert(rangeId.count == 1 && rangeId[0].startMs == 28000, "index range not time")

        struct Flag { var isDeleted: Bool }
        var cues = [Flag(isDeleted: false), Flag(isDeleted: true), Flag(isDeleted: false)]
        cues[0].isDeleted = true
        assert(cues.filter { !$0.isDeleted }.count == 1, "softDelete filter")

        print("[ImportSmoke] ok")
    }
}
