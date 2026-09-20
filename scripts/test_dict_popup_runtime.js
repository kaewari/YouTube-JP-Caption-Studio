const settings = { dictShowSentence: true };

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hasVietnameseChars(str) {
  if (!str || typeof str !== "string") return false;
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(str);
}

function formatPosLabel(pos) {
  if (!pos) return "";
  const p = String(pos).toLowerCase();
  if (p.includes("keiyoushi") || p.includes("i-adjective")) return "Tính từ (-i)";
  if (p.includes("keiyodoushi") || p.includes("na-adjective")) return "Tính từ (-na)";
  if (p.includes("futsuumeishi") || p.includes("noun (common)")) return "Danh từ";
  if (p.includes("noun")) return "Danh từ";
  if (p.includes("verb") || p.includes("ichidan") || p.includes("godan") || p.includes("suru")) return "Động từ";
  if (p.includes("fukushi") || p.includes("adverb")) return "Phó từ";
  if (p.includes("particle") || p.includes("joshi")) return "Trợ từ";
  if (p.includes("conjunction") || p.includes("setsuzokushi")) return "Liên từ";
  if (p.includes("pronoun")) return "Đại từ";
  if (p.includes("expression")) return "Cụm từ";
  if (p.includes("prefix")) return "Tiền tố";
  if (p.includes("suffix")) return "Hậu tố";
  return String(pos).replace(/\s*\([^)]*\)/g, "").trim() || pos;
}

function primaryGlossLine(d) {
  const senses = d?.senses || [];
  const viParts = [];
  const enParts = [];
  for (const sense of senses.slice(0, 4)) {
    for (const g of sense.gloss_vi || []) {
      if (g && !viParts.includes(g)) viParts.push(g);
    }
    for (const g of sense.gloss_en || []) {
      if (g && !enParts.includes(g)) enParts.push(g);
    }
  }
  return {
    vi: viParts.slice(0, 5).join(", "),
    en: enParts.slice(0, 4).join("; "),
  };
}

function renderDictHtml(dictEl, surface, lemma, d, ctx = {}) {
  const showSent = settings.dictShowSentence !== false;
  dictEl.classList.toggle("dict-hide-sentence", !showSent);
  dictEl.classList.add("upgraded-mazii-dict");

  const term = d.matched || surface;
  const reading = d.reading || (d.senses?.[0]?.reading || "");
  const hanviet = d.hanviet || "";
  const jlpt = (d.jlpt || ctx?.tokenJlpt || "").toUpperCase();
  const source = d.source || "Mazii JA-VI";
  const isPinned = !!ctx?.pinned;

  // Badges HTML
  const badges = [];
  if (reading) {
    badges.push(`<span class="dict-reading-top">[${escapeHtml(reading)}]</span>`);
  }
  if (hanviet) {
    badges.push(`<span class="dict-badge-hanviet">${escapeHtml(hanviet)}</span>`);
  }
  if (jlpt) {
    const jlptCls = `dict-badge-jlpt jlpt-${jlpt.toLowerCase()}`;
    badges.push(`<span class="${jlptCls}">${escapeHtml(jlpt)}</span>`);
  }
  if (isPinned) {
    badges.push(`<span class="dict-badge-pinned" title="Popup đã ghim">📌 Đã ghim</span>`);
  }
  badges.push(`<span class="dict-badge-source">${escapeHtml(source)}</span>`);

  // Senses & Primary Meaning calculation
  const senses = d.senses || [];
  const firstViList = (senses[0]?.gloss_vi || []).filter(Boolean);
  const firstEnList = (senses[0]?.gloss_en || []).filter(Boolean);

  let primaryText = "";
  let isPrimaryVi = false;

  if (firstViList.length > 0) {
    primaryText = firstViList.slice(0, 4).join(", ");
    isPrimaryVi = hasVietnameseChars(primaryText);
  }
  if (!primaryText && firstEnList.length > 0) {
    primaryText = firstEnList.slice(0, 3).join("; ");
    isPrimaryVi = false;
  }
  if (!primaryText) {
    const fallback = primaryGlossLine(d);
    if (fallback.vi && hasVietnameseChars(fallback.vi)) {
      primaryText = fallback.vi;
      isPrimaryVi = true;
    } else if (fallback.en || fallback.vi) {
      primaryText = fallback.en || fallback.vi;
      isPrimaryVi = hasVietnameseChars(primaryText);
    }
  }

  // Primary Meaning Banner
  let primaryBannerHtml = "";
  if (primaryText) {
    const bannerLabel = isPrimaryVi ? "Ý NGHĨA CHÍNH (TIẾNG VIỆT)" : "ĐỊNH NGHĨA";
    primaryBannerHtml = `<div class="dict-primary-banner ${isPrimaryVi ? "is-vi" : "is-en"}">
      <div class="dict-primary-label">${escapeHtml(bannerLabel)}</div>
      <div class="dict-primary-text">${escapeHtml(primaryText)}</div>
    </div>`;
  }

  // Check if gloss_vi is duplicated across all senses
  const allViIdentical = senses.length > 1 && senses.every((s) => {
    const sVi = (s.gloss_vi || []).join("; ");
    const s0Vi = (senses[0].gloss_vi || []).join("; ");
    return sVi === s0Vi;
  });

  // Detailed Senses & Definitions HTML
  let sensesHtml = "";
  if (senses.length > 0) {
    const senseRows = [];
    let senseIdx = 0;
    for (const s of senses.slice(0, 4)) {
      senseIdx++;
      const rawPos = (s.pos || []).filter(Boolean)[0] || "";
      const posLabel = formatPosLabel(rawPos);
      const sViRaw = (s.gloss_vi || []).slice(0, 4).join("; ");
      const sEnRaw = (s.gloss_en || []).slice(0, 3).join("; ");
      const sViIsReal = hasVietnameseChars(sViRaw);

      let viToShow = "";
      let enToShow = "";

      if (allViIdentical) {
        enToShow = sEnRaw || (sViIsReal ? "" : sViRaw);
      } else {
        if (sViIsReal) {
          viToShow = sViRaw;
          enToShow = sEnRaw;
        } else {
          enToShow = sEnRaw || sViRaw;
        }
      }

      if (!viToShow && !enToShow) continue;

      senseRows.push(`
        <div class="dict-sense-item">
          <span class="dict-sense-num">${senseIdx}</span>
          ${posLabel ? `<span class="dict-pos-badge">${escapeHtml(posLabel)}</span>` : ""}
          <div class="dict-sense-content">
            ${viToShow ? `<div class="dict-sense-vi">${escapeHtml(viToShow)}</div>` : ""}
            ${enToShow ? `<div class="dict-sense-en">${escapeHtml(enToShow)}</div>` : ""}
          </div>
        </div>
      `);
    }
    if (senseRows.length > 0) {
      sensesHtml = `<div class="dict-senses-list">${senseRows.join("")}</div>`;
    }
  }

  // Example sentences HTML
  let exampleBoxHtml = "";
  if (d.examples && d.examples.length > 0) {
    const ex = d.examples[0];
    exampleBoxHtml = `
      <div class="dict-example-box">
        <div class="dict-example-label">VÍ DỤ THỰC TẾ:</div>
        <div class="dict-example-ja">${escapeHtml(ex.ja)}</div>
        <div class="dict-example-vi">${escapeHtml(ex.vi)}</div>
      </div>
    `;
  }

  // Sentence context
  let sentenceHtml = "";
  if (ctx.sentenceVi || ctx.sentenceJa) {
    sentenceHtml = `
      <div class="dict-sep"></div>
      <div class="dict-sentence">
        ${ctx.sentenceVi ? `<div class="dict-sentence-vi">${escapeHtml(ctx.sentenceVi)}</div>` : ""}
        ${ctx.sentenceEn ? `<div class="dict-sentence-en">${escapeHtml(ctx.sentenceEn)}</div>` : ""}
      </div>
    `;
  }

  dictEl.innerHTML = `
    <div class="dict-top">
      <div class="dict-head-row">
        <strong class="dict-head">${escapeHtml(term)}</strong>
        ${badges.join(" ")}
      </div>
      <div class="dict-top-actions">
        <button type="button" class="dict-sent-toggle" aria-pressed="true" title="Hiện/ẩn dịch câu"></button>
        <button type="button" class="dict-close-btn" title="Đóng (Esc)">✕</button>
      </div>
    </div>
    ${primaryBannerHtml}
    ${sensesHtml}
    ${exampleBoxHtml}
    ${sentenceHtml}
  `;
}

