import Foundation

enum YouTubeURL {
    /// Extract 11-char video id from watch / youtu.be / embed / shorts / raw id.
    static func videoID(from input: String) -> String? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.range(of: #"^[A-Za-z0-9_-]{11}$"#, options: .regularExpression) != nil {
            return trimmed
        }
        guard let url = URL(string: trimmed), let host = url.host?.lowercased() else { return nil }

        if host.contains("youtu.be") {
            let id = url.path.split(separator: "/").first.map(String.init)
            return valid(id)
        }

        let parts = url.path.split(separator: "/").map(String.init)
        if let i = parts.firstIndex(of: "embed") ?? parts.firstIndex(of: "shorts") ?? parts.firstIndex(of: "live"),
           i + 1 < parts.count {
            return valid(parts[i + 1])
        }

        if let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems {
            return valid(items.first(where: { $0.name == "v" })?.value)
        }
        return nil
    }

    private static func valid(_ id: String?) -> String? {
        guard let id, id.range(of: #"^[A-Za-z0-9_-]{11}$"#, options: .regularExpression) != nil else { return nil }
        return id
    }
}
