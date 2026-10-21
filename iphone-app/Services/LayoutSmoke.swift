import Foundation

/// Host smoke for default (non-aggressive) player layout — no 80% fill / no under-player wipe.
/// Guards the script THIS app ships — the iPhone app bundles no `user_script.js`
/// (the page bridge lives in the iPad app), so the check is skipped there.
enum LayoutSmoke {
    static func run() {
        guard let scriptURL = Bundle.main.url(forResource: "user_script", withExtension: "js"),
              let src = try? String(contentsOf: scriptURL, encoding: .utf8) else {
            print("[LayoutSmoke] skip — user_script.js not in bundle")
            return
        }
        // Selector-list hide of under-player chrome / related (comma form from older CSS).
        assert(!src.contains("#below,"), "user_script must not hide #below")
        assert(!src.contains("#secondary"), "user_script must not hide #secondary")
        assert(!src.contains("#related"), "user_script must not hide #related")
        assert(!src.contains("overflow: hidden"), "user_script must not lock page scroll")
        // Intentional: masthead + title/owner hide (not whole #below / related).
        assert(src.contains("ytd-masthead"), "hide YT masthead")
        assert(src.contains("ytd-watch-metadata #owner"), "hide title/owner row")
        assert(src.contains(".ytp-caption-window-container"), "still hide native CC")
        print("[LayoutSmoke] ok default layout (scroll + related visible)")
    }
}
