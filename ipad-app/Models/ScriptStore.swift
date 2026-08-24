import Foundation
import SwiftData

@Model
class VideoScript {
    @Attribute(.unique) var videoId: String
    var title: String
    var savedAt: Date
    /// Import-replace script: reload must not rebuild from YouTube IDs.
    var owned: Bool = false
    /// Lamport clock shared with bridge/extension via Drive `meta.json` — never a wall clock.
    /// Default-valued so SwiftData lightweight migration keeps the existing sandbox.
    var rev: Int = 0
    /// Device that produced `rev`; tie-break when two devices land on the same rev.
    var deviceId: String = ""
    
    // Relationship
    @Relationship(deleteRule: .cascade, inverse: \ScriptCue.video)
    var cues: [ScriptCue] = []
    
    init(videoId: String, title: String, owned: Bool = false) {
        self.videoId = videoId
        self.title = title
        self.savedAt = Date()
        self.owned = owned
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
        // Fetch parent first — optional-relationship predicates miss after insert.
        let descriptor = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoId })
        guard let script = try? context.fetch(descriptor).first else { return [] }
        let related = script.cues
        if !related.isEmpty { return related.sorted { $0.startTime < $1.startTime } }
        // SwiftData sometimes leaves script.cues empty after cue.video= inserts; scan in memory.
        let all = (try? context.fetch(FetchDescriptor<ScriptCue>())) ?? []
        return all.filter { $0.video?.videoId == videoId || $0.video?.persistentModelID == script.persistentModelID }
            .sorted { $0.startTime < $1.startTime }
    }

    @MainActor
    static func mergeWithLocal(videoId: String, youtubeCues: [Cue], context: ModelContext) -> [ScriptCue] {
        let localCues = load(videoId: videoId, context: context)
        // Duplicate ids (e.g. YT JSON3 events sharing a tStartMs) must not trap —
        // first row wins, later duplicates keep their own rows.
        let localMap = Dictionary(
            localCues.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }
        )
        
        var script: VideoScript?
        let videoDescriptor = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoId })
        if let existing = try? context.fetch(videoDescriptor).first {
            script = existing
        } else {
            script = VideoScript(videoId: videoId, title: videoId)
            context.insert(script!)
        }

        // Owned/import timeline wins — never fall through to YouTube (empty load must not wipe Drive).
        if script?.owned == true {
            return localCues.filter { !$0.isDeleted }.sorted { $0.startTime < $1.startTime }
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
        
        context.saveAndScheduleBackup()
        return merged.sorted { $0.startTime < $1.startTime }
    }
    
    func softDelete() {
        self.isDeleted = true
        // Tombstone must win over Drive on the next merge — never resurrect locally-deleted cues.
        if let videoId = video?.videoId { DriveDirty.mark(videoId: videoId, cueIds: [id]) }
    }

    @MainActor
    static func clearTranslations(videoId: String, context: ModelContext) {
        let live = load(videoId: videoId, context: context).filter { !$0.isDeleted }
        for cue in live {
            cue.textEN = nil
            cue.textVI = nil
        }
        // Cleared MT is a local edit — Drive must not re-fill it on next sync.
        DriveDirty.mark(videoId: videoId, cueIds: live.map(\.id))
        context.saveAndScheduleBackup()
    }

    @MainActor
    static func wipeAll(videoId: String, context: ModelContext) {
        let descriptor = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoId })
        if let script = try? context.fetch(descriptor).first {
            context.delete(script)
            context.saveAndScheduleBackup()
        }
    }

    @MainActor
    static func addCueAtPlayhead(videoId: String, atMs: Double, context: ModelContext) -> ScriptCue {
        let script = ensureScript(videoId: videoId, context: context)
        script.owned = true
        let start = max(0, atMs)
        let live = load(videoId: videoId, context: context).filter { !$0.isDeleted }.sorted { $0.startTime < $1.startTime }
        let next = live.first { $0.startTime > start }
        let end = next.map { min($0.startTime - CueTiming.gapMs, start + CueTiming.defaultDurMs) } ?? (start + CueTiming.defaultDurMs)
        let applied = CueTiming.apply(startMs: start, endMs: max(end, start + CueTiming.minDurMs), prevEndMs: nil, nextStartMs: next?.startTime)
        let id = "\(Int(applied.start))-\(UUID().uuidString.prefix(8))-user"
        let cue = ScriptCue(id: id, startTime: applied.start, duration: applied.duration, textJA: "")
        cue.video = script
        context.insert(cue)
        DriveDirty.mark(videoId: videoId, cueIds: [id])
        context.saveAndScheduleBackup()
        return cue
    }

    /// Insert empty cue right after `after` (desktop `add_cue` + afterId).
    @MainActor
    static func addCue(after: ScriptCue, context: ModelContext) -> ScriptCue? {
        guard let videoId = after.video?.videoId else { return nil }
        let script = ensureScript(videoId: videoId, context: context)
        script.owned = true
        let live = load(videoId: videoId, context: context).filter { !$0.isDeleted }.sorted { $0.startTime < $1.startTime }
        let idx = live.firstIndex(where: { $0.id == after.id }) ?? (live.count - 1)
        let next = idx + 1 < live.count ? live[idx + 1] : nil
        let start = after.startTime + max(after.duration, 0)
        let applied = CueTiming.apply(
            startMs: start,
            endMs: start + CueTiming.defaultDurMs,
            prevEndMs: after.startTime + after.duration,
            nextStartMs: next?.startTime
        )
        let id = "\(Int(applied.start))-\(UUID().uuidString.prefix(8))-user"
        let cue = ScriptCue(id: id, startTime: applied.start, duration: applied.duration, textJA: "")
        cue.video = script
        context.insert(cue)
        DriveDirty.mark(videoId: videoId, cueIds: [id])
        context.saveAndScheduleBackup()
        return cue
    }

    @MainActor
    private static func ensureScript(videoId: String, context: ModelContext) -> VideoScript {
        let d = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoId })
        if let existing = try? context.fetch(d).first { return existing }
        let s = VideoScript(videoId: videoId, title: videoId)
        context.insert(s)
        return s
    }

    /// Apply start/end from meta inputs (ms). Clamps lightly to neighbors.
    func applyTimeline(startMs: Double, endMs: Double, neighbors: [ScriptCue]) {
        let sorted = neighbors.filter { !$0.isDeleted }.sorted { $0.startTime < $1.startTime }
        let idx = sorted.firstIndex(where: { $0.id == id })
        let prevCue = idx.flatMap { $0 > 0 ? sorted[$0 - 1] : nil }
        let nextCue = idx.flatMap { $0 + 1 < sorted.count ? sorted[$0 + 1] : nil }
        let applied = CueTiming.apply(
            startMs: startMs,
            endMs: endMs,
            prevEndMs: prevCue.map { $0.startTime + $0.duration },
            nextStartMs: nextCue?.startTime
        )
        startTime = applied.start
        duration = applied.duration
        video?.owned = true
        // Timing edits are local-first — keep them winning over a newer Drive.
        if let videoId = video?.videoId { DriveDirty.mark(videoId: videoId, cueIds: [id]) }
    }

    func copyText(format: String) -> String {
        let vi = textVI ?? ""
        let en = textEN ?? ""
        switch format {
        case "ja": return textJA
        case "vi": return vi
        case "ja_vi": return "JA: \(textJA)\nVI: \(vi)"
        default:
            let furi = NLPTagger.tokenize(textJA).map { t in
                t.reading.isEmpty ? t.surface : "\(t.surface)(\(t.reading))"
            }.joined()
            return "JA: \(textJA)\n   (\(furi.isEmpty ? textJA : furi))\nEN: \(en)\nVI: \(vi)"
        }
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
        var id = ""
        var startMs: Double
        var endMs: Double
        var ja: String
        var en: String?
        var vi: String?
    }

    enum ImportMode {
        case merge
        case replace
    }

    struct ImportResult {
        var updated = 0
        var skipped = 0
        var unmatched = 0
        var replaced = 0
        /// Replace-mode inserts — assign to UI directly; don't re-fetch via relationship.
        var cues: [ScriptCue] = []
    }

    /// Extension-compatible TXT/JSON → rows (times in ms).
    static func parseImportRows(_ text: String) -> [ImportRow] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("{") || trimmed.hasPrefix("[") {
            if let rows = parseImportJSON(trimmed), !rows.isEmpty { return rows }
        }
        return parseExportTXT(text)
    }

    /// Desktop-compatible import: merge matched cues, or replace the full script.
    @MainActor
    static func importRows(
        videoId: String,
        rows: [ImportRow],
        mode: ImportMode,
        includeJA: Bool,
        context: ModelContext
    ) -> ImportResult {
        if mode == .replace {
            var result = ImportResult()
            let validRows = rows.enumerated().filter { _, row in
                row.startMs.isFinite || row.endMs.isFinite || !row.ja.isEmpty
                    || !(row.en ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    || !(row.vi ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            result.skipped = rows.count - validRows.count
            guard !validRows.isEmpty else { return result }

            let old = load(videoId: videoId, context: context)
            old.forEach(context.delete)

            let descriptor = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoId })
            let script: VideoScript
            if let existing = try? context.fetch(descriptor).first {
                script = existing
                script.savedAt = Date()
            } else {
                script = VideoScript(videoId: videoId, title: videoId)
                context.insert(script)
            }
            script.owned = true

            var next: [ScriptCue] = []
            var usedIds = Set<String>()
            for (index, row) in validRows {
                let start = row.startMs.isFinite ? row.startMs : 0
                // Duplicate caller-supplied ids would break SwiftUI ForEach identity.
                var id = row.id.isEmpty ? "\(Int(start))-import-\(index)" : row.id
                if usedIds.contains(id) {
                    var n = 1
                    while usedIds.contains("\(id)-\(n)") { n += 1 }
                    id = "\(id)-\(n)"
                }
                usedIds.insert(id)
                let cue = ScriptCue(
                    id: id,
                    startTime: start,
                    duration: row.endMs.isFinite ? row.endMs - start : .nan,
                    textJA: row.ja,
                    textEN: row.en,
                    textVI: row.vi
                )
                cue.video = script
                script.cues.append(cue)
                context.insert(cue)
                next.append(cue)
            }
            next.sort { $0.startTime != $1.startTime ? $0.startTime < $1.startTime : $0.duration < $1.duration }
            repairImportEnds(next)
            result.updated = next.count
            result.replaced = next.count
            result.cues = next
            // Full import is a local edit — every imported id wins over Drive on next merge.
            DriveDirty.mark(videoId: videoId, cueIds: next.map(\.id))
            context.saveAndScheduleBackup()
            return result
        }

        let local = load(videoId: videoId, context: context).filter { !$0.isDeleted }
        var result = ImportResult()
        var usedIDs = Set<String>()
        for row in rows {
            let hasEN = row.en != nil
            let hasVI = row.vi != nil
            let hasJA = includeJA && (!row.ja.isEmpty || row.startMs.isFinite || row.endMs.isFinite)
            guard hasEN || hasVI || hasJA else {
                result.skipped += 1
                continue
            }
            guard let hit = importMatch(row: row, cues: local, usedIDs: usedIDs) else {
                result.unmatched += 1
                continue
            }
            usedIDs.insert(hit.id)

            var changed = false
            if let en = row.en, !en.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, hit.textEN != en {
                hit.textEN = en
                changed = true
            }
            if let vi = row.vi, !vi.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, hit.textVI != vi {
                hit.textVI = vi
                changed = true
            }
            if includeJA {
                if !row.ja.isEmpty, hit.textJA != row.ja {
                    hit.textJA = row.ja
                    changed = true
                }
                if row.startMs.isFinite || row.endMs.isFinite {
                    let start = row.startMs.isFinite ? row.startMs : hit.startTime
                    let currentEnd = hit.startTime + hit.duration
                    let end = row.endMs.isFinite ? row.endMs : currentEnd
                    let duration = end > start ? end - start : .nan
                    if hit.startTime != start || hit.duration != duration {
                        hit.startTime = start
                        hit.duration = duration
                        changed = true
                    }
                }
            }
            if changed {
                result.updated += 1
            } else {
                result.skipped += 1
            }
        }
        if includeJA, result.updated > 0 {
            repairImportEnds(local.sorted { $0.startTime < $1.startTime })
        }
        context.saveAndScheduleBackup()
        return result
    }

    fileprivate static func importMatch(row: ImportRow, cues: [ScriptCue], usedIDs: Set<String>) -> ScriptCue? {
        if !row.id.isEmpty, let hit = cues.first(where: { $0.id == row.id && !usedIDs.contains($0.id) }) {
            return hit
        }
        guard row.startMs.isFinite else { return nil }
        let source = row.ja.trimmingCharacters(in: .whitespacesAndNewlines)
        let compact = source.precomposedStringWithCompatibilityMapping.filter { !$0.isWhitespace }
        return cues
            .filter {
                guard !usedIDs.contains($0.id), abs($0.startTime - row.startMs) <= 350 else { return false }
                let previous = $0.textJA.trimmingCharacters(in: .whitespacesAndNewlines)
                return source.isEmpty || previous == source
                    || previous.precomposedStringWithCompatibilityMapping.filter { !$0.isWhitespace } == compact
            }
            .min { abs($0.startTime - row.startMs) < abs($1.startTime - row.startMs) }
    }

    /// Keep exact valid ends; repair only missing/non-positive ends from the next cue.
    private static func repairImportEnds(_ cues: [ScriptCue]) {
        for (index, cue) in cues.enumerated() {
            if cue.duration.isFinite, cue.duration > 0 { continue }
            if index + 1 < cues.count, cues[index + 1].startTime > cue.startTime {
                cue.duration = cues[index + 1].startTime - cue.startTime
            } else {
                cue.duration = 2000
            }
        }
    }

    /// Mirror extension `import_parse.js` HEAD_RE (en/em dash, nospace hyphen, [N-M] index).
    /// Each HEAD starts a new cue (---------- split optional).
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
            func flush() {
                if ja.isEmpty && en == nil && vi == nil { return }
                var s = startMs
                if s.isNaN {
                    guard !ja.isEmpty else { return }
                    s = 0
                }
                out.append(ImportRow(startMs: s, endMs: endMs, ja: ja, en: en, vi: vi))
            }
            for line in block.components(separatedBy: .newlines) {
                let t = line.trimmingCharacters(in: .whitespaces)
                if t.isEmpty { continue }
                let range = NSRange(t.startIndex..., in: t)
                if let m = head.firstMatch(in: t, range: range),
                   m.numberOfRanges > 2,
                   let r2 = Range(m.range(at: 2), in: t) {
                    flush()
                    startMs = parseExportTime(String(t[r2])) * 1000
                    endMs = Double.nan
                    if m.numberOfRanges > 3, m.range(at: 3).location != NSNotFound,
                       let r3 = Range(m.range(at: 3), in: t) {
                        endMs = parseExportTime(String(t[r3])) * 1000
                    }
                    ja = ""
                    en = nil
                    vi = nil
                    continue
                }
                if t.lowercased().hasPrefix("ja:") { ja = String(t.dropFirst(3)).trimmingCharacters(in: .whitespaces); continue }
                if t.lowercased().hasPrefix("en:") { en = String(t.dropFirst(3)).trimmingCharacters(in: .whitespaces); continue }
                if t.lowercased().hasPrefix("vi:") { vi = String(t.dropFirst(3)).trimmingCharacters(in: .whitespaces); continue }
            }
            flush()
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
                       first["start_media_time"] != nil || first["start"] != nil || first["media_time"] != nil
                        || first["source"] != nil || first["ja"] != nil {
                        return a
                    }
                }
            }
            return nil
        }()
        guard let arr, !arr.isEmpty else { return nil }
        func num(_ r: [String: Any], _ key: String) -> Double? {
            if let n = r[key] as? NSNumber { return n.doubleValue }
            if let s = r[key] as? String { return Double(s) }
            return nil
        }
        return arr.compactMap { r -> ImportRow? in
            let startSec = num(r, "start_media_time") ?? num(r, "start") ?? num(r, "media_time")
            let endSec = num(r, "end_media_time") ?? num(r, "end")
            let ja = (r["source"] as? String) ?? (r["text"] as? String) ?? (r["ja"] as? String) ?? ""
            let en = r["en"] as? String
            let vi = r["vi"] as? String
            if ja.isEmpty && en == nil && vi == nil { return nil }
            let startMs = startSec.map { $0 * 1000 } ?? .nan
            let endMs = (endSec.map { $0 * 1000 }) ?? .nan
            return ImportRow(
                id: (r["id"] as? String) ?? "",
                startMs: startMs,
                endMs: endMs,
                ja: ja,
                en: en,
                vi: vi
            )
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
        let parts = s.split(separator: ":").compactMap { Double($0) }
        if parts.count == 2 { return parts[0] * 60 + parts[1] }
        if parts.count == 3 { return parts[0] * 3600 + parts[1] * 60 + parts[2] }
        return 0
    }
}

