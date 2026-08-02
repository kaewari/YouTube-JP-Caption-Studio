import Foundation

/// Google Drive OAuth — requires an **iOS** OAuth client from GCP.
/// Do NOT paste the Chrome extension `client_id` (→ Error 400: invalid_request).
enum DriveOAuthConfig {
    /// Paste iOS client id (`….apps.googleusercontent.com`). Bundle: `com.example.YouTubeJPCaptionStudio`.
    /// Then update `Info.plist` / `project.yml` URL scheme to `com.googleusercontent.apps.<prefix>`.
    static let clientId = "886146342458-g0tav91opprcvkivnmabh3p3c2f7qjns.apps.googleusercontent.com"
    static let folderId = "1K8LPtKici0gVaq5FuTMDmYDWzPpBokFA"
    static let scope = "https://www.googleapis.com/auth/drive"
    static let authURL = URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
    static let tokenURL = URL(string: "https://oauth2.googleapis.com/token")!

    static var isConfigured: Bool { !clientId.isEmpty }

    /// `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`
    static var urlScheme: String {
        let prefix = clientId.replacingOccurrences(of: ".apps.googleusercontent.com", with: "")
        return "com.googleusercontent.apps.\(prefix)"
    }

    /// Google iOS clients expect reverse-client-id + `/oauth2redirect`.
    static var redirectURI: String { "\(urlScheme):/oauth2redirect" }
}
