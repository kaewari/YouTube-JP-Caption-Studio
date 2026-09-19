/**
 * In-page Settings Modal for YouTube JP Caption Studio.
 * Dark-mode minimalist single-column design:
 * 1. Word colors toggles & preview
 * 2. Display & Overlay (Opacity slider with live preview, dictionary, autopause, etc.)
 * 3. AI Translation (Gemini 3.8 Flash API key test & save)
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
    const opacityVal = s.barBgOpacity != null ? Number(s.barBgOpacity) : 0.4;
    const opacityPct = Math.round(opacityVal * 100);

    return `
      <div class="lr-settings-backdrop" id="lr-settings-backdrop">
        <div class="lr-settings-dialog" role="dialog" aria-modal="true">
          <div class="lr-settings-header">
            <h2>Caption Studio — Cài đặt</h2>
            <button type="button" class="lr-settings-close" id="lr-settings-close-x" aria-label="Close">✕</button>
          </div>
          <div class="lr-settings-body">
            <!-- Section 1: Word colors -->
            <div class="lr-settings-section">
              <div class="lr-settings-section-title">
                <span>Màu sắc từ vựng (Word Colors):</span>
                <button type="button" class="lr-link-btn" id="lr-reset-colors">Đặt lại mặc định</button>
              </div>

              <div class="lr-color-toggles">
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-dot lr-dot-known"></i> Từ đã biết (Known words)</span>
                  <input type="checkbox" id="lr-cat-known" class="lr-switch" ${cats.known ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-dot lr-dot-suggested"></i> Từ gợi ý học (Suggested Words)</span>
                  <input type="checkbox" id="lr-cat-suggested" class="lr-switch" ${cats.suggested ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-dot lr-dot-learning"></i> Đang học (Marked to Learn)</span>
                  <input type="checkbox" id="lr-cat-learning" class="lr-switch" ${cats.learning ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-border-box"></i> Đang học - Viền chữ (Outline)</span>
                  <input type="checkbox" id="lr-cat-learning-border" class="lr-switch" ${cats.learningBorder ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-dot lr-dot-ignored"></i> Bỏ qua (Don't learn)</span>
                  <input type="checkbox" id="lr-cat-ignored" class="lr-switch" ${cats.ignored ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span class="lr-toggle-label"><i class="lr-dot lr-dot-special"></i> Từ đặc biệt (Special words)</span>
                  <input type="checkbox" id="lr-cat-special" class="lr-switch" ${cats.special ? "checked" : ""}>
                </label>
              </div>

              <div class="lr-preview-box">
                <div class="lr-preview-title">Ví dụ minh họa (Preview):</div>
                <div class="lr-preview-content" id="lr-preview-text">
                  The first night I went to <span class="tok-known">sleep</span> on the <span class="tok-rare">sand</span>, a <span class="tok-learning">thousand</span> miles from any <span class="tok-special">human</span> habitation. I was more <span class="tok-ignored">isolated</span> than a shipwrecked sailor on a raft in the <span class="tok-known">middle</span> of the ocean.
                </div>
              </div>
            </div>

            <div class="lr-settings-divider"></div>

            <!-- Section 2: Display & Overlay -->
            <div class="lr-settings-section">
              <div class="lr-settings-section-title">
                <span>Hiển thị & Lớp phủ Subtitle (Overlay):</span>
              </div>

              <div class="lr-slider-group">
                <div class="lr-slider-header">
                  <span>Độ mờ nền Overlay (Opacity)</span>
                  <span class="lr-slider-val" id="lr-opacity-val">${opacityPct}%</span>
                </div>
                <input type="range" id="lr-opt-opacity" class="lr-range-slider" min="0" max="1" step="0.05" value="${opacityVal}">
              </div>

              <div class="lr-display-toggles">
                <label class="lr-toggle-row">
                  <span>Hiện từ điển mini khi hover vào từ</span>
                  <input type="checkbox" id="lr-opt-dict" class="lr-switch" ${s.showMiniDict !== false ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span>Hiện thanh điều khiển phụ đề (Trái / Phải)</span>
                  <input type="checkbox" id="lr-opt-sub-controls" class="lr-switch" ${s.showSubControls !== false ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span>Tự động tạm dừng (AP) khi hết câu phụ đề</span>
                  <input type="checkbox" id="lr-opt-autopause" class="lr-switch" ${s.autoPause ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span>Hiện phụ đề bên dưới video</span>
                  <input type="checkbox" id="lr-opt-below-video" class="lr-switch" ${s.subBelowVideo ? "checked" : ""}>
                </label>
                <label class="lr-toggle-row">
                  <span>Tô màu JLPT cho bản dịch VI/EN song ngữ</span>
                  <input type="checkbox" id="lr-opt-bilingual-jlpt" class="lr-switch" ${s.enableBilingualJlptColor !== false ? "checked" : ""}>
                </label>
              </div>
            </div>

            <div class="lr-settings-divider"></div>

            <!-- Section 3: AI Translation -->
            <div class="lr-settings-section">
              <div class="lr-settings-section-title">
                <span>Dịch tự động AI Studio (Gemini 3.8 Flash):</span>
              </div>
              <div class="lr-api-input-wrap">
                <input type="password" id="lr-gemini-key" class="lr-input" placeholder="AIzaSy... (Dán Google AI Studio API Key)" value="${escapeHtml(key)}" />
                <button type="button" id="lr-save-gemini-key" class="lr-btn-save">Lưu & Thử kết nối</button>
              </div>
              <div id="lr-gemini-status" class="lr-api-status"></div>
            </div>
          </div>

          <div class="lr-settings-footer">
            <button type="button" class="lr-btn-close" id="lr-settings-close-btn">Đóng</button>
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

    // Reset Word Colors
    const resetBtn = host.querySelector("#lr-reset-colors");
    resetBtn?.addEventListener("click", () => {
      currentSettings.vocabCats = {
        known: true,
        suggested: true,
        learning: true,
        learningBorder: true,
        ignored: true,
        special: true,
      };
      ["known", "suggested", "learning", "learning-border", "ignored", "special"].forEach((cat) => {
        const el = host.querySelector(`#lr-cat-${cat}`);
        if (el) el.checked = true;
      });
      if (typeof onSettingsChanged === "function") onSettingsChanged(currentSettings);
    });

    // Opacity Slider (Real-time preview)
    const optOpacity = host.querySelector("#lr-opt-opacity");
    const opacityValEl = host.querySelector("#lr-opacity-val");
    optOpacity?.addEventListener("input", () => {
      const val = Number(optOpacity.value);
      if (opacityValEl) opacityValEl.textContent = `${Math.round(val * 100)}%`;
      currentSettings.barBgOpacity = val;
      const bar = document.getElementById("hardsub-ocr-bar");
      if (bar) {
        bar.style.setProperty("--bar-bg-alpha", String(val));
      }
      if (typeof onSettingsChanged === "function") onSettingsChanged(currentSettings);
    });

    // Gemini API key test & save
    const keyInput = host.querySelector("#lr-gemini-key");
    const saveKeyBtn = host.querySelector("#lr-save-gemini-key");
    const statusEl = host.querySelector("#lr-gemini-status");

    saveKeyBtn?.addEventListener("click", async () => {
      const enteredKey = keyInput?.value?.trim() || "";
      if (statusEl) {
        statusEl.className = "lr-api-status lr-api-status--loading";
        statusEl.textContent = "Đang kiểm tra kết nối Gemini 3.8 Flash...";
      }
      if (!enteredKey) {
        if (globalThis.HardsubGeminiTranslate) {
          await globalThis.HardsubGeminiTranslate.saveApiKey("");
        }
        if (statusEl) {
          statusEl.className = "lr-api-status";
          statusEl.textContent = "Đã xóa API key.";
        }
        return;
      }
      if (globalThis.HardsubGeminiTranslate) {
        const testRes = await globalThis.HardsubGeminiTranslate.testApiKey(enteredKey);
        if (testRes.ok) {
          await globalThis.HardsubGeminiTranslate.saveApiKey(enteredKey);
          if (statusEl) {
            statusEl.className = "lr-api-status lr-api-status--ok";
            statusEl.textContent = "✓ Kết nối Gemini 3.8 Flash thành công!";
          }
          if (typeof onSettingsChanged === "function") {
            onSettingsChanged({ geminiApiKey: enteredKey, hasApiKey: true });
          }
        } else {
          if (statusEl) {
            statusEl.className = "lr-api-status lr-api-status--err";
            statusEl.textContent = `✗ Kết nối thất bại: ${testRes.error || "Key không hợp lệ"}`;
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

    const optBelow = host.querySelector("#lr-opt-below-video");
    optBelow?.addEventListener("change", () => {
      currentSettings.subBelowVideo = !!optBelow.checked;
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
