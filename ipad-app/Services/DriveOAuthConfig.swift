import Foundation

/// iOS OAuth client for Drive REST. Chrome extension `client_id` cannot be reused here.
enum DriveOAuthConfig {
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

    static var redirectURI: String { "\(urlScheme):/oauth2redirect" }
}
