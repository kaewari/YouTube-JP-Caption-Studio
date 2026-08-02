import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

/// Google OAuth via `ASWebAuthenticationSession` + PKCE + Keychain. No GoogleSignIn SPM.
@MainActor
final class DriveAuthService: NSObject {
    static let shared = DriveAuthService()

    private let keychainService = "com.example.YouTubeJPCaptionStudio.drive"
    private let keychainAccount = "oauth"
    private var session: ASWebAuthenticationSession?

    var hasToken: Bool { loadTokens() != nil }

    /// Interactive OAuth if needed; returns a usable access token.
    @discardableResult
    func connect() async throws -> String {
        if let token = try await validAccessToken(interactive: false) { return token }
        return try await validAccessToken(interactive: true)
            ?? { throw DriveAuthError.noToken }()
    }

    func accessToken() async throws -> String {
        try await validAccessToken(interactive: false)
            ?? { throw DriveAuthError.notConnected }()
    }

    func disconnect() {
        deleteTokens()
    }

    // MARK: - Token lifecycle

    private func validAccessToken(interactive: Bool) async throws -> String? {
        guard DriveOAuthConfig.isConfigured else {
            if interactive { throw DriveAuthError.missingClientId }
            return nil
        }
        if var tokens = loadTokens() {
            if tokens.accessToken.isEmpty == false,
               tokens.expiresAt.timeIntervalSinceNow > 60 {
                return tokens.accessToken
            }
            if !tokens.refreshToken.isEmpty,
               let refreshed = try? await refresh(tokens.refreshToken) {
                tokens = refreshed
                saveTokens(tokens)
                return tokens.accessToken
            }
            if !interactive { return nil }
        } else if !interactive {
            return nil
        }
        let tokens = try await authorize()
        saveTokens(tokens)
        return tokens.accessToken
    }

    private func authorize() async throws -> Tokens {
        let pkce = Self.makePKCE()
        var comps = URLComponents(url: DriveOAuthConfig.authURL, resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            URLQueryItem(name: "client_id", value: DriveOAuthConfig.clientId),
            URLQueryItem(name: "redirect_uri", value: DriveOAuthConfig.redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: DriveOAuthConfig.scope),
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent"),
            URLQueryItem(name: "code_challenge", value: pkce.challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        guard let url = comps.url else { throw DriveAuthError.badURL }

        let callback = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: DriveOAuthConfig.urlScheme
            ) { callbackURL, error in
                if let error {
                    cont.resume(throwing: error)
                } else if let callbackURL {
                    cont.resume(returning: callbackURL)
                } else {
                    cont.resume(throwing: DriveAuthError.cancelled)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                cont.resume(throwing: DriveAuthError.cancelled)
            }
        }
        self.session = nil

        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let oauthErr = items.first(where: { $0.name == "error" })?.value {
            if oauthErr == "invalid_request" { throw DriveAuthError.invalidRequest }
            let desc = items.first(where: { $0.name == "error_description" })?.value
            throw DriveAuthError.oauthError(oauthErr, desc)
        }
        guard let code = items.first(where: { $0.name == "code" })?.value
        else { throw DriveAuthError.noCode }

        return try await exchange(code: code, verifier: pkce.verifier)
    }

    private func exchange(code: String, verifier: String) async throws -> Tokens {
        var req = URLRequest(url: DriveOAuthConfig.tokenURL)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = form([
            "code": code,
            "client_id": DriveOAuthConfig.clientId,
            "redirect_uri": DriveOAuthConfig.redirectURI,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        ])
        return try await decodeTokens(req)
    }

    private func refresh(_ refreshToken: String) async throws -> Tokens {
        var req = URLRequest(url: DriveOAuthConfig.tokenURL)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = form([
            "refresh_token": refreshToken,
            "client_id": DriveOAuthConfig.clientId,
            "grant_type": "refresh_token",
        ])
        var tokens = try await decodeTokens(req)
        if tokens.refreshToken.isEmpty { tokens.refreshToken = refreshToken }
        return tokens
    }

    private func decodeTokens(_ req: URLRequest) async throws -> Tokens {
        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            if body.contains("invalid_request") { throw DriveAuthError.invalidRequest }
            throw DriveAuthError.tokenHTTP((res as? HTTPURLResponse)?.statusCode ?? 0, body)
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let access = json["access_token"] as? String
        else { throw DriveAuthError.badTokenJSON }
        let expiresIn = (json["expires_in"] as? NSNumber)?.doubleValue ?? 3600
        return Tokens(
            accessToken: access,
            refreshToken: json["refresh_token"] as? String ?? "",
            expiresAt: Date().addingTimeInterval(expiresIn)
        )
    }

    private func form(_ fields: [String: String]) -> Data {
        fields
            .map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0.value)" }
            .joined(separator: "&")
            .data(using: .utf8)!
    }

    /// PKCE S256: 32 random bytes → base64url verifier; SHA256(verifier) → base64url challenge.
    private static func makePKCE() -> (verifier: String, challenge: String) {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let verifier = Data(bytes).base64URLEncoded
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded
        assert(!challenge.contains("+") && !challenge.contains("/") && !challenge.contains("="))
        return (verifier, challenge)
    }

    // MARK: - Keychain

    private struct Tokens: Codable {
        var accessToken: String
        var refreshToken: String
        var expiresAt: Date
    }

    private func saveTokens(_ tokens: Tokens) {
        guard let data = try? JSONEncoder().encode(tokens) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    private func loadTokens() -> Tokens? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return try? JSONDecoder().decode(Tokens.self, from: data)
    }

    private func deleteTokens() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

private extension Data {
    var base64URLEncoded: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension DriveAuthService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let key = scenes.flatMap(\.windows).first(where: \.isKeyWindow) { return key }
        return scenes.flatMap(\.windows).first ?? ASPresentationAnchor()
    }
}

enum DriveAuthError: LocalizedError {
    case missingClientId
    case invalidRequest
    case oauthError(String, String?)
    case notConnected
    case noToken
    case cancelled
    case noCode
    case badURL
    case badTokenJSON
    case tokenHTTP(Int, String)

    var errorDescription: String? {
        switch self {
        case .missingClientId:
            return "Cần OAuth client kiểu iOS trên GCP, không dùng client Chrome extension (xem COMMANDS.md)"
        case .invalidRequest:
            return "Cần OAuth client kiểu iOS trên GCP, không dùng client Chrome extension"
        case .oauthError(let err, let desc):
            return desc.map { "OAuth \(err): \($0)" } ?? "OAuth: \(err)"
        case .notConnected:
            return "Chưa Connect Drive"
        case .noToken:
            return "OAuth không trả token"
        case .cancelled:
            return "Đã huỷ OAuth"
        case .noCode:
            return "OAuth không có code"
        case .badURL:
            return "OAuth URL lỗi"
        case .badTokenJSON:
            return "Token JSON lỗi"
        case .tokenHTTP(let code, let body):
            return "Token \(code): \(body.prefix(120))"
        }
    }
}
