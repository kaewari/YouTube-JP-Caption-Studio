// Watch page in left WKWebView — boring default layout (no cover / fixed / 80vh wars).
(function () {
  if (window.__captionStudioInjected) return;
  window.__captionStudioInjected = true;

  try {
    var style = document.createElement("style");
    style.id = "cs-layout-style";
    style.textContent = `
      /* Hide native CC only — keep below-player chrome + related / other videos. */
      .ytp-caption-window-container, .caption-window, .player-timedtext { display: none !important; }

      html, body, ytd-app { background: #121212 !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {}

  function playerEl() {
    return document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
  }
  function mainVideo() {
    return document.querySelector("#movie_player video.html5-main-video")
      || document.querySelector("#movie_player video");
  }

  window.__csSeek = function (sec) {
    var v = mainVideo();
    if (!v) return false;
    try { v.currentTime = Number(sec) || 0; } catch (e) { return false; }
    postTime();
    return true;
  };

  // Soft smoke: player present, not fixed, native chrome exists. No 80% fill requirement.
  window.__csLayoutSmoke = function () {
    var p = playerEl();
    var pr = p ? p.getBoundingClientRect() : null;
    var vh = window.innerHeight || 1;
    var ratio = pr ? pr.height / vh : 0;
    var pos = p ? getComputedStyle(p).position : "";
    return {
      ok80: true,
      ratio: Math.round(ratio * 1000) / 1000,
      noCover: true,
      objectFit: (mainVideo() && getComputedStyle(mainVideo()).objectFit) || "",
      hasBottomChrome: !!document.querySelector(".ytp-chrome-bottom"),
      hasTopChrome: !!document.querySelector(".ytp-chrome-top"),
      noFixedPlayer: pos !== "fixed",
      playerH: pr ? Math.round(pr.height) : 0,
      vh: Math.round(vh)
    };
  };

  function postTime() {
    if (window !== window.top) return;
    if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.timeHandler)) return;
    var video = mainVideo();
    if (!video) return;
    var t = Number(video.currentTime);
    if (!isFinite(t)) return;
    var p = playerEl();
    if (p && typeof p.getCurrentTime === "function") {
      try {
        var apiT = p.getCurrentTime();
        if (typeof apiT === "number" && isFinite(apiT)) t = apiT;
      } catch (e) {}
    }
    var d = Number(video.duration);
    if (!isFinite(d)) d = 0;
    window.webkit.messageHandlers.timeHandler.postMessage({
      type: "TIME_UPDATE", currentTime: t, duration: d, paused: !!video.paused
    });
  }

  function bindVideo(video) {
    if (!video || video.__captionStudioBound) return;
    video.__captionStudioBound = true;
    video.setAttribute("playsinline", "1");
    ["timeupdate", "play", "pause", "seeking", "seeked"].forEach(function (ev) {
      video.addEventListener(ev, postTime);
    });
    postTime();
  }

  function postVideoRect() {
    if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.rectHandler)) return;
    if (window !== window.top) return;
    var el = playerEl() || mainVideo();
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 60) return;
    window.webkit.messageHandlers.rectHandler.postMessage({
      type: "VIDEO_RECT",
      x: r.left, y: r.top, w: r.width, h: r.height,
      vw: window.innerWidth || 1, vh: window.innerHeight || 1
    });
  }

  function postLayout() {
    if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.layoutHandler)) return;
    try {
      window.webkit.messageHandlers.layoutHandler.postMessage(
        Object.assign({ type: "LAYOUT_CHECK" }, window.__csLayoutSmoke())
      );
    } catch (e) {}
  }

  // Match desktop: only watch?v=… is a caption session; home/search → no overlay/panel.
  function videoIdFromUrl() {
    try {
      return new URLSearchParams(location.search).get("v") || "";
    } catch (e) {
      return "";
    }
  }
  function postNav() {
    if (window !== window.top) return;
    if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.navHandler)) return;
    try {
      window.webkit.messageHandlers.navHandler.postMessage({
        type: "PAGE_NAV",
        videoId: videoIdFromUrl(),
        url: String(location.href || "")
      });
    } catch (e) {}
  }
  document.addEventListener("yt-navigate-finish", postNav);
  postNav();
  setTimeout(postNav, 800);

  setTimeout(postLayout, 2500);

  setInterval(function () {
    if (window !== window.top) return;
    var v = mainVideo();
    if (v) bindVideo(v);
    postTime();
    postVideoRect();
  }, 250);

  setInterval(postLayout, 5000);
})();
