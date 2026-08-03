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

      /* Masthead only — leave secondary/related rails alone */
      ytd-masthead, #masthead-container { display: none !important; }

      /* Title + owner/subscribe row — not whole under-player rail */
      ytd-watch-metadata #title,
      ytd-watch-metadata #owner,
      ytd-watch-metadata #top-row,
      ytd-watch-metadata #actions,
      ytd-watch-metadata #menu-container {
        display: none !important;
      }

      html, body, ytd-app { background: #121212 !important; }

      /* Soft widen in landscape pane — no fixed player, no under-player wipe, contain not cover. */
      @media (orientation: landscape) {
        ytd-player,
        #player,
        #movie_player,
        #player-container-inner {
          width: 100% !important;
          max-width: 100% !important;
        }
        #movie_player video.html5-main-video,
        #movie_player video {
          object-fit: contain !important;
        }
      }
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

  // ponytail: bridge storms heat the device — ~8Hz + skip unchanged pause/time
  var __csLastPostT = -1;
  var __csLastPostPaused = null;
  var __csLastPostAt = 0;
  function postTime(force) {
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
    var paused = !!video.paused;
    var now = Date.now();
    if (!force) {
      if (paused === __csLastPostPaused && Math.abs(t - __csLastPostT) < 0.05 && now - __csLastPostAt < 120) return;
      if (now - __csLastPostAt < 100) return;
    }
    __csLastPostT = t;
    __csLastPostPaused = paused;
    __csLastPostAt = now;
    window.webkit.messageHandlers.timeHandler.postMessage({
      type: "TIME_UPDATE", currentTime: t, duration: d, paused: paused
    });
  }

  // ponytail: YT web may still block background; Premium ≠ WKWebView
  var __csWantPlay = false;
  function resumeIfWanted() {
    if (!__csWantPlay) return;
    var v = mainVideo();
    if (!v) return;
    try {
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") resumeIfWanted();
  });
  document.addEventListener("pagehide", resumeIfWanted);

  function postFullscreenActive(active, mode) {
    if (window !== window.top) return;
    if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fullscreenHandler)) return;
    try {
      window.webkit.messageHandlers.fullscreenHandler.postMessage({
        active: !!active,
        mode: mode || (window.__csAppFull ? "app" : "os")
      });
    } catch (e) {}
  }
  // App maximize only — never webkitEnterFullscreen (system FS layer covers the overlay).
  // Safety net: any OS video/element fullscreen is force-killed and converted to app mode.
  function killOsFullscreen() {
    var v = mainVideo();
    if (v && v.webkitDisplayingFullscreen) {
      try { if (typeof v.webkitExitFullscreen === "function") v.webkitExitFullscreen(); } catch (e) {}
    }
    var de = document.fullscreenElement || document.webkitFullscreenElement;
    if (de) {
      try {
        if (document.exitFullscreen && typeof document.exitFullscreen === "function") document.exitFullscreen();
        else if (document.webkitExitFullscreen && typeof document.webkitExitFullscreen === "function") document.webkitExitFullscreen();
      } catch (e) {}
    }
  }
  var __csFsKillTimer = null;
  function forceAppFullscreen() {
    window.__csAppFull = true;
    killOsFullscreen();
    postFullscreenActive(true, "app");
    // ponytail: exit is async — if its end event never fires, re-kill once.
    clearTimeout(__csFsKillTimer);
    __csFsKillTimer = setTimeout(function () {
      var v = mainVideo();
      if ((v && v.webkitDisplayingFullscreen) || !!(document.fullscreenElement || document.webkitFullscreenElement)) {
        killOsFullscreen();
      }
    }, 400);
  }
  function postFullscreen() {
    var v = mainVideo();
    if ((v && v.webkitDisplayingFullscreen) || !!(document.fullscreenElement || document.webkitFullscreenElement)) {
      forceAppFullscreen();
      return;
    }
    postFullscreenActive(!!window.__csAppFull, "app");
  }
  ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) {
    document.addEventListener(ev, postFullscreen);
  });

  window.__csToggleFull = function () {
    if (window.__csAppFull) {
      window.__csAppFull = false;
      postFullscreenActive(false, "app");
      return;
    }
    forceAppFullscreen();
  };

  // Intercept YT FS button — block unsupported tooltip; same path as full pill.
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var btn = t.closest(".ytp-fullscreen-button");
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    window.__csToggleFull();
  }, true);

  function bindVideo(video) {
    if (!video || video.__captionStudioBound) return;
    video.__captionStudioBound = true;
    video.setAttribute("playsinline", "1");
    video.addEventListener("play", function () { __csWantPlay = true; });
    video.addEventListener("pause", function () {
      if (document.visibilityState !== "hidden") __csWantPlay = false;
    });
    ["timeupdate", "play", "pause", "seeking", "seeked"].forEach(function (ev) {
      video.addEventListener(ev, function () {
        postTime(ev === "play" || ev === "pause" || ev === "seeked" || ev === "seeking");
      });
    });
    if (!video.__csFsBound) {
      video.__csFsBound = true;
      video.addEventListener("webkitbeginfullscreen", postFullscreen);
      video.addEventListener("webkitendfullscreen", postFullscreen);
    }
    postTime(true);
  }

  var __csLastRect = "";
  function postVideoRect() {
    if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.rectHandler)) return;
    if (window !== window.top) return;
    var el = playerEl() || mainVideo();
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 60) return;
    // Integer CSS px — skip bridge when layout hasn't moved.
    var key = [r.left|0, r.top|0, r.width|0, r.height|0, window.innerWidth|0, window.innerHeight|0].join(",");
    if (key === __csLastRect) return;
    __csLastRect = key;
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
    // Fallback only — timeupdate already posts while playing.
    postTime(false);
    postVideoRect();
  }, 500);

  setInterval(postLayout, 5000);
})();
