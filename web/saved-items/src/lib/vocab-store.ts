import {
  BRIDGE_BASE,
  getChromeStorage,
  getChromeStorageOnChanged,
  hasChromeStorage,
  type ChromeStorageChange,
} from "@/lib/chrome-env";
import { IS_DEV, MOCK_SAVED_WORDS } from "@/lib/mock-data";
import type { SavedCue, SavedWord, UserVocabMap, VocabStatus } from "@/types/vocab";

const STORAGE_KEY = "ytcaption.savedWords.v1";
export const CHROME_USER_VOCAB_KEY = "userVocab";

export type DataSource =
  | "localStorage"
  | "mock"
  | "chrome.storage"
  | "bridge";

export interface LoadResult {
  words: SavedWord[];
  source: DataSource;
  note: string;
}

function isVocabStatus(v: unknown): v is VocabStatus {
  return (
    v === "known" || v === "learning" || v === "ignored" || v === "special"
  );
}

function normalizeWord(raw: unknown): SavedWord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lemma = String(o.lemma || "").trim();
  if (!lemma || !isVocabStatus(o.status)) return null;
  return {
    lemma,
    reading: o.reading ? String(o.reading) : undefined,
    glossVi: o.glossVi ? String(o.glossVi) : undefined,
    glossEn: o.glossEn ? String(o.glossEn) : undefined,
    status: o.status,
    jlpt:
      o.jlpt === "n5" ||
      o.jlpt === "n4" ||
      o.jlpt === "n3" ||
      o.jlpt === "n2" ||
      o.jlpt === "n1"
        ? o.jlpt
        : "",
    contextJa: o.contextJa ? String(o.contextJa) : undefined,
    videoTitle: o.videoTitle ? String(o.videoTitle) : undefined,
    updatedAt: Number(o.updatedAt) || Date.now(),
  };
}

export function toUserVocabMap(words: SavedWord[]): UserVocabMap {
  const map: UserVocabMap = {};
  for (const w of words) map[w.lemma] = w.status;
  return map;
}

/** Merge chrome.storage `userVocab` map into rich SavedWord rows (keep glosses).
 *  Never seeds demo words — mocks are demo-only (localhost/SSR), so an empty
 *  real store can never push mock words over storage/bridge. */
export function mergeUserVocabMap(
  prev: SavedWord[],
  map: UserVocabMap,
): SavedWord[] {
  const byLemma = new Map<string, SavedWord>();
  for (const w of prev) byLemma.set(w.lemma, w);

  const next: SavedWord[] = [];
  const now = Date.now();
  for (const [lemma, status] of Object.entries(map)) {
    if (!lemma || !isVocabStatus(status)) continue;
    const existing = byLemma.get(lemma);
    if (existing) {
      next.push({
        ...existing,
        status,
        updatedAt: status !== existing.status ? now : existing.updatedAt,
      });
    } else {
      next.push({ lemma, status, updatedAt: now });
    }
  }
  return next;
}

async function pushVocabToBridge(map: UserVocabMap): Promise<void> {
  try {
    await fetch(`${BRIDGE_BASE}/extension_state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userVocab: map,
        source: hasChromeStorage() ? "extension-page" : "localhost",
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    /* optional */
  }
}

export async function fetchVocabFromBridge(): Promise<UserVocabMap | null> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/extension_state`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { userVocab?: unknown };
    if (!data.userVocab || typeof data.userVocab !== "object") return null;
    const map: UserVocabMap = {};
    for (const [k, v] of Object.entries(data.userVocab as Record<string, unknown>)) {
      if (isVocabStatus(v)) map[k] = v;
    }
    return map;
  } catch {
    return null;
  }
}

function loadLocalWords(): SavedWord[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const words = parsed
      .map(normalizeWord)
      .filter((w): w is SavedWord => !!w);
    return words.length ? words : null;
  } catch {
    return null;
  }
}

/**
 * Load words: chrome.storage userVocab → bridge → localStorage → mock (DEV only).
 */
