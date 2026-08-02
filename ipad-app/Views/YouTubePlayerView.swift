import SwiftUI
import WebKit

struct YouTubePlayerView: UIViewRepresentable {
    let videoID: String
    let onCaptionsReceived: (String, String) -> Void
    let onTimeUpdate: (Double, Double, Bool) -> Void
    /// Video element bounds in webview CSS px (maps 1:1 to SwiftUI points in the player pane).
    var onVideoRect: ((CGRect) -> Void)? = nil
    /// Latest layout smoke from page (`LAYOUT_CHECK`).
    var onLayoutCheck: (([String: Any]) -> Void)? = nil
    /// Watch-page video id from `?v=` (empty when on YouTube home/search — gate overlay/panel).
    var onPageVideoID: ((String?) -> Void)? = nil
    @Binding var seekRequest: Double?
    /// Bump to force a page reload without changing `videoID`.
    @Binding var reloadNonce: Int

    /// Desktop Safari UA so YouTube serves full header (search / Premium), not mobile chrome.
    private static let desktopUA =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let contentController = WKUserContentController()

        // Block OS fullscreen early; visual pane-fill lives in user_script.js (no fixed CSS).
        let fsPatch = """
        (function(){if(window.__csFsPatched)return;window.__csFsPatched=1;
        function noop(){return Promise.resolve()}
        try{Element.prototype.requestFullscreen=noop;Element.prototype.webkitRequestFullscreen=noop;Element.prototype.webkitRequestFullScreen=noop}catch(e){}
        try{Document.prototype.exitFullscreen=noop;Document.prototype.webkitExitFullscreen=noop;Document.prototype.webkitCancelFullScreen=noop}catch(e){}
        try{Object.defineProperty(document,'fullscreenElement',{configurable:true,get:function(){return null}})}catch(e){}
        try{HTMLVideoElement.prototype.webkitEnterFullscreen=function(){};HTMLVideoElement.prototype.webkitEnterFullScreen=function(){}}catch(e){}
        })();
        """
        contentController.addUserScript(WKUserScript(source: fsPatch, injectionTime: .atDocumentStart, forMainFrameOnly: true))

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

        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        // Disable OS/element fullscreen — JS maps YT zoom to left-pane fill only.
        if #available(iOS 15.4, *) {
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

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: YouTubePlayerView
        var loadedID: String?
        var lastReloadNonce: Int = 0

        init(_ parent: YouTubePlayerView) {
            self.parent = parent
            self.lastReloadNonce = parent.reloadNonce
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let dict = message.body as? [String: Any],
                  let type = dict["type"] as? String else { return }

            if type == "CAPTIONS_RECEIVED",
               let url = dict["url"] as? String,
               let payload = dict["payload"] as? String {
                DispatchQueue.main.async { [parent] in parent.onCaptionsReceived(url, payload) }
            } else if type == "TIME_UPDATE" {
                // WKWebView bridges JS numbers as NSNumber — `as? Double` fails.
                guard let currentTime = Self.double(dict["currentTime"]) else { return }
                let duration = Self.double(dict["duration"]) ?? 0
                let paused = Self.bool(dict["paused"]) ?? true
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
                    parent.onVideoRect?(CGRect(x: x * sx, y: y * sy, width: w * sx, height: h * sy))
                }
            } else if type == "LAYOUT_CHECK" {
                DispatchQueue.main.async { [parent] in parent.onLayoutCheck?(dict) }
            } else if type == "PAGE_NAV" {
                let raw = (dict["videoId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let id = raw.isEmpty ? nil : YouTubeURL.videoID(from: raw)
                // SPA already moved — keep updateUIView from reloading the same watch URL.
                if let id { loadedID = id }
                DispatchQueue.main.async { [parent] in parent.onPageVideoID?(id) }
            }
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
            decisionHandler(.allow)
        }
    }
}
