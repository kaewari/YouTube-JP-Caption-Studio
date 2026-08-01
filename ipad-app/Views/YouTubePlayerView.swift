import SwiftUI
import WebKit

struct YouTubePlayerView: UIViewRepresentable {
    let videoURL: URL
    let onCaptionsReceived: (String, String) -> Void // (url, payload)
    let onTimeUpdate: (Double, Double, Bool) -> Void // (currentTime, duration, paused)
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let contentController = WKUserContentController()
        
        // Inject user_script.js
        if let scriptPath = Bundle.main.path(forResource: "user_script", ofType: "js"),
           let scriptSource = try? String(contentsOfFile: scriptPath) {
            let userScript = WKUserScript(source: scriptSource, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
            contentController.addUserScript(userScript)
        }
        
        // Register message handlers
        contentController.add(context.coordinator, name: "captionHandler")
        contentController.add(context.coordinator, name: "timeHandler")
        
        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = [] // Autoplay allowed
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.scrollView.isScrollEnabled = false // Ngăn cuộn trang web
        
        // Cài đặt User-Agent của iPad để lấy giao diện m.youtube.com hoặc youtube.com phù hợp
        webView.customUserAgent = "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        
        return webView
    }
    
    func updateUIView(_ uiView: WKWebView, context: Context) {
        let request = URLRequest(url: videoURL)
        if uiView.url != videoURL {
            uiView.load(request)
        }
    }
    
    class Coordinator: NSObject, WKScriptMessageHandler {
        var parent: YouTubePlayerView
        
        init(_ parent: YouTubePlayerView) {
            self.parent = parent
        }
        
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let dict = message.body as? [String: Any],
                  let type = dict["type"] as? String else { return }
            
            if type == "CAPTIONS_RECEIVED" {
                if let url = dict["url"] as? String,
                   let payload = dict["payload"] as? String {
                    parent.onCaptionsReceived(url, payload)
                }
            } else if type == "TIME_UPDATE" {
                if let currentTime = dict["currentTime"] as? Double,
                   let duration = dict["duration"] as? Double,
                   let paused = dict["paused"] as? Bool {
                    parent.onTimeUpdate(currentTime, duration, paused)
                }
            }
        }
    }
}