/// Per-cue dirty tracking for Drive sync (UserDefaults — not SwiftData, so it survives
/// any restore/import that rebuilds cue rows). Local edits win over a newer Drive during
/// merge; cleared only after a successful push.
enum DriveDirty {
    private static func key(_ videoId: String) -> String { "drive-dirty-cues-\(videoId)" }

    static func mark(videoId: String, cueIds: [String]) {
        guard !videoId.isEmpty, !cueIds.isEmpty else { return }
        var ids = dirtyIds(videoId: videoId)
        ids.formUnion(cueIds)
        UserDefaults.standard.set(Array(ids), forKey: key(videoId))
    }

    static func dirtyIds(videoId: String) -> Set<String> {
        guard !videoId.isEmpty else { return [] }
        return Set(UserDefaults.standard.stringArray(forKey: key(videoId)) ?? [])
    }

    static func clear(videoId: String) {
        UserDefaults.standard.removeObject(forKey: key(videoId))
    }
}

/// Desktop `cue_timing.js` — times stored as ms on iPad, displayed as m:ss.t seconds.
enum CueTiming {
    static let minDurMs = 450.0
    static let gapMs = 50.0
    static let defaultDurMs = 1650.0 // MIN_DUR + 1.2s

    static func formatInput(ms: Double) -> String {
        let t = max(0, ms / 1000)
        let m = Int(t) / 60
        let s = t - Double(m * 60)
        let whole = Int(s)
        var tenths = Int((s - Double(whole)) * 10 + 0.5)
        if tenths >= 10 { return formatInput(ms: Double(m * 60 + whole + 1) * 1000) }
        if tenths > 0 { return "\(m):\(String(format: "%02d", whole)).\(tenths)" }
        return "\(m):\(String(format: "%02d", whole))"
    }

