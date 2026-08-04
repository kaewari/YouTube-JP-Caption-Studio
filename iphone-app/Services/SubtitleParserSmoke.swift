import Foundation

/// Minimal assert-based smoke for normalize + playhead (ponytail: one runnable check).
enum SubtitleParserSmoke {
    static func run() {
        let raw = [
            Cue(id: "0", startTime: 0, duration: 2000, text: "【音楽】"),
            Cue(id: "1000", startTime: 1000, duration: 3000, text: "こんにちは【笑い】世界"),
            Cue(id: "1500", startTime: 1500, duration: 2000, text: "次の文"),
            Cue(id: "2000", startTime: 2000, duration: 1000, text: "♪"),
        ]
        let out = SubtitleParser.normalizeCues(cues: raw)
        assert(out.count == 2, "expected 2 cues after SFX drop, got \(out.count)")
        assert(out[0].text.contains("こんにちは"), out[0].text)
        assert(out[0].startTime + out[0].duration <= out[1].startTime + 0.001, "overlap not clamped")

        let xml = #"<p t="599" d="3000" w="1"><s ac="0">私はテスト</s></p>"#
        let xmlCues = SubtitleParser.parseXML(xml)
        assert(xmlCues.count == 1 && xmlCues[0].text.contains("テスト"), "xml parse failed")

        // Double-encoded JSON3 numbers must parse (WK/YT often use Double).
        let json3 = #"{"events":[{"tStartMs":1000.0,"dDurationMs":2000.0,"segs":[{"utf8":"こんにちは"}]},{"tStartMs":3500,"dDurationMs":1500,"segs":[{"utf8":"世界"}]}]}"#
        let j = SubtitleParser.parseJSON3(payload: json3)
        assert(j.count == 2, "json3 double numbers failed, got \(j.count)")
        assert(SubtitleParser.activeCue(in: j, atMs: 1500)?.text == "こんにちは", "active mid-cue")
        assert(SubtitleParser.activeCue(in: j, atMs: 999) == nil, "before first")
        assert(SubtitleParser.activeCue(in: j, atMs: 3600)?.text == "世界", "second cue")
        // first ends 3000, next at 3500 — hold through gap
        assert(SubtitleParser.activeCue(in: j, atMs: 3100)?.text == "こんにちは", "gap hold")
        assert(SubtitleParser.activeCue(in: j, atMs: 3499)?.text == "こんにちは", "until next start")
        assert(SubtitleParser.activeCue(in: j, atMs: 5500) == nil, "after last")

        // Short YT duration + long gap (0:00 cue dur 3s, next at 0:13)
        let gap = [
            Cue(id: "0", startTime: 0, duration: 3000, text: "first"),
            Cue(id: "13000", startTime: 13000, duration: 2000, text: "second"),
        ]
        assert(SubtitleParser.activeCue(in: gap, atMs: 5000)?.text == "first", "hold until next cue")
        assert(SubtitleParser.activeCue(in: gap, atMs: 12999)?.text == "first", "still first before 13s")
        assert(SubtitleParser.activeCue(in: gap, atMs: 13000)?.text == "second", "second at 13s")

        print("[SubtitleParserSmoke] ok")
    }
}
