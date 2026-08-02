import Foundation

/// iOS OAuth client for Drive REST. Chrome extension `client_id` cannot be reused here.
///
/// GCP once: Credentials → Create OAuth client ID → **iOS** → bundle
/// `com.example.YouTubeJPCaptionStudio` → paste the full `….apps.googleusercontent.com`
/// value into `clientId` below, then set the matching reverse-client-id URL scheme in
/// `Info.plist` / `project.yml` (see `Scripts/COMMANDS.md`).
enum DriveOAuthConfig {
    /// TODO: paste iOS OAuth client_id from GCP. Leave the TODO prefix so connect fails loudly.
    static let clientId = "TODO_PASTE_IOS_OAUTH_CLIENT_ID.apps.googleusercontent.com"
    static let folderId = "1K8LPtKici0gVaq5FuTMDmYDWzPpBokFA"
    static let scope = "https://www.googleapis.com/auth/drive"
    static let authURL = URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
    static let tokenURL = URL(string: "https://oauth2.googleapis.com/token")!

    static var isConfigured: Bool { !clientId.hasPrefix("TODO_") }

    /// `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`
    static var urlScheme: String {
        let prefix = clientId.replacingOccurrences(of: ".apps.googleusercontent.com", with: "")
        return "com.googleusercontent.apps.\(prefix)"
    }

    static var redirectURI: String { "\(urlScheme):/oauth2redirect" }
}
