import Foundation

struct Cue: Identifiable, Codable {
    let id: String
    let startTime: Double // milliseconds
    var duration: Double  // milliseconds
    let text: String
    var isDeleted: Bool = false
}

enum SubtitleParser {

    /// YT JSON3/XML commonly emits several events with the same tStartMs — ids must
    /// stay unique or SwiftData/UI breaks. First occurrence keeps the bare id so
    /// previously cached cues still match; later ones get a suffix.
    private static func uniqueId(_ base: String, used: inout Set<String>) -> String {
        var id = base
        var n = 1
        while used.contains(id) {
            id = "\(base)-\(n)"
            n += 1
        }
        used.insert(id)
        return id
    }

    /// Auto-detect JSON3 or timedtext XML.
    static func parseTimedtext(body: String) -> [Cue] {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        if trimmed.first == "{" { return parseJSON3(payload: trimmed) }
        if trimmed.first == "<" { return parseXML(trimmed) }
        return []
    }

    static func parseJSON3(payload: String) -> [Cue] {
        guard let data = payload.data(using: .utf8) else { return [] }
        var cues: [Cue] = []
        var usedIds = Set<String>()

        do {
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let events = json["events"] as? [[String: Any]] else { return [] }

            for event in events {
                // YT JSON3 may encode numbers as Int or Double — `as? Int` drops many events.
                guard let tStartMs = jsonNumber(event["tStartMs"]) else { continue }
                let dDurationMs = jsonNumber(event["dDurationMs"]) ?? 3000
                let segs = event["segs"] as? [[String: Any]] ?? []
                var text = ""
                for seg in segs {
                    if let utf8 = seg["utf8"] as? String { text += utf8 }
                }
                text = text.trimmingCharacters(in: .whitespacesAndNewlines)
                if text.isEmpty { continue }

                cues.append(Cue(
                    id: uniqueId("\(Int(tStartMs))", used: &usedIds),
                    startTime: tStartMs,
                    duration: dDurationMs,
                    text: text
                ))
            }
        } catch {
            print("Error parsing JSON3: \(error)")
            return []
        }

        return normalizeCues(cues: cues)
    }

