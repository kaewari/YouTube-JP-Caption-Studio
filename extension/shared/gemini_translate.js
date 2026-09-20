/**
 * Fast Japanese -> Vietnamese Subtitle Translation via Google AI Studio (Gemini 3.8 Flash).
 * Batches subtitle cues to minimize round-trip latency and optimize throughput.
 * Works in Browser (content script / extension SW) and Node.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.HardsubGeminiTranslate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MODEL_NAME = "gemini-3.8-flash";
  const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"];
  let workingModel = MODEL_NAME;
  const BATCH_SIZE = 15;
  const STORAGE_KEY = "geminiApiKey";

  const ramCache = new Map();

  function hashText(text) {
    let hash = 0;
    const str = String(text || "").trim();
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return "htc_" + hash;
  }

  async function getCachedTranslation(text) {
    const clean = String(text || "").trim();
    if (!clean) return "";
    if (ramCache.has(clean)) return ramCache.get(clean);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const key = hashText(clean);
      try {
        const res = await chrome.storage.local.get([key]);
        if (res && res[key]) {
          ramCache.set(clean, res[key]);
          return res[key];
        }
      } catch (_) {}
    }
    return "";
  }

  async function setCachedTranslation(text, translation) {
    const clean = String(text || "").trim();
    const vi = String(translation || "").trim();
    if (!clean || !vi) return;
    ramCache.set(clean, vi);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const key = hashText(clean);
      try {
        await chrome.storage.local.set({ [key]: vi });
      } catch (_) {}
    }
  }

  async function getStoredApiKey() {
    if (typeof chrome !== "undefined" && chrome.storage) {
      try {
        const local = await chrome.storage.local.get([STORAGE_KEY]);
        if (local && local[STORAGE_KEY]) return String(local[STORAGE_KEY]).trim();
        const sync = await chrome.storage.sync.get([STORAGE_KEY]);
        if (sync && sync[STORAGE_KEY]) return String(sync[STORAGE_KEY]).trim();
      } catch (_) {}
    }
    if (typeof process !== "undefined" && process.env && process.env.GEMINI_API_KEY) {
      return String(process.env.GEMINI_API_KEY).trim();
    }
    return "";
  }

  async function saveApiKey(key) {
    const clean = String(key || "").trim();
    if (typeof chrome !== "undefined" && chrome.storage) {
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: clean });
        if (chrome.storage.sync) {
          await chrome.storage.sync.set({ [STORAGE_KEY]: clean }).catch(() => {});
        }
      } catch (_) {}
    }
    return clean;
  }

  async function testApiKey(apiKey) {
    const key = String(apiKey || "").trim();
    if (!key) return { ok: false, error: "API key is empty" };
    
    const candidateModels = [MODEL_NAME, ...FALLBACK_MODELS];
    let lastErr = "";
    for (const model of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Translate to Vietnamese: 'こんにちは'" }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 30 }
          })
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          lastErr = `HTTP ${resp.status}: ${errText}`;
          if (resp.status === 404) continue; // Try fallback model
          return { ok: false, status: resp.status, error: lastErr };
        }
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        workingModel = model;
        return { ok: true, model: workingModel, sample: text.trim() };
      } catch (err) {
        lastErr = String(err);
      }
    }
    return { ok: false, error: lastErr || "Failed to connect to Gemini API" };
  }

  /**
   * Ultra-fast single cue translation (<200ms) with persistent cache (<3ms).
   * @param {string} text - Japanese subtitle text
   * @param {string} [apiKey] - Google AI Studio API key
   * @returns {Promise<string>} Natural Vietnamese translation
   */
  async function translateSingle(text, apiKey) {
    const clean = String(text || "").trim();
    if (!clean) return "";
    const cached = await getCachedTranslation(clean);
    if (cached) return cached;

    const key = apiKey || (await getStoredApiKey());
    if (!key) return "";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${workingModel || MODEL_NAME}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Dịch câu phụ đề tiếng Nhật sau sang tiếng Việt ngắn gọn, tự nhiên theo ngữ cảnh phim/video (chỉ trả về bản dịch tiếng Việt, không giải thích): ${JSON.stringify(clean)}` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 60 }
        })
      });
      if (!resp.ok) return "";
      const data = await resp.json();
      const rawVi = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      const vi = rawVi.replace(/^["'“”]|["'“”]$/g, "").trim();
      if (vi) {
        await setCachedTranslation(clean, vi);
      }
      return vi;
    } catch (_) {
      return "";
    }
  }

  /**
   * Translates an array of Japanese sentences to Vietnamese in a single batched call.
   * Utilizes persistent cache first, only sending uncached lines to Gemini API.
   * @param {string[]} texts - Array of Japanese subtitle lines.
   * @param {string} apiKey - Google AI Studio API Key.
   * @returns {Promise<string[]>} Array of Vietnamese translations in same order.
   */
  async function translateBatch(texts, apiKey) {
    if (!texts || !texts.length) return [];

    const results = new Array(texts.length).fill("");
    const uncachedIndices = [];
    const uncachedTexts = [];

    for (let idx = 0; idx < texts.length; idx++) {
      const cached = await getCachedTranslation(texts[idx]);
      if (cached) {
        results[idx] = cached;
      } else {
        uncachedIndices.push(idx);
        uncachedTexts.push(texts[idx]);
      }
    }

    if (!uncachedTexts.length) {
      return results;
    }

    const key = apiKey || (await getStoredApiKey());
    if (!key) throw new Error("No Gemini API key configured. Please set your Google AI Studio API key.");

    const systemPrompt = "You are an expert anime/movie subtitle translator from Japanese to natural Vietnamese. " +
      "Translate each given Japanese subtitle sentence concisely and naturally into Vietnamese according to movie dialogue context. " +
      "Return strictly valid JSON with a single key 'translations' containing an array of Vietnamese strings in the exact same order and length as input.";

    const payload = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          parts: [{ text: JSON.stringify(uncachedTexts) }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    };

    const modelsToTry = [workingModel || MODEL_NAME, ...FALLBACK_MODELS.filter((m) => m !== workingModel)];
    let lastStatus = 0;
    let lastErr = "";
    let data = null;

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        lastStatus = resp.status;
        lastErr = await resp.text().catch(() => "");
        if (resp.status === 404) continue;
        throw new Error(`Gemini API error (HTTP ${resp.status}): ${lastErr}`);
      }
      data = await resp.json();
      workingModel = model;
      break;
    }

    if (!data) {
      throw new Error(`Gemini API error (HTTP ${lastStatus}): ${lastErr}`);
    }
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return results;

    let apiTranslations = [];
    try {
      const parsed = JSON.parse(candidateText);
      if (Array.isArray(parsed.translations)) {
        apiTranslations = parsed.translations.map((s) => String(s || "").trim());
      } else if (Array.isArray(parsed)) {
        apiTranslations = parsed.map((s) => String(s || "").trim());
      }
    } catch (err) {
      console.warn("[gemini_translate] Failed to parse JSON response:", candidateText);
    }

    for (let j = 0; j < uncachedIndices.length; j++) {
      const vi = apiTranslations[j] || "";
      const origIdx = uncachedIndices[j];
      results[origIdx] = vi;
      if (vi) {
        await setCachedTranslation(uncachedTexts[j], vi);
      }
    }

    return results;
  }

  /**
   * Translates subtitle cues with cache-first and parallel batch execution (concurrency = 3).
   * @param {object[]} cues - Cue array { id, source, vi, translated, ... }
   * @param {string} [apiKey] - Google AI Studio API key
   * @param {(info: { done: number, total: number }) => void} [onProgress]
   */
  async function translateCues(cues, apiKey, onProgress) {
    const key = apiKey || (await getStoredApiKey());
    if (!key) return 0;

    const needsTranslation = (cues || []).filter(
      (c) => c && c.source && String(c.source).trim() && !String(c.vi || "").trim() && !c.mt_locked
    );
    if (!needsTranslation.length) return 0;

    let totalDone = 0;
    const stillNeeded = [];

    // Instant cache check (<1ms)
    for (const cue of needsTranslation) {
      const cached = await getCachedTranslation(cue.source);
      if (cached) {
        cue.vi = cached;
        cue.translated = true;
        cue.translation_source = "cache";
        totalDone++;
      } else {
        stillNeeded.push(cue);
      }
    }

    if (totalDone > 0 && typeof onProgress === "function") {
      onProgress({ done: totalDone, total: needsTranslation.length });
    }
    if (!stillNeeded.length) return totalDone;

    // Parallel batch execution with chunks of 15 and concurrency = 3
    const chunkSize = BATCH_SIZE;
    const chunks = [];
    for (let i = 0; i < stillNeeded.length; i += chunkSize) {
      chunks.push(stillNeeded.slice(i, i + chunkSize));
    }

    const CONCURRENCY = 3;
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const activeBatch = chunks.slice(i, i + CONCURRENCY);
      await Promise.all(
        activeBatch.map(async (chunk) => {
          const texts = chunk.map((c) => String(c.source || "").trim());
          try {
            const translations = await translateBatch(texts, key);
            for (let j = 0; j < chunk.length; j++) {
              const viText = translations[j] || "";
              if (viText) {
                chunk[j].vi = viText;
                chunk[j].translated = true;
                chunk[j].translation_source = "gemini";
              }
            }
            totalDone += chunk.length;
            if (typeof onProgress === "function") {
              onProgress({ done: Math.min(totalDone, needsTranslation.length), total: needsTranslation.length });
            }
          } catch (err) {
            console.error("[gemini_translate] Batch translation error:", err);
          }
        })
      );
    }
    return totalDone;
  }

  return {
    MODEL_NAME,
    BATCH_SIZE,
    STORAGE_KEY,
    getStoredApiKey,
    saveApiKey,
    testApiKey,
    translateSingle,
    getCachedTranslation,
    setCachedTranslation,
    translateBatch,
    translateCues,
  };
});