export async function loadWordsAsync(): Promise<LoadResult> {
  if (typeof window === "undefined") {
    return {
      words: IS_DEV ? MOCK_SAVED_WORDS : [],
      source: "mock",
      note: IS_DEV ? "SSR — mock seed" : "SSR",
    };
  }

  const localRich = loadLocalWords() || [];

  if (hasChromeStorage()) {
    try {
      const store = getChromeStorage()!;
      const data = await store.get(CHROME_USER_VOCAB_KEY);
      const raw = data[CHROME_USER_VOCAB_KEY];
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const map = raw as UserVocabMap;
        const words = mergeUserVocabMap(localRich, map);
        return {
          words,
          source: "chrome.storage",
          note:
            words.length && Object.keys(map).length
              ? "chrome.storage.local · userVocab (live sync với dict / side panel)"
              : "Chưa có từ thật — đánh dấu trong dict popup trên YouTube.",
        };
      }
      if (localRich.length) {
        return {
          words: localRich,
          source: "localStorage",
          note: "userVocab trống — hiện gloss localStorage.",
        };
      }
      return {
        words: [],
        source: "chrome.storage",
        note: "Chưa có từ đã lưu. Đánh dấu trong dict popup trên YouTube.",
      };
    } catch {
      /* fall through */
    }
  }

  const bridgeMap = await fetchVocabFromBridge();
  if (bridgeMap && Object.keys(bridgeMap).length) {
    const words = mergeUserVocabMap(localRich, bridgeMap);
    return {
      words,
      source: "bridge",
      note: "Đồng bộ từ bridge /extension_state (extension → bridge).",
    };
  }

  if (localRich.length) {
    return {
      words: localRich,
      source: "localStorage",
      note: "localStorage (localhost demo).",
    };
  }

  if (IS_DEV) {
    return {
      words: MOCK_SAVED_WORDS.map((w) => ({ ...w })),
      source: "mock",
      note: "Dữ liệu demo. Extension sẽ thay bằng userVocab thật.",
    };
  }

  return {
    words: [],
    source: "localStorage",
    note: "Chưa có từ đã lưu.",
  };
}

/** Sync first paint helper. */
export function loadWords(): LoadResult {
  if (typeof window === "undefined") {
    return {
      words: IS_DEV ? MOCK_SAVED_WORDS : [],
      source: "mock",
      note: IS_DEV ? "SSR — mock seed" : "SSR",
    };
  }
  const local = loadLocalWords();
  if (local?.length) {
    return {
      words: local,
      source: "localStorage",
      note: "Đang hydrate…",
    };
  }
  return {
    words: [],
    source: "mock",
    note: "Đang tải…",
  };
}

export async function persistWordsAsync(words: SavedWord[]): Promise<DataSource> {
  if (typeof window === "undefined") return "mock";
  const map = toUserVocabMap(words);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch {
    /* ignore */
  }

  if (hasChromeStorage()) {
    try {
      await getChromeStorage()!.set({ [CHROME_USER_VOCAB_KEY]: map });
      void pushVocabToBridge(map);
      return "chrome.storage";
    } catch {
      /* fall through */
    }
  }

  void pushVocabToBridge(map);
  return "localStorage";
}

export function persistWords(words: SavedWord[]): void {
  void persistWordsAsync(words);
}

export function setWordStatus(
  words: SavedWord[],
  lemma: string,
  status: VocabStatus | null,
): SavedWord[] {
  const key = lemma.trim();
  if (!key) return words;
  if (!status) {
    return words.filter((w) => w.lemma !== key);
  }
  const idx = words.findIndex((w) => w.lemma === key);
  if (idx === -1) {
    return [
      {
        lemma: key,
        status,
        updatedAt: Date.now(),
      },
      ...words,
    ];
  }
  const next = words.slice();
  next[idx] = { ...next[idx], status, updatedAt: Date.now() };
  return next;
}

export function resetToMock(): SavedWord[] {
  const words = MOCK_SAVED_WORDS.map((w) => ({ ...w }));
  // Demo-only: fill the localhost UI, never pollute chrome.storage/bridge
  // (extension pull would otherwise replace real words with demo words).
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch {
    /* ignore */
  }
  return words;
}

/** Live updates from chrome.storage or bridge poll. */
export function subscribeVocab(
  onChange: (words: SavedWord[], source: DataSource) => void,
  getPrev: () => SavedWord[],
): () => void {
  if (typeof window === "undefined") return () => {};

  const onChanged = getChromeStorageOnChanged();
  if (hasChromeStorage() && onChanged) {
    const listener = (
      changes: Record<string, ChromeStorageChange>,
      area: string,
    ) => {
      if (area !== "local" || !changes[CHROME_USER_VOCAB_KEY]) return;
      const raw = changes[CHROME_USER_VOCAB_KEY].newValue;
      const map =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as UserVocabMap)
          : {};
      onChange(mergeUserVocabMap(getPrev(), map), "chrome.storage");
    };
    onChanged.addListener(listener);
    return () => onChanged.removeListener(listener);
  }

  let lastJson = "";
  let isPolling = false;
  const id = window.setInterval(() => {
    if (isPolling) return;
    isPolling = true;
    void (async () => {
      try {
        const map = await fetchVocabFromBridge();
        if (!map) return;
        const j = JSON.stringify(map);
        if (j === lastJson) return;
        lastJson = j;
        onChange(mergeUserVocabMap(getPrev(), map), "bridge");
      } finally {
        isPolling = false;
      }
    })();
  }, 1500);
  return () => window.clearInterval(id);
}