    /// timedtext format=3: `<p t="ms" d="ms">…</p>` (and legacy `<text start dur>`).
    static func parseXML(_ xml: String) -> [Cue] {
        var cues: [Cue] = []
        var usedIds = Set<String>()

        let pRe = try! NSRegularExpression(pattern: #"<p\s+([^>]*)>([\s\S]*?)</p>"#, options: [.caseInsensitive])
        let range = NSRange(xml.startIndex..., in: xml)
        pRe.enumerateMatches(in: xml, range: range) { match, _, _ in
            guard let match,
                  let attrR = Range(match.range(at: 1), in: xml),
                  let bodyR = Range(match.range(at: 2), in: xml) else { return }
            let attrs = String(xml[attrR])
            guard let t = attrDouble(attrs, name: "t") else { return }
            let d = attrDouble(attrs, name: "d") ?? 3000
            let raw = String(xml[bodyR])
            let text = decodeEntities(stripTags(raw))
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty { return }
            cues.append(Cue(id: uniqueId("\(Int(t))", used: &usedIds), startTime: t, duration: d, text: text))
        }

        if cues.isEmpty {
            let textRe = try! NSRegularExpression(pattern: #"<text\s+([^>]*)>([\s\S]*?)</text>"#, options: [.caseInsensitive])
            textRe.enumerateMatches(in: xml, range: range) { match, _, _ in
                guard let match,
                      let attrR = Range(match.range(at: 1), in: xml),
                      let bodyR = Range(match.range(at: 2), in: xml) else { return }
                let attrs = String(xml[attrR])
                let startSec = attrDouble(attrs, name: "start") ?? 0
                let durSec = attrDouble(attrs, name: "dur") ?? 2
                let text = decodeEntities(stripTags(String(xml[bodyR])))
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if text.isEmpty { return }
                let startMs = startSec * 1000
                cues.append(Cue(id: uniqueId("\(Int(startMs))", used: &usedIds), startTime: startMs, duration: durSec * 1000, text: text))
            }
        }

        return normalizeCues(cues: cues)
    }

    /// Port of extension/content/normalize_cues.js (SFX drop/strip) + end-clamp.
    static func normalizeCues(cues: [Cue]) -> [Cue] {
        var out: [Cue] = []
        for c in cues.sorted(by: { $0.startTime < $1.startTime }) {
            let raw = c.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if raw.isEmpty || isSfxLabelOnly(raw) { continue }
            let cleaned = stripSfxTokens(raw)
            if cleaned.isEmpty || isSfxLabelOnly(cleaned) { continue }
            out.append(Cue(id: c.id, startTime: c.startTime, duration: c.duration, text: cleaned, isDeleted: c.isDeleted))
        }

        for i in 0..<out.count where i < out.count - 1 {
            let end = out[i].startTime + out[i].duration
            let next = out[i + 1].startTime
            if end > next {
                out[i].duration = max(0, next - out[i].startTime)
            }
        }
        return out
    }

    /// Active cue at playhead (ms). Hold through gaps until next start; last cue gets +150ms grace (matches ScriptCue.active).
    static func activeCue(in cues: [Cue], atMs: Double) -> Cue? {
        let graceMs = 150.0
        var live = cues.filter { !$0.isDeleted }
        if live.count > 1 {
            for i in 1..<live.count where live[i].startTime < live[i - 1].startTime {
                live.sort { $0.startTime < $1.startTime }
                break
            }
        }
        for (i, c) in live.enumerated() {
            let end = c.startTime + max(c.duration, 0)
            let holdEnd = i + 1 < live.count ? live[i + 1].startTime : end + graceMs
            if atMs >= c.startTime && atMs < holdEnd { return c }
            if atMs < c.startTime { return nil }
        }
        return nil
    }

    static func jsonNumber(_ any: Any?) -> Double? {
        if let n = any as? Double { return n }
        if let n = any as? Int { return Double(n) }
        if let n = any as? NSNumber { return n.doubleValue }
        if let s = any as? String { return Double(s) }
        return nil
    }

    // MARK: - Helpers

    private static func attrDouble(_ attrs: String, name: String) -> Double? {
        let re = try! NSRegularExpression(pattern: #"\b\#(name)="([\d.]+)""#)
        let range = NSRange(attrs.startIndex..., in: attrs)
        guard let m = re.firstMatch(in: attrs, range: range),
              let r = Range(m.range(at: 1), in: attrs) else { return nil }
        return Double(attrs[r])
    }

    private static func stripTags(_ s: String) -> String {
        s.replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
    }

    private static func decodeEntities(_ s: String) -> String {
        var t = s
        let map = [("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&apos;", "'"), ("&#39;", "'")]
        for (a, b) in map { t = t.replacingOccurrences(of: a, with: b) }
        return t
    }

    private static let bracketOnly = try! NSRegularExpression(
        pattern: #"^[\[［【(（][^\]］】)）]+[\]］】)）]$"#
    )
    private static let sfxToken = try! NSRegularExpression(
        pattern: #"[\[［【][^\]］】]*[\]］】]"#
    )
    private static let sfxSoundParen = try! NSRegularExpression(
        pattern: #"[（(][^）)]*音[）)]"#
    )
    private static let musicSym = try! NSRegularExpression(pattern: #"[♪🎵♫]+"#)

    private static func isMusicOnly(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return !t.isEmpty && t.range(of: #"^[♪🎵♫\s]+$"#, options: .regularExpression) != nil
    }

    private static func isSfxLabelOnly(_ text: String) -> Bool {
        let t = text
            .precomposedStringWithCompatibilityMapping
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty || isMusicOnly(t) { return true }
        let range = NSRange(t.startIndex..., in: t)
        return bracketOnly.firstMatch(in: t, range: range) != nil
    }

    private static func stripSfxTokens(_ text: String) -> String {
        var s = text as NSString
        for re in [sfxToken, sfxSoundParen, musicSym] {
            s = re.stringByReplacingMatches(in: s as String, range: NSRange(location: 0, length: s.length), withTemplate: "") as NSString
        }
        return (s as String)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
