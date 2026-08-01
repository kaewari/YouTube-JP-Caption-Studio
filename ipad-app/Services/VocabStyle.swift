import SwiftUI

/// JLPT / status colors — parity with extension `vocab_style.js`.
enum VocabStyle {
    // Slightly brighter than desktop hex so JLPT hues stay readable on dark overlay.
    static let jlpt: [String: Color] = [
        "n5": Color(red: 0.55, green: 0.92, blue: 0.72),
        "n4": Color(red: 0.62, green: 0.88, blue: 1.0),
        "n3": Color(red: 1.0, green: 0.90, blue: 0.48),
        "n2": Color(red: 1.0, green: 0.62, blue: 0.35),
        "n1": Color(red: 1.0, green: 0.42, blue: 0.48),
        "unknown": Color(red: 0.92, green: 0.92, blue: 0.96),
    ]

    static func color(for token: Token) -> Color? {
        guard token.isContentWord else { return nil }
        if let j = token.jlpt, let c = jlpt[j] { return c }
        return jlpt["unknown"]
    }
}