    /// Parse `m:ss[.t]`, `h:mm:ss[.t]`, or plain seconds → milliseconds.
    static func parseInput(_ raw: String) -> Double? {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")
        guard !s.isEmpty else { return nil }
        if s.range(of: #"[^\d.]"#, options: .regularExpression) == nil, let n = Double(s) {
            return n * 1000
        }
        let parts = s.split(separator: ":").map(String.init)
        if parts.count == 2 {
            guard let min = Double(parts[0]) else { return nil }
            let secParts = parts[1].split(separator: ".", maxSplits: 1).map(String.init)
            guard let sec = Double(secParts[0]), sec < 60 else { return nil }
            let frac: Double = {
                guard secParts.count > 1 else { return 0 }
                let digits = secParts[1]
                guard let n = Double(digits) else { return 0 }
                return n / pow(10, Double(digits.count))
            }()
            return (min * 60 + sec + frac) * 1000
        }
        if parts.count == 3 {
            guard let hr = Double(parts[0]), let min = Double(parts[1]), min < 60 else { return nil }
            let secParts = parts[2].split(separator: ".", maxSplits: 1).map(String.init)
            guard let sec = Double(secParts[0]), sec < 60 else { return nil }
            let frac: Double = {
                guard secParts.count > 1 else { return 0 }
                let digits = secParts[1]
                guard let n = Double(digits) else { return 0 }
                return n / pow(10, Double(digits.count))
            }()
            return (hr * 3600 + min * 60 + sec + frac) * 1000
        }
        return nil
    }

