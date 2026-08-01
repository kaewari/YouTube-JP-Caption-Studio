// user_script.js
// Inject vào WKWebView để bắt các request lấy phụ đề của YouTube.

(function() {
    console.log("[CaptionStudio] iOS User Script Injected.");

    // Monkey-patch XMLHttpRequest
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalXHROpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        this.addEventListener('load', function() {
            if (this._url && this._url.includes('/api/timedtext')) {
                console.log("[CaptionStudio] Intercepted timedtext API.");
                
                // Gửi dữ liệu ra Swift qua WKScriptMessageHandler
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.captionHandler) {
                    window.webkit.messageHandlers.captionHandler.postMessage({
                        type: "CAPTIONS_RECEIVED",
                        url: this._url,
                        payload: this.responseText
                    });
                }
            }
        });
        return originalXHRSend.apply(this, arguments);
    };

    // Theo dõi thời gian thực của video và gửi về Swift
    setInterval(() => {
        const video = document.querySelector('video');
        if (video) {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.timeHandler) {
                window.webkit.messageHandlers.timeHandler.postMessage({
                    type: "TIME_UPDATE",
                    currentTime: video.currentTime,
                    duration: video.duration,
                    paused: video.paused
                });
            }
        }
    }, 250); // Cập nhật mỗi 250ms

    // Ẩn phụ đề mặc định của YouTube để nhường chỗ cho Hardsub của chúng ta
    const style = document.createElement('style');
    style.innerHTML = `
        .ytp-caption-window-container, .caption-window {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
        }
    `;
    document.head.appendChild(style);

})();
