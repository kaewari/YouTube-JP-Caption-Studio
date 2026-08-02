import Foundation

/// Thin Drive v3 REST — mirrors extension `driveChildren` / `driveGetText` / `drivePutText` /
/// `ensureVideoFolder`. Auth comes from `DriveAuthService`.
enum DriveAPIClient {
    static let folderMime = "application/vnd.google-apps.folder"
    static let apiBase = "https://www.googleapis.com/drive/v3"
    static let uploadBase = "https://www.googleapis.com/upload/drive/v3"

    // MARK: - URL builders (offline-testable)

    static func listURL(q: String, pageSize: Int = 200) -> URL {
        var comps = URLComponents(string: "\(apiBase)/files")!
        comps.queryItems = [
            URLQueryItem(name: "q", value: q),
            URLQueryItem(name: "fields", value: "files(id,name)"),
            URLQueryItem(name: "pageSize", value: String(pageSize)),
            URLQueryItem(name: "supportsAllDrives", value: "true"),
            URLQueryItem(name: "includeItemsFromAllDrives", value: "true"),
        ]
        return comps.url!
    }

    static func mediaURL(fileId: String) -> URL {
        var comps = URLComponents(string: "\(apiBase)/files/\(fileId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? fileId)")!
        comps.queryItems = [
            URLQueryItem(name: "alt", value: "media"),
            URLQueryItem(name: "supportsAllDrives", value: "true"),
        ]
        return comps.url!
    }

    static func createMetaURL() -> URL {
        var comps = URLComponents(string: "\(apiBase)/files")!
        comps.queryItems = [URLQueryItem(name: "supportsAllDrives", value: "true")]
        return comps.url!
    }

    static func mediaUploadURL(fileId: String) -> URL {
        var comps = URLComponents(string: "\(uploadBase)/files/\(fileId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? fileId)")!
        comps.queryItems = [
            URLQueryItem(name: "uploadType", value: "media"),
            URLQueryItem(name: "supportsAllDrives", value: "true"),
        ]
        return comps.url!
    }

    static func multipartUploadURL() -> URL {
        var comps = URLComponents(string: "\(uploadBase)/files")!
        comps.queryItems = [
            URLQueryItem(name: "uploadType", value: "multipart"),
            URLQueryItem(name: "supportsAllDrives", value: "true"),
        ]
        return comps.url!
    }

    static func childrenQuery(folderId: String) -> String {
        "'\(folderId)' in parents and trashed=false"
    }

    static func videoFolderQuery(videoId: String, parentId: String = DriveOAuthConfig.folderId) -> String {
        "'\(parentId)' in parents and name='\(videoId)' and mimeType='\(folderMime)' and trashed=false"
    }

    static func videoFoldersQuery(parentId: String = DriveOAuthConfig.folderId) -> String {
        "'\(parentId)' in parents and mimeType='\(folderMime)' and trashed=false"
    }

    /// Parse Lamport `rev` the same way sync does (`NSNumber` / Int).
    static func parseRev(_ meta: [String: Any]) -> Int {
        (meta["rev"] as? NSNumber)?.intValue ?? 0
    }

    // MARK: - API

    static func children(folderId: String) async throws -> [String: String] {
        let files = try await list(q: childrenQuery(folderId: folderId))
        var map: [String: String] = [:]
        for f in files {
            if let name = f["name"] as? String, let id = f["id"] as? String { map[name] = id }
        }
        return map
    }