export const CHROME_SAVED_CUES_KEY = "savedCues";
const LOCAL_SAVED_CUES_KEY = "ytcaption.savedCues.v1";

export function normalizeSavedCuesList(raw: unknown): SavedCue[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : typeof raw === "object" ? Object.values(raw) : [];
  const cues: SavedCue[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const id = String(c.id || "").trim();
    const source = String(c.source || "").trim();
    if (!id || !source) continue;
    cues.push({
      id,
      source,
      startTime: Number(c.startTime || c.start_media_time) || 0,
      endTime: Number(c.endTime || c.end_media_time) || 0,
      vi: c.vi ? String(c.vi) : undefined,
      en: c.en ? String(c.en) : undefined,
      videoTitle: c.videoTitle ? String(c.videoTitle) : undefined,
      savedAt: Number(c.savedAt) || Date.now(),
    });
  }
  return cues.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export async function loadSavedCuesAsync(): Promise<{ cues: SavedCue[]; source: DataSource; note: string }> {
  if (typeof window === "undefined") {
    return { cues: [], source: "mock", note: "SSR" };
  }

  if (hasChromeStorage()) {
    try {
      const store = getChromeStorage()!;
      const data = await store.get(CHROME_SAVED_CUES_KEY);
      const raw = data[CHROME_SAVED_CUES_KEY];
      if (raw && (Array.isArray(raw) || typeof raw === "object")) {
        const cues = normalizeSavedCuesList(raw);
        return {
          cues,
          source: "chrome.storage",
          note: `Live · chrome.storage (${cues.length} câu)`,
        };
      }
    } catch {
      /* ignore */
    }
  }

  // fallback localStorage
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVED_CUES_KEY);
    if (raw) {
      const cues = normalizeSavedCuesList(JSON.parse(raw));
      return { cues, source: "localStorage", note: `Local · ${cues.length} câu` };
    }
  } catch {
    /* ignore */
  }

  return { cues: [], source: "mock", note: "Chưa có câu đã lưu" };
}

export async function deleteSavedCueAsync(cueId: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (hasChromeStorage()) {
    try {
      const store = getChromeStorage()!;
      const data = await store.get(CHROME_SAVED_CUES_KEY);
      const raw = data[CHROME_SAVED_CUES_KEY];
      if (Array.isArray(raw)) {
        const next = (raw as Record<string, unknown>[]).filter(
          (c) => c && c.id !== cueId,
        );
        await store.set({ [CHROME_SAVED_CUES_KEY]: next });
      } else if (raw && typeof raw === "object") {
        const next: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
        delete next[cueId];
        await store.set({ [CHROME_SAVED_CUES_KEY]: next });
      }
    } catch {
      /* ignore */
    }
  }

  // Also update localStorage
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVED_CUES_KEY);
    if (raw) {
      const cues = normalizeSavedCuesList(JSON.parse(raw)).filter((c) => c.id !== cueId);
      window.localStorage.setItem(LOCAL_SAVED_CUES_KEY, JSON.stringify(cues));
    }
  } catch {
    /* ignore */
  }
}

export function subscribeSavedCues(
  onChange: (cues: SavedCue[], source: DataSource) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onChanged = getChromeStorageOnChanged();
  if (hasChromeStorage() && onChanged) {
    const listener = (
      changes: Record<string, ChromeStorageChange>,
      area: string,
    ) => {
      if (area !== "local" || !changes[CHROME_SAVED_CUES_KEY]) return;
      const raw = changes[CHROME_SAVED_CUES_KEY].newValue;
      onChange(normalizeSavedCuesList(raw), "chrome.storage");
    };
    onChanged.addListener(listener);
    return () => onChanged.removeListener(listener);
  }
  return () => {};
}

export function exportSavedCuesAnki(cues: SavedCue[]): void {
  if (!cues.length) return;
  const header = [
    "#separator:Tab",
    "#html:true",
    "#tags:yt-caption,saved-cues",
    ["Câu tiếng Nhật", "Dịch tiếng Việt", "Dịch tiếng Anh", "Thời gian", "Video"].join("\t"),
  ];

  const rows = cues.map((c) => {
    const ja = (c.source || "").replaceAll("\t", " ").replaceAll("\n", "<br>");
    const vi = (c.vi || "").replaceAll("\t", " ").replaceAll("\n", "<br>");
    const en = (c.en || "").replaceAll("\t", " ").replaceAll("\n", "<br>");
    const t0 = Math.floor(c.startTime);
    const m = Math.floor(t0 / 60);
    const s = t0 % 60;
    const time = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    const video = (c.videoTitle || "").replaceAll("\t", " ");
    return [ja, vi, en, time, video].join("\t");
  });

  const tsv = "\uFEFF" + [...header, ...rows].join("\n");
  const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yt-caption-cues-${new Date().toISOString().slice(0, 10)}.tsv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
