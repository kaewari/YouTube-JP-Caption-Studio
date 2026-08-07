import SwiftUI
import WebKit

enum PlayerHistoryAction {
    case goBack
    case goForward
}

struct YouTubePlayerView: UIViewRepresentable {
    let videoID: String
    let onCaptionsReceived: (String, String) -> Void
    let onTimeUpdate: (Double, Double, Bool) -> Void
    /// Video element bounds in webview CSS px (maps 1:1 to SwiftUI points in the player pane).
    var onVideoRect: ((CGRect) -> Void)? = nil
    /// Latest layout smoke from page (`LAYOUT_CHECK`).
    var onLayoutCheck: (([String: Any]) -> Void)? = nil
    /// Watch-page video id from `?v=` + href (empty id on YouTube home/search — gate overlay/panel).
    var onPageNav: ((String?, String) -> Void)? = nil
    /// OS/app fullscreen enter/exit from page (`fullscreenHandler`).
    var onFullscreenChange: ((Bool) -> Void)? = nil
    @Binding var seekRequest: Double?
    /// Bump to force a page reload without changing `videoID`.
    @Binding var reloadNonce: Int
    /// Bump to run `window.__csToggleFull()` (app maximize only — OS video FS disabled).
    @Binding var fullscreenToggleNonce: Int
    @Binding var historyAction: PlayerHistoryAction?
    @Binding var canGoBack: Bool
    @Binding var canGoForward: Bool

    /// Desktop Safari UA so YouTube serves full header (search / Premium), not mobile chrome.
    private static let desktopUA =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let contentController = WKUserContentController()

