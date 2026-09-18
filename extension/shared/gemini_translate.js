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
  const BATCH_SIZE = 25;
  const STORAGE_KEY = "geminiApiKey";

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
   * Translates an array of Japanese sentences to Vietnamese in a single batched call.
   * @param {string[]} texts - Array of Japanese subtitle lines.
   * @param {string} apiKey - Google AI Studio API Key.
   * @returns {Promise<string[]>} Array of Vietnamese translations in same order.
   */
  async function translateBatch(texts, apiKey) {
    if (!texts || !texts.length) return [];
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
          parts: [{ text: JSON.stringify(texts) }]
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
    if (!candidateText) return texts.map(() => "");

    try {
      const parsed = JSON.parse(candidateText);
      if (Array.isArray(parsed.translations)) {
        return parsed.translations.map((s) => String(s || "").trim());
      }
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s || "").trim());
      }
    } catch (err) {
      console.warn("[gemini_translate] Failed to parse JSON response:", candidateText);
    }
    return texts.map(() => "");
  }

  /**
   * Translates subtitle cues that lack Vietnamese translation.
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
    for (let i = 0; i < needsTranslation.length; i += BATCH_SIZE) {
      const chunk = needsTranslation.slice(i, i + BATCH_SIZE);
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
          onProgress({ done: totalDone, total: needsTranslation.length });
        }
      } catch (err) {
        console.error("[gemini_translate] Batch translation error:", err);
        break;
      }
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
    translateBatch,
    translateCues,
  };
});
