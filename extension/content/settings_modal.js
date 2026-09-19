/**
 * In-page Settings Modal for Language Reactor 5.1.8 parity.
 * Matches Image 9: Word colors, sample preview, Gemini 3.8 Flash API key, and display options.
 */
(function (root) {
  let modalEl = null;

  function createModalHtml(settings, geminiApiKey) {
    const s = settings || {};
    const cats = s.vocabCats || {
      known: true,
      suggested: true,
      learning: true,
      learningBorder: true,
      ignored: true,
      special: true,
    };
    const key = geminiApiKey || "";

    return `
      <div class="lr-settings-backdrop" id="lr-settings-backdrop">
        <div class="lr-settings-dialog" role="dialog" aria-modal="true">
          <div class="lr-settings-header">
            <h2>Language Reactor - Settings</h2>
            <button type="button" class="lr-settings-close" id="lr-settings-close-x" aria-label="Close">✕</button>
          </div>
          <div class="lr-settings-body">
            <div class="lr-settings-col-left">
              <div class="lr-settings-promo">
                <p>Do you like Language Reactor?<br>Please help us by leaving a review in the Chrome webstore.</p>
                <a href="https://chrome.google.com/webstore" target="_blank" rel="noreferrer" class="lr-btn-blue">Write a review</a>
                <a href="https://twitter.com" target="_blank" rel="noreferrer" class="lr-btn-cyan">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.05c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/></svg>
                  Tweet about Language Reactor
                </a>
              </div>
            </div>
            <div class="lr-settings-col-right">
              <div class="lr-settings-section-title">
                <span>Word colors:</span>
                <button type="button" class="lr-link-btn" id="lr-reset-colors">Reset</button>
              </div>

              <div class="lr-color-toggles">
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-dot lr-dot-known"></i> Known words</span>
                  <input type="checkbox" id="lr-cat-known" class="lr-switch" ${cats.known ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-dot lr-dot-suggested"></i> Suggested Words</span>
                  <input type="checkbox" id="lr-cat-suggested" class="lr-switch" ${cats.suggested ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-dot lr-dot-learning"></i> Marked to Learn</span>
                  <input type="checkbox" id="lr-cat-learning" class="lr-switch" ${cats.learning ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-border-box"></i> Marked to Learn - Outline</span>
                  <input type="checkbox" id="lr-cat-learning-border" class="lr-switch" ${cats.learningBorder ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-dot lr-dot-ignored"></i> Don't learn</span>
                  <input type="checkbox" id="lr-cat-ignored" class="lr-switch" ${cats.ignored ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-dot lr-dot-special"></i> Special words</span>
                  <input type="checkbox" id="lr-cat-special" class="lr-switch" ${cats.special ? "checked" : ""}>
                </label>
              </div>

              <div class="lr-preview-box">
                <div class="lr-preview-title">Example text:</div>
                <div class="lr-preview-content" id="lr-preview-text">
                  The first night I went to <span class="tok-known">sleep</span> on the <span class="tok-rare">sand</span>, a <span class="tok-learning">thousand</span> miles from any <span class="tok-special">human</span> habitation. I was more <span class="tok-ignored">isolated</span> than a shipwrecked sailor on a raft in the <span class="tok-known">middle</span> of the ocean.
                </div>
              </div>

              <div class="lr-settings-divider"></div>

              <div class="lr-gemini-section">
                <div class="lr-settings-section-title">
                  <span>Google AI Studio (Gemini 3.8 Flash) Translation:</span>
                </div>
                <div class="lr-api-input-wrap">
                  <input type="password" id="lr-gemini-key" class="lr-input" placeholder="AIzaSy... (Paste Google AI Studio API Key)" value="${escapeHtml(key)}" />
                  <button type="button" id="lr-save-gemini-key" class="lr-btn-save">Save & Test</button>
                </div>
                <div id="lr-gemini-status" class="lr-api-status"></div>
              </div>

              <div class="lr-settings-divider"></div>

              <div class="lr-display-toggles">
                <label class="lr-toggle-row">
                  <span>Show mini dictionary on hover</span>
                  <input type="checkbox" id="lr-opt-dict" class="lr-switch" ${s.showMiniDict !== false ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span>Show subtitle controls (Left/Right bars)</span>
                  <input type="checkbox" id="lr-opt-sub-controls" class="lr-switch" ${s.showSubControls !== false ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span>Auto-pause (AP) when subtitle ends</span>
                  <input type="checkbox" id="lr-opt-autopause" class="lr-switch" ${s.autoPause ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span>Show subtitles below video</span>
                  <input type="checkbox" id="lr-opt-below-video" class="lr-switch" ${s.subBelowVideo ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span>Tô màu JLPT cho bản dịch VI/EN</span>
                  <input type="checkbox" id="lr-opt-bilingual-jlpt" class="lr-switch" ${s.enableBilingualJlptColor !== false ? "checked" : ""}>
                </label>
              </div>
            </div>
          </div>
          <div class="lr-settings-footer">
            <button type="button" class="lr-btn-close" id="lr-settings-close-btn">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function openSettingsModal(currentSettings, onSettingsChanged) {
    if (modalEl) closeModal();

    let apiKey = "";
    if (globalThis.HardsubGeminiTranslate) {
      apiKey = await globalThis.HardsubGeminiTranslate.getStoredApiKey();
    }

    const host = document.createElement("div");
    host.id = "lr-settings-modal-host";
    host.innerHTML = createModalHtml(currentSettings, apiKey);
    document.body.appendChild(host);
    modalEl = host;

    const closeBtn = host.querySelector("#lr-settings-close-btn");
    const closeX = host.querySelector("#lr-settings-close-x");
    const backdrop = host.querySelector("#lr-settings-backdrop");

    const handleClose = () => closeModal();
    closeBtn?.addEventListener("click", handleClose);
    closeX?.addEventListener("click", handleClose);
    backdrop?.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });

    // Gemini API key test & save
    const keyInput = host.querySelector("#lr-gemini-key");
    const saveKeyBtn = host.querySelector("#lr-save-gemini-key");
    const statusEl = host.querySelector("#lr-gemini-status");

    saveKeyBtn?.addEventListener("click", async () => {
      const enteredKey = keyInput?.value?.trim() || "";
      if (statusEl) {
        statusEl.className = "lr-api-status lr-api-status--loading";
        statusEl.textContent = "Testing Gemini 3.8 Flash connection...";
      }
      if (!enteredKey) {
        if (globalThis.HardsubGeminiTranslate) {
          await globalThis.HardsubGeminiTranslate.saveApiKey("");
        }
        if (statusEl) {
          statusEl.className = "lr-api-status";
          statusEl.textContent = "API key cleared.";
        }
        return;
      }
      if (globalThis.HardsubGeminiTranslate) {
        const testRes = await globalThis.HardsubGeminiTranslate.testApiKey(enteredKey);
        if (testRes.ok) {
          await globalThis.HardsubGeminiTranslate.saveApiKey(enteredKey);
          if (statusEl) {
            statusEl.className = "lr-api-status lr-api-status--ok";
            statusEl.textContent = "✓ Connected to Gemini 3.8 Flash successfully!";
          }
          if (typeof onSettingsChanged === "function") {
            onSettingsChanged({ geminiApiKey: enteredKey, hasApiKey: true });
          }
        } else {
          if (statusEl) {
            statusEl.className = "lr-api-status lr-api-status--err";
            statusEl.textContent = `✗ Connection failed: ${testRes.error || "Invalid key"}`;
          }
        }
      }
    });

    // Category toggles & preview
    const cats = ["known", "suggested", "learning", "learning-border", "ignored", "special"];
    cats.forEach((cat) => {
      const el = host.querySelector(`#lr-cat-${cat}`);
      el?.addEventListener("change", () => {
        const catKey = cat === "learning-border" ? "learningBorder" : cat;
        if (!currentSettings.vocabCats) currentSettings.vocabCats = {};
        currentSettings.vocabCats[catKey] = !!el.checked;
        if (typeof onSettingsChanged === "function") {
          onSettingsChanged(currentSettings);
        }
      });
    });

    // Display options
    const optDict = host.querySelector("#lr-opt-dict");
    optDict?.addEventListener("change", () => {
      currentSettings.showMiniDict = !!optDict.checked;
      if (typeof onSettingsChanged === "function") onSettingsChanged(currentSettings);
    });

    const optSubCtrl = host.querySelector("#lr-opt-sub-controls");
    optSubCtrl?.addEventListener("change", () => {
      currentSettings.showSubControls = !!optSubCtrl.checked;
      if (typeof onSettingsChanged === "function") onSettingsChanged(currentSettings);
    });

    const optAP = host.querySelector("#lr-opt-autopause");
    optAP?.addEventListener("change", () => {
      currentSettings.autoPause = !!optAP.checked;
      if (typeof onSettingsChanged === "function") onSettingsChanged(currentSettings);
    });

    const optBilingual = host.querySelector("#lr-opt-bilingual-jlpt");
    optBilingual?.addEventListener("change", () => {
      currentSettings.enableBilingualJlptColor = !!optBilingual.checked;
      if (typeof onSettingsChanged === "function") onSettingsChanged(currentSettings);
    });
  }

  function closeModal() {
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
  }

  root.HardsubSettingsModal = {
    open: openSettingsModal,
    close: closeModal,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