    static func ensureVideoFolder(videoId: String) async throws -> String {
        let found = try await list(q: videoFolderQuery(videoId: videoId))
        if let id = found.first?["id"] as? String { return id }

        var req = try await authorized(createMetaURL())
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "name": videoId,
            "parents": [DriveOAuthConfig.folderId],
            "mimeType": folderMime,
        ])
        let json = try await jsonObject(req)
        guard let id = json["id"] as? String else { throw DriveAPIError.noId("mkdir \(videoId)") }
        return id
    }

    static func listVideoFolders() async throws -> [(id: String, name: String)] {
        try await list(q: videoFoldersQuery()).compactMap { f in
            guard let id = f["id"] as? String, let name = f["name"] as? String else { return nil }
            return (id, name)
        }
    }

    static func getText(fileId: String) async throws -> String {
        let req = try await authorized(mediaURL(fileId: fileId))
        let (data, res) = try await URLSession.shared.data(for: req)
        try throwIfNeeded(res, data: data, label: "download")
        return String(data: data, encoding: .utf8) ?? ""
    }

    @discardableResult
    static func putText(folderId: String, name: String, text: String, fileId: String?) async throws -> String {
        let mime = "\(name.hasSuffix(".json") ? "application/json" : "text/plain"); charset=UTF-8"
        if let fileId {
            var req = try await authorized(mediaUploadURL(fileId: fileId))
            req.httpMethod = "PATCH"
            req.setValue(mime, forHTTPHeaderField: "Content-Type")
            req.httpBody = text.data(using: .utf8)
            let (data, res) = try await URLSession.shared.data(for: req)
            try throwIfNeeded(res, data: data, label: "update \(name)")
            return fileId
        }

        let boundary = "yjcs-ipad-boundary"
        let meta = try JSONSerialization.data(withJSONObject: ["name": name, "parents": [folderId]])
        var body = Data()
        body.append("--\(boundary)\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".data(using: .utf8)!)
        body.append(meta)
        body.append("\r\n--\(boundary)\r\nContent-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(text.data(using: .utf8)!)
        body.append("\r\n--\(boundary)--".data(using: .utf8)!)

        var req = try await authorized(multipartUploadURL())
        req.httpMethod = "POST"
        req.setValue("multipart/related; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        let json = try await jsonObject(req)
        return json["id"] as? String ?? ""
    }

    // MARK: - Internals

    private static func list(q: String) async throws -> [[String: Any]] {
        let req = try await authorized(listURL(q: q))
        let json = try await jsonObject(req)
        return json["files"] as? [[String: Any]] ?? []
    }

    private static func authorized(_ url: URL) async throws -> URLRequest {
        let token = try await DriveAuthService.shared.accessToken()
        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return req
    }

    private static func jsonObject(_ req: URLRequest) async throws -> [String: Any] {
        let (data, res) = try await URLSession.shared.data(for: req)
        try throwIfNeeded(res, data: data, label: "json")
        return (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    private static func throwIfNeeded(_ res: URLResponse, data: Data, label: String) throws {
        guard let http = res as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw DriveAPIError.http(label, http.statusCode, String(body.prefix(160)))
        }
    }
}

enum DriveAPIError: LocalizedError {
    case noId(String)
    case http(String, Int, String)

    var errorDescription: String? {
        switch self {
        case .noId(let what): return "Drive \(what): no id"
        case .http(let label, let code, let body): return "Drive \(label) \(code): \(body)"
        }
    }
}

/// Offline checks for URL/query building + meta.rev parse.
enum DriveAPISmoke {
    static func run() {
        let list = DriveAPIClient.listURL(q: DriveAPIClient.childrenQuery(folderId: "folderABC"))
        assert(list.absoluteString.contains("drive/v3/files"), "list path")
        assert(list.absoluteString.contains("supportsAllDrives=true"), "supportsAllDrives")
        let q = list.query ?? ""
        assert(q.contains("trashed%3Dfalse") || q.contains("trashed=false"), "trashed filter in q")

        let media = DriveAPIClient.mediaURL(fileId: "file/with?weird")
        assert(media.absoluteString.contains("alt=media"), "alt=media")

        let vq = DriveAPIClient.videoFolderQuery(videoId: "abc123")
        assert(vq.contains("name='abc123'"), "video name")
        assert(vq.contains(DriveOAuthConfig.folderId), "parent folder id")

        assert(DriveAPIClient.parseRev(["rev": 7]) == 7, "int rev")
        assert(DriveAPIClient.parseRev(["rev": NSNumber(value: 3)]) == 3, "NSNumber rev")
        assert(DriveAPIClient.parseRev([:]) == 0, "missing rev")

        print("[DriveAPISmoke] ok")
    }
}
