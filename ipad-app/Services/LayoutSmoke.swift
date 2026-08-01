import Foundation

/// Host smoke for default (non-aggressive) player layout — no 80% fill / no under-player wipe.
enum LayoutSmoke {
    static func run() {
        let scriptURL = Bundle.main.url(forResource: "user_script", withExtension: "js")
        let src = scriptURL.flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        // Selector-list hide of under-player chrome / related (comma form from older CSS).
        assert(!src.contains("#below,"), "user_script must not hide #below")
        assert(!src.contains("#secondary"), "user_script must not hide #secondary")
        assert(!src.contains("#related"), "user_script must not hide #related")
        assert(!src.contains("overflow: hidden"), "user_script must not lock page scroll")
        assert(!src.contains("ytd-watch-metadata"), "user_script must not hide watch metadata")
        assert(src.contains(".ytp-caption-window-container"), "still hide native CC")
        print("[LayoutSmoke] ok default layout (scroll + related visible)")
    }
}
