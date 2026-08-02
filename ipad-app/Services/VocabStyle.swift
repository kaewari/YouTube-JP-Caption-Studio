import SwiftUI
import UIKit

/// JLPT / status colors — parity with extension `vocab_style.js`.
enum VocabStyle {
    static let levelKeys = ["n5", "n4", "n3", "n2", "n1", "unknown"]

    static let levelLabels: [String: String] = [
        "n5": "N5", "n4": "N4", "n3": "N3", "n2": "N2", "n1": "N1", "unknown": "Không rõ",
    ]

    /// Desktop `DEFAULT_LEVEL_COLORS` hex (vocab_style.js).
    static let defaultLevelColorsJSON =
        ##"{"n5":{"on":true,"color":"#7fd6a8"},"n4":{"on":true,"color":"#8fd3ff"},"n3":{"on":true,"color":"#f5d76e"},"n2":{"on":true,"color":"#e08a4a"},"n1":{"on":true,"color":"#e74c5c"},"unknown":{"on":true,"color":"#c5c5d0"}}"##

    struct Entry: Codable, Equatable {
        var on: Bool
        var color: String
    }

    private static let defaultLevelColors: [String: Entry] = [
        "n5": Entry(on: true, color: "#7fd6a8"),
        "n4": Entry(on: true, color: "#8fd3ff"),
        "n3": Entry(on: true, color: "#f5d76e"),
        "n2": Entry(on: true, color: "#e08a4a"),
        "n1": Entry(on: true, color: "#e74c5c"),
        "unknown": Entry(on: true, color: "#c5c5d0"),
    ]

    static func normalize(_ raw: [String: Entry]?) -> [String: Entry] {
        var out: [String: Entry] = [:]
        for key in levelKeys {
            let fallback = defaultLevelColors[key]!
            let d = raw?[key] ?? fallback
            out[key] = Entry(on: d.on, color: d.color.isEmpty ? fallback.color : d.color)
        }
        return out
    }

    static func decode(_ json: String) -> [String: Entry] {
        guard let data = json.data(using: .utf8),
              let raw = try? JSONDecoder().decode([String: Entry].self, from: data)
        else { return normalize(nil) }
        return normalize(raw)
    }

    static func encode(_ colors: [String: Entry]) -> String {
        let norm = normalize(colors)
        guard let data = try? JSONEncoder().encode(norm),
              let s = String(data: data, encoding: .utf8)
        else { return defaultLevelColorsJSON }
        return s
    }

    static func color(for token: Token) -> Color? {
        guard token.isContentWord else { return nil }
        let enabled = UserDefaults.standard.object(forKey: "levelHighlightEnabled") as? Bool ?? true
        guard enabled else { return nil }
        let json = UserDefaults.standard.string(forKey: "levelColorsJSON") ?? defaultLevelColorsJSON
        let colors = decode(json)
        let key = token.jlpt.flatMap { colors[$0] != nil ? $0 : nil } ?? "unknown"
        guard let entry = colors[key], entry.on else { return nil }
        return color(hex: entry.color)
    }

    /// Color for a level key given current JSON (preview / ColorPicker).
    static func color(forKey key: String, json: String, enabled: Bool = true) -> Color? {
        guard enabled else { return nil }
        let colors = decode(json)
        guard let entry = colors[key], entry.on else { return nil }
        return color(hex: entry.color)
    }

    static func updating(json: String, key: String, on: Bool? = nil, hex: String? = nil) -> String {
        var colors = decode(json)
        var e = colors[key] ?? Entry(on: true, color: "#c5c5d0")
        if let on { e.on = on }
        if let hex { e.color = hex }
        colors[key] = e
        return encode(colors)
    }

    static func color(hex: String) -> Color? {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let n = UInt32(s, radix: 16) else { return nil }
        return Color(
            red: Double((n >> 16) & 0xFF) / 255,
            green: Double((n >> 8) & 0xFF) / 255,
            blue: Double(n & 0xFF) / 255
        )
    }

    static func hex(from color: Color) -> String {
        let ui = UIColor(color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02x%02x%02x", Int(r * 255), Int(g * 255), Int(b * 255))
    }
}

/// Assert-based smoke: defaults + master-off / level-off → nil.
enum VocabStyleSmoke {
    static func run() {
        let d = VocabStyle.decode(VocabStyle.defaultLevelColorsJSON)
        assert(d["n5"]?.color == "#7fd6a8" && d["n1"]?.on == true, "desktop defaults")
        assert(VocabStyle.color(hex: "#e74c5c") != nil, "hex parse")
        let off = VocabStyle.updating(json: VocabStyle.defaultLevelColorsJSON, key: "n5", on: false)
        assert(VocabStyle.color(forKey: "n5", json: off) == nil, "level off → nil")
        assert(VocabStyle.color(forKey: "n5", json: VocabStyle.defaultLevelColorsJSON, enabled: false) == nil, "master off → nil")
        print("[VocabStyleSmoke] ok")
    }
}
