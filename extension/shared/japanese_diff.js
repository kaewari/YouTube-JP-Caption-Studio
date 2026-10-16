/**
 * Japanese text token-level LCS diffing with Intl.Segmenter.
 * Renders inline visual diffs with <del class="sp-diff-del"> and <ins class="sp-diff-ins">.
 */

(function () {
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function segmentJapanese(text) {
    if (!text) return [];
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      try {
        const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
        return Array.from(segmenter.segment(text), s => s.segment);
      } catch {
        // Fallback if locale unsupported
      }
    }
    // Character-level fallback
    return Array.from(text);
  }

  /**
   * Computes LCS diff between tokensA (original) and tokensB (candidate).
   * Returns array of chunks: { type: 'common' | 'del' | 'ins', text: string }
   */
  function computeDiff(tokensA, tokensB) {
    const m = tokensA.length;
    const n = tokensB.length;

    // dp[i][j] stores length of LCS of tokensA[0..i-1] and tokensB[0..j-1]
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (tokensA[i - 1] === tokensB[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to build raw diff
    let i = m;
    let j = n;
    const rawChunks = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && tokensA[i - 1] === tokensB[j - 1]) {
        rawChunks.push({ type: "common", text: tokensA[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        rawChunks.push({ type: "ins", text: tokensB[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        rawChunks.push({ type: "del", text: tokensA[i - 1] });
        i--;
      }
    }
    rawChunks.reverse();

    // Merge contiguous chunks of the same type
    const merged = [];
    for (const chunk of rawChunks) {
      if (merged.length && merged[merged.length - 1].type === chunk.type) {
        merged[merged.length - 1].text += chunk.text;
      } else {
        merged.push({ ...chunk });
      }
    }
    return merged;
  }

  /**
   * Generates safe HTML string with inline <del> and <ins> tags.
   */
  function renderJapaneseDiffHtml(originalText, candidateText) {
    const orig = String(originalText || "");
    const cand = String(candidateText || "");

    if (!orig && !cand) return "";
    if (!orig) return `<ins class="sp-diff-ins">${escapeHtml(cand)}</ins>`;
    if (!cand) return `<del class="sp-diff-del">${escapeHtml(orig)}</del>`;
    if (orig === cand) return escapeHtml(cand);

    const tokensA = segmentJapanese(orig);
    const tokensB = segmentJapanese(cand);
    const diff = computeDiff(tokensA, tokensB);

    return diff.map(chunk => {
      const esc = escapeHtml(chunk.text);
      if (chunk.type === "ins") {
        return `<ins class="sp-diff-ins">${esc}</ins>`;
      }
      if (chunk.type === "del") {
        return `<del class="sp-diff-del">${esc}</del>`;
      }
      return esc;
    }).join("");
  }

  const api = {
    segmentJapanese,
    computeDiff,
    renderJapaneseDiffHtml,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.HardsubJapaneseDiff = api;
  }
})();
