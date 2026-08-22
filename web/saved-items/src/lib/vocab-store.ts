import {
  BRIDGE_BASE,
  getChromeStorage,
  getChromeStorageOnChanged,
  hasChromeStorage,
  type ChromeStorageChange,
} from "@/lib/chrome-env";
import { MOCK_SAVED_WORDS } from "@/lib/mock-data";
import type { SavedWord, UserVocabMap, VocabStatus } from "@/types/vocab";

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
 * Load words: chrome.storage userVocab → bridge → localStorage → mock.
 */
export async function loadWordsAsync(): Promise<LoadResult> {
  if (typeof window === "undefined") {
    return {
      words: MOCK_SAVED_WORDS,
      source: "mock",
      note: "SSR — mock seed",
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

  return {
    words: MOCK_SAVED_WORDS.map((w) => ({ ...w })),
    source: "mock",
    note: "Dữ liệu demo. Extension sẽ thay bằng userVocab thật.",
  };
}

/** Sync first paint helper. */
export function loadWords(): LoadResult {
  if (typeof window === "undefined") {
    return {
      words: MOCK_SAVED_WORDS,
      source: "mock",
      note: "SSR — mock seed",
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