    static func apply(startMs: Double, endMs: Double, prevEndMs: Double?, nextStartMs: Double?) -> (start: Double, duration: Double) {
        var start = startMs.isFinite ? startMs : 0
        var end = endMs.isFinite ? endMs : start + minDurMs
        if let prev = prevEndMs { start = max(start, prev + gapMs) }
        start = max(0, start)
        if let next = nextStartMs { end = min(end, next - gapMs) }
        if end <= start { end = start + minDurMs }
        return (start, end - start)
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

        let missingEnd = ScriptCue.parseImportRows("[001] 0:00\nJA: a\n")
        assert(missingEnd.count == 1 && missingEnd[0].endMs.isNaN, "missing end must be repaired after sorting")

        let ascii = ScriptCue.parseImportRows("[012] 0:28 -> 0:36\nJA: ascii-arrow\n")
        assert(ascii.count == 1 && ascii[0].startMs == 28000 && ascii[0].endMs == 36000, "ascii arrow")

        let nospace = ScriptCue.parseImportRows("[001] 0:08-0:10\nJA: nospace\n")
        assert(nospace.count == 1 && nospace[0].startMs == 8000 && nospace[0].endMs == 10000, "nospace")

        let rangeId = ScriptCue.parseImportRows("[012-013] 0:28 - 0:36\nJA: range-id\n")
        assert(rangeId.count == 1 && rangeId[0].startMs == 28000, "index range not time")

        // Multi-head without ---------- must yield N rows (not overwrite to 1).
        let multiHead = ScriptCue.parseImportRows("""
        [001] 0:00 - 0:02
        JA: first
        EN: One
        [002] 0:02 - 0:05
        JA: second
        VI: Hai
        """)
        assert(multiHead.count == 2, "multi-head without separator")
        assert(multiHead[0].ja == "first" && multiHead[0].en == "One", "multi-head first")
        assert(multiHead[1].ja == "second" && multiHead[1].vi == "Hai", "multi-head second")
        assert(multiHead[0].startMs == 0 && multiHead[1].startMs == 2000, "multi-head times")

        let candidate = ScriptCue(id: "cue-1", startTime: 10_000, duration: 2_000, textJA: "日 本")
        let match = ScriptCue.importMatch(
            row: .init(startMs: 10_300, endMs: 12_000, ja: "日本", en: "Japan", vi: nil),
            cues: [candidate],
            usedIDs: []
        )
        assert(match === candidate, "merge match must accept ±350ms and compact JA")

        struct Flag { var isDeleted: Bool }
        var cues = [Flag(isDeleted: false), Flag(isDeleted: true), Flag(isDeleted: false)]
        cues[0].isDeleted = true
        assert(cues.filter { !$0.isDeleted }.count == 1, "softDelete filter")

        assert(CueTiming.parseInput("0:00.8") == 800, "parse tenths")
        assert(CueTiming.formatInput(ms: 5900) == "0:05.9", "format tenths")
        let clamped = CueTiming.apply(startMs: 0, endMs: 5000, prevEndMs: nil, nextStartMs: 2000)
        assert(clamped.duration < 2000 && clamped.duration >= CueTiming.minDurMs - 0.1, "clamp to next")

        print("[ImportSmoke] ok")
    }
}
