import Foundation

enum CaptionService {
    /// Load cues via ANDROID Innertube captionTracks → timedtext baseUrl (plain ?lang= is empty now).
    static func fetchCues(videoId: String) async -> [Cue] {
        let tracks = await androidCaptionTracks(videoId: videoId)
        let ordered = tracks.sorted { score($0) > score($1) }
        for track in ordered {
            if let cues = await fetchTimedtext(baseUrl: track.baseUrl), !cues.isEmpty {
                return cues
            }
        }
        // Last-ditch legacy URLs (usually empty on current YouTube).
        for lang in ["ja", "ja-JP", "en"] {
            if let cues = await fetchLegacy(videoId: videoId, lang: lang), !cues.isEmpty {
                return cues
            }
        }
        return []
    }

    private struct Track {
        let lang: String
        let kind: String
        let baseUrl: String
    }

    private static func score(_ t: Track) -> Int {
        var s = 0
        let lang = t.lang.lowercased()
        if lang.hasPrefix("ja") { s += 100 }
        else if lang.hasPrefix("en") { s += 40 }
        if t.kind != "asr" { s += 25 }
        return s
    }

    private static func androidCaptionTracks(videoId: String) async -> [Track] {
        let clients: [[String: Any]] = [
            ["clientName": "ANDROID", "clientVersion": "20.10.38", "androidSdkVersion": 30, "hl": "ja", "gl": "JP"],
            ["clientName": "ANDROID", "clientVersion": "19.44.38", "androidSdkVersion": 30, "hl": "ja", "gl": "JP"],
        ]
        for client in clients {
            let body: [String: Any] = [
                "context": ["client": client],
                "videoId": videoId,
                "contentCheckOk": true,
                "racyCheckOk": true,
            ]
            guard let data = try? JSONSerialization.data(withJSONObject: body),
                  let url = URL(string: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false") else { continue }

            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("com.google.android.youtube/20.10.38 (Linux; U; Android 13) gzip", forHTTPHeaderField: "User-Agent")
            req.httpBody = data

            guard let (respData, _) = try? await URLSession.shared.data(for: req),
                  let json = try? JSONSerialization.jsonObject(with: respData) as? [String: Any],
                  let captions = json["captions"] as? [String: Any],
                  let renderer = captions["playerCaptionsTracklistRenderer"] as? [String: Any],
                  let list = renderer["captionTracks"] as? [[String: Any]], !list.isEmpty else { continue }

            return list.compactMap { row in
                guard let base = row["baseUrl"] as? String, base.contains("/api/timedtext") else { return nil }
                return Track(
                    lang: row["languageCode"] as? String ?? "",
                    kind: row["kind"] as? String ?? "",
                    baseUrl: base
                )
            }
        }
        return []
    }

    private static func fetchTimedtext(baseUrl: String) async -> [Cue]? {
        var urls = [baseUrl]
        if !baseUrl.contains("fmt=") {
            let sep = baseUrl.contains("?") ? "&" : "?"
            urls.append(baseUrl + sep + "fmt=json3")
            urls.append(baseUrl + sep + "fmt=srv3")
        }
        for raw in urls {
            guard let url = URL(string: raw) else { continue }
            var req = URLRequest(url: url)
            req.setValue("*/*", forHTTPHeaderField: "Accept")
            req.setValue("https://www.youtube.com/", forHTTPHeaderField: "Referer")
            req.setValue("Mozilla/5.0", forHTTPHeaderField: "User-Agent")
            guard let (data, response) = try? await URLSession.shared.data(for: req),
                  let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !text.isEmpty else { continue }
            let cues = SubtitleParser.parseTimedtext(body: text)
            if !cues.isEmpty { return cues }
        }
        return nil
    }

    private static func fetchLegacy(videoId: String, lang: String) async -> [Cue]? {
        guard var comps = URLComponents(string: "https://www.youtube.com/api/timedtext") else { return nil }
        comps.queryItems = [
            URLQueryItem(name: "v", value: videoId),
            URLQueryItem(name: "lang", value: lang),
            URLQueryItem(name: "fmt", value: "json3"),
        ]
        guard let url = comps.url else { return nil }
        var req = URLRequest(url: url)
        req.setValue("https://www.youtube.com/", forHTTPHeaderField: "Referer")
        guard let (data, response) = try? await URLSession.shared.data(for: req),
              let http = response as? HTTPURLResponse, http.statusCode == 200,
              let text = String(data: data, encoding: .utf8), !text.isEmpty else { return nil }
        let cues = SubtitleParser.parseTimedtext(body: text)
        return cues.isEmpty ? nil : cues
    }
}
