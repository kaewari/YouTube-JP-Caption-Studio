import Foundation

/// Host smoke for default (non-aggressive) player layout — no 80% fill / no under-player wipe.
enum LayoutSmoke {
    static func run() {
        let scriptURL = Bundle.main.url(forResource: "user_script", withExtension: "js")
        let src = scriptURL.flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        // Ban unscoped hide of under-player chrome / related; app-full scoped OK.
        assert(!src.contains("#below,") || src.contains("html.cs-app-full #below"), "user_script must not hide #below outside app-full")
        assert(!src.contains("#secondary") || src.contains("html.cs-app-full #secondary"), "user_script must not hide #secondary outside app-full")
        assert(!src.contains("#related") || src.contains("html.cs-app-full #related"), "user_script must not hide #related outside app-full")
        // App-full may lock scroll under html.cs-app-full only; ban unscoped page lock.
        assert(
            !src.contains("overflow: hidden") || src.contains("html.cs-app-full"),
            "user_script must not lock page scroll outside app-full"
        )
        assert(!src.contains("ytd-watch-metadata"), "user_script must not hide watch metadata")
        assert(src.contains(".ytp-caption-window-container"), "still hide native CC")
        print("[LayoutSmoke] ok default layout (scroll + related visible)")
    }
}