// Sidepanel Hover Intent & Pinning State Machine
let spHoverIntentTimer = null;
let spActiveDictTok = null;
let spPinnedTok = null;
const SP_HOVER_INTENT_MS = 200;

function initSidepanelListeners() {
  const listEl = document.getElementById("sp-list");
  if (!listEl) return;

  listEl.addEventListener("mouseover", (e) => {
    const tok = e.target.closest(".tok");
    if (!tok || !listEl.contains(tok)) return;

    if (spPinnedTok) return; // Pinned!

    if (spActiveDictTok && spActiveDictTok !== tok) {
      if (spHoverIntentTimer) clearTimeout(spHoverIntentTimer);
      spHoverIntentTimer = setTimeout(() => {
        spHoverIntentTimer = null;
        spActiveDictTok = tok;
        listEl.querySelectorAll(".tok-dict-active").forEach(el => el.classList.remove("tok-dict-active"));
        tok.classList.add("tok-dict-active");
      }, SP_HOVER_INTENT_MS);
    } else {
      if (spHoverIntentTimer) clearTimeout(spHoverIntentTimer);
      spActiveDictTok = tok;
      listEl.querySelectorAll(".tok-dict-active").forEach(el => el.classList.remove("tok-dict-active"));
      tok.classList.add("tok-dict-active");
    }
  });

  listEl.addEventListener("mouseout", (e) => {
    const tok = e.target.closest(".tok");
    if (!tok || !listEl.contains(tok)) return;
    if (spHoverIntentTimer) {
      clearTimeout(spHoverIntentTimer);
      spHoverIntentTimer = null;
    }
  });

  listEl.addEventListener("click", (e) => {
    const tok = e.target.closest(".tok");
    if (!tok || !listEl.contains(tok)) return;
    e.stopPropagation();
    if (spPinnedTok === tok) {
      spPinnedTok = null;
    } else {
      spPinnedTok = tok;
      spActiveDictTok = tok;
      listEl.querySelectorAll(".tok-dict-active").forEach(el => el.classList.remove("tok-dict-active"));
      tok.classList.add("tok-dict-active");
    }
  });
}

window.renderDictHtml = renderDictHtml;
window.formatPosLabel = formatPosLabel;
window.hasVietnameseChars = hasVietnameseChars;
window.getActiveDictTok = () => spActiveDictTok;
window.getPinnedTok = () => spPinnedTok;
window.getHoverIntentTimer = () => spHoverIntentTimer;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSidepanelListeners);
} else {
  initSidepanelListeners();
}