        if let scriptPath = Bundle.main.path(forResource: "user_script", ofType: "js"),
           let scriptSource = try? String(contentsOfFile: scriptPath) {
            let userScript = WKUserScript(source: scriptSource, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            contentController.addUserScript(userScript)
        }

        contentController.add(context.coordinator, name: "captionHandler")
        contentController.add(context.coordinator, name: "timeHandler")
        contentController.add(context.coordinator, name: "rectHandler")
        contentController.add(context.coordinator, name: "layoutHandler")
        contentController.add(context.coordinator, name: "navHandler")
        contentController.add(context.coordinator, name: "fullscreenHandler")

        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        if #available(iOS 15.4, *) {
            // Fullscreen must stay app-maximize: element fullscreen (iOS 15.4+) would present
            // the OS layer over our overlay. Default is off — pin it off explicitly.
            configuration.preferences.isElementFullscreenEnabled = false
        }

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.customUserAgent = Self.desktopUA
        webView.scrollView.isScrollEnabled = true
        webView.scrollView.bounces = false
        webView.isOpaque = true
        webView.backgroundColor = UIColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1)
        webView.scrollView.backgroundColor = UIColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1)
        webView.navigationDelegate = context.coordinator
        context.coordinator.observeHistory(webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.parent = self

        if let seekTime = seekRequest {
            let seconds = seekTime / 1000.0
            uiView.evaluateJavaScript(
                "(function(){if(window.__csSeek)return window.__csSeek(\(seconds));var v=document.querySelector('#movie_player video.html5-main-video')||document.querySelector('#movie_player video');if(v)v.currentTime=\(seconds);})();"
            )
            DispatchQueue.main.async { seekRequest = nil }
        }

        if fullscreenToggleNonce != context.coordinator.lastFullscreenToggleNonce {
            context.coordinator.lastFullscreenToggleNonce = fullscreenToggleNonce
            uiView.evaluateJavaScript("window.__csToggleFull&&window.__csToggleFull();")
        }

        if let action = historyAction {
            switch action {
            case .goBack where uiView.canGoBack: uiView.goBack()
            case .goForward where uiView.canGoForward: uiView.goForward()
            default: break
            }
            DispatchQueue.main.async { historyAction = nil }
            context.coordinator.publishHistory(uiView)
        }

        if reloadNonce != context.coordinator.lastReloadNonce {
            context.coordinator.lastReloadNonce = reloadNonce
            context.coordinator.loadedID = videoID
            let url = URL(string: "https://www.youtube.com/watch?v=\(videoID)&playsinline=1")!
            uiView.load(URLRequest(url: url))
            return
        }

        guard context.coordinator.loadedID != videoID else { return }
        context.coordinator.loadedID = videoID
        // Full watch page (embed Error 153 in WKWebView). Default layout — no forced fill CSS.
        let url = URL(string: "https://www.youtube.com/watch?v=\(videoID)&playsinline=1")!
        uiView.load(URLRequest(url: url))
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        coordinator.stopObserving(uiView)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: YouTubePlayerView
        var loadedID: String?
        var lastReloadNonce: Int = 0
        var lastFullscreenToggleNonce: Int = 0
        /// Coalesce bridge storms before they invalidate SwiftUI @State.
        private var lastTimeSec: Double = -1
        private var lastPaused: Bool?
        private var lastTimeEmit: CFAbsoluteTime = 0
        private var lastVideoRect: CGRect = .null
        private var observingHistory = false

        init(_ parent: YouTubePlayerView) {
            self.parent = parent
            self.lastReloadNonce = parent.reloadNonce
            self.lastFullscreenToggleNonce = parent.fullscreenToggleNonce
        }

        func observeHistory(_ webView: WKWebView) {
            guard !observingHistory else { return }
            webView.addObserver(self, forKeyPath: #keyPath(WKWebView.canGoBack), options: .new, context: nil)
            webView.addObserver(self, forKeyPath: #keyPath(WKWebView.canGoForward), options: .new, context: nil)
            observingHistory = true
            publishHistory(webView)
        }

        func stopObserving(_ webView: WKWebView) {
            guard observingHistory else { return }
            webView.removeObserver(self, forKeyPath: #keyPath(WKWebView.canGoBack))
            webView.removeObserver(self, forKeyPath: #keyPath(WKWebView.canGoForward))
            observingHistory = false
        }

        func publishHistory(_ webView: WKWebView) {
            let back = webView.canGoBack
            let forward = webView.canGoForward
            DispatchQueue.main.async { [parent] in
                if parent.canGoBack != back { parent.canGoBack = back }
                if parent.canGoForward != forward { parent.canGoForward = forward }
            }
        }

        override func observeValue(
            forKeyPath keyPath: String?,
            of object: Any?,
            change: [NSKeyValueChangeKey: Any]?,
            context: UnsafeMutableRawPointer?
        ) {
            guard let webView = object as? WKWebView,
                  keyPath == #keyPath(WKWebView.canGoBack) || keyPath == #keyPath(WKWebView.canGoForward)
            else { return }
            publishHistory(webView)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let dict = message.body as? [String: Any] else { return }

            if message.name == "fullscreenHandler" {
                let active = Self.bool(dict["active"]) ?? false
                DispatchQueue.main.async { [parent] in parent.onFullscreenChange?(active) }
                return
            }

            guard let type = dict["type"] as? String else { return }

            if type == "CAPTIONS_RECEIVED",
               let url = dict["url"] as? String,
               let payload = dict["payload"] as? String {
                DispatchQueue.main.async { [parent] in parent.onCaptionsReceived(url, payload) }
            } else if type == "TIME_UPDATE" {
                // WKWebView bridges JS numbers as NSNumber — `as? Double` fails.
                guard let currentTime = Self.double(dict["currentTime"]) else { return }
                let duration = Self.double(dict["duration"]) ?? 0
                let paused = Self.bool(dict["paused"]) ?? true
                let now = CFAbsoluteTimeGetCurrent()
                let pauseChanged = lastPaused.map { $0 != paused } ?? true
                let dt = abs(currentTime - lastTimeSec)
                // ~8Hz while playing; always emit pause/play edges.
                if !pauseChanged && dt < 0.05 && (now - lastTimeEmit) < 0.12 { return }
                lastTimeSec = currentTime
                lastPaused = paused
                lastTimeEmit = now
                DispatchQueue.main.async { [parent] in
                    parent.onTimeUpdate(currentTime, duration, paused)
                }
            } else if type == "VIDEO_RECT",
                      let x = Self.cg(dict["x"]),
                      let y = Self.cg(dict["y"]),
                      let w = Self.cg(dict["w"]),
                      let h = Self.cg(dict["h"]) {
                let vw = Self.cg(dict["vw"]) ?? w
                let vh = Self.cg(dict["vh"]) ?? h
                DispatchQueue.main.async { [parent, weak webView = message.webView] in
                    let bounds = webView?.bounds.size ?? CGSize(width: vw, height: vh)
                    let sx = vw > 0 ? bounds.width / vw : 1
                    let sy = vh > 0 ? bounds.height / vh : 1
                    let rect = CGRect(x: x * sx, y: y * sy, width: w * sx, height: h * sy)
                    // 2pt slack — subpixel WK layout noise must not rebuild overlay every tick.
                    if !self.lastVideoRect.isNull,
                       abs(rect.minX - self.lastVideoRect.minX) < 2,
                       abs(rect.minY - self.lastVideoRect.minY) < 2,
                       abs(rect.width - self.lastVideoRect.width) < 2,
                       abs(rect.height - self.lastVideoRect.height) < 2 {
                        return
                    }
                    self.lastVideoRect = rect
                    parent.onVideoRect?(rect)
                }
            } else if type == "LAYOUT_CHECK" {
                DispatchQueue.main.async { [parent] in parent.onLayoutCheck?(dict) }
            } else if type == "PAGE_NAV" {
                let raw = (dict["videoId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let id = raw.isEmpty ? nil : YouTubeURL.videoID(from: raw)
                let url = (dict["url"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                // SPA already moved — keep updateUIView from reloading the same watch URL.
                if let id { loadedID = id }
                if let webView = message.webView { publishHistory(webView) }
                DispatchQueue.main.async { [parent] in parent.onPageNav?(id, url) }
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            publishHistory(webView)
        }

        private static func double(_ any: Any?) -> Double? {
            if let n = any as? Double { return n }
            if let n = any as? Int { return Double(n) }
            if let n = any as? NSNumber { return n.doubleValue }
            return nil
        }

        private static func bool(_ any: Any?) -> Bool? {
            if let b = any as? Bool { return b }
            if let n = any as? NSNumber { return n.boolValue }
            return nil
        }

        private static func cg(_ any: Any?) -> CGFloat? {
            guard let d = double(any) else { return nil }
            return CGFloat(d)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // Player pane is a YouTube-only shell — external sites must not navigate
            // the WKWebView (open them in the system browser instead).
            let host = navigationAction.request.url?.host?.lowercased() ?? ""
            if host == "youtube.com" || host.hasSuffix(".youtube.com") || host == "youtu.be" {
                decisionHandler(.allow)
            } else if navigationAction.navigationType == .other && navigationAction.request.url == nil {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }
    }
}
