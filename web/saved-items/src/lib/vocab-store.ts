import {
  BRIDGE_BASE,
  getChromeStorage,
  getChromeRuntime,
  getChromeStorageOnChanged,
  hasChromeStorage,
  type ChromeStorageChange,
} from "@/lib/chrome-env";
import { IS_DEV, MOCK_SAVED_WORDS } from "@/lib/mock-data";
import { readEnvelope, writeEnvelope } from "@/lib/storage-version";
import type { SavedCue, SavedWord, UserVocabMap, VocabStatus } from "@/types/vocab";

export const LOCAL_SAVED_WORDS_KEY = "ytcaption.savedWords.v1";
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

/** Lemmas deleted here whose removal upstream (chrome.storage / bridge) has not
 *  applied yet. Without them the ~1.5s bridge poll re-adds the just-deleted word. */
const pendingDeletes = new Set<string>();

/** Detail fields of a saved word — they exist in the local mirror only. */
function withLocalDetails(next: SavedWord, prev: SavedWord): SavedWord {
  return {
    ...prev,
    ...next,
    reading: next.reading ?? prev.reading,
    glossVi: next.glossVi ?? prev.glossVi,
    glossEn: next.glossEn ?? prev.glossEn,
    jlpt: next.jlpt || prev.jlpt || "",
    contextJa: next.contextJa ?? prev.contextJa,
    videoTitle: next.videoTitle ?? prev.videoTitle,
  };
}

/** Merge the words being written with the records already in the local mirror.
 *  The upstream map only carries lemma → status, so the gloss/context live in
 *  the mirror alone: a write that replaced the mirror with the upstream set
 *  dropped them for good. The upstream set still decides what is shown, the
 *  mirror keeps every record so the details come back if it does. */
export function mergeLocalRecords(
  local: SavedWord[],
  words: SavedWord[],
): SavedWord[] {
  const byLemma = new Map(local.map((w) => [w.lemma, w]));
  const merged = words.map((w) => {
    const prev = byLemma.get(w.lemma);
    return prev ? withLocalDetails(w, prev) : w;
  });
  const known = new Set(words.map((w) => w.lemma));
  for (const w of local) {
    if (!known.has(w.lemma) && !pendingDeletes.has(w.lemma)) merged.push(w);
  }
  return merged;
}

/** True when the stored payload was written by a newer build. Writing this
 *  build's payload over it would destroy data this build cannot read. */
function hasUnsupportedPayload(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    return readEnvelope(JSON.parse(raw)).kind === "unsupported";
  } catch {
    return false;
  }
}

/** Shown when the local mirror comes from a newer build. */
const LOCAL_NEWER_NOTE = " · Dữ liệu local mới hơn app — không ghi đè";

/** Merge an upstream map, honouring deletes that upstream has not applied yet.
 *  A tombstone is dropped as soon as the upstream map no longer holds the lemma. */
function mergeUpstreamMap(prev: SavedWord[], map: UserVocabMap): SavedWord[] {
  for (const lemma of pendingDeletes) {
    if (!(lemma in map)) pendingDeletes.delete(lemma);
  }
  const visible: UserVocabMap = {};
  for (const [lemma, status] of Object.entries(map)) {
    if (pendingDeletes.has(lemma)) continue;
    visible[lemma] = status;
  }
  return mergeUserVocabMap(prev, visible);
}

/** Push the vocab map to the local bridge. Returns the failure (if any) so
 *  the caller can report what really happened instead of claiming success. */
async function pushVocabToBridge(map: UserVocabMap): Promise<string | null> {
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
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
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
    const raw = window.localStorage.getItem(LOCAL_SAVED_WORDS_KEY);
    if (!raw) return null;
    const read = readEnvelope<unknown>(JSON.parse(raw));
    if (read.kind === "unsupported") return null;
    const list = Array.isArray(read.data) ? read.data : [];
    const words = list
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
  // The mirror was written by a newer build: it is neither read nor overwritten.
  const localNewer = hasUnsupportedPayload(LOCAL_SAVED_WORDS_KEY)
    ? LOCAL_NEWER_NOTE
    : "";

  if (hasChromeStorage()) {
    try {
      const store = getChromeStorage()!;
      const data = await store.get(CHROME_USER_VOCAB_KEY);
      const raw = data[CHROME_USER_VOCAB_KEY];
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const map = raw as UserVocabMap;
        const words = mergeUpstreamMap(localRich, map);
        return {
          words,
          source: "chrome.storage",
          note:
            (words.length && Object.keys(map).length
              ? "chrome.storage.local · userVocab (live sync với dict / side panel)"
              : "Chưa có từ thật — đánh dấu trong dict popup trên YouTube.") + localNewer,
        };
      }
      if (localRich.length) {
        return {
          words: localRich,
          source: "localStorage",
          note: "userVocab trống — hiện gloss localStorage." + localNewer,
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
    const words = mergeUpstreamMap(localRich, bridgeMap);
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

export type PersistResult = {
  source: DataSource;
  /** Set when the local store was written but the bridge mirror failed. */
  bridgeError: string | null;
};

/** Persist the word list. Rejects when the target store could not be written —
 *  callers must surface that instead of reporting "Đã lưu". */
export async function persistWordsAsync(words: SavedWord[]): Promise<PersistResult> {
  if (typeof window === "undefined") return { source: "mock", bridgeError: null };
  const map = toUserVocabMap(words);

  let localError: unknown = null;
  try {
    // Merge with the records already in the mirror: the detail fields
    // (gloss, context) live here only — replacing the mirror with the
    // upstream set would drop them for good.
    const merged = mergeLocalRecords(loadLocalWords() || [], words);
    if (!hasUnsupportedPayload(LOCAL_SAVED_WORDS_KEY)) {
      window.localStorage.setItem(
        LOCAL_SAVED_WORDS_KEY,
        JSON.stringify(writeEnvelope(merged)),
      );
    }
  } catch (error) {
    localError = error;
  }

  if (hasChromeStorage()) {
    try {
      await getChromeStorage()!.set({ [CHROME_USER_VOCAB_KEY]: map });
      return { source: "chrome.storage", bridgeError: await pushVocabToBridge(map) };
    } catch (error) {
      // chrome.storage is the extension's source of truth — never report success.
      throw new Error(
        `chrome.storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (localError) {
    throw new Error(
      `localStorage: ${localError instanceof Error ? localError.message : String(localError)}`,
    );
  }

  return { source: "localStorage", bridgeError: await pushVocabToBridge(map) };
}

export function persistWords(words: SavedWord[]): void {
  void persistWordsAsync(words).catch((error: unknown) => {
    console.error("persistWords failed", error);
  });
}

/** Change a word status. `status = null` deletes the word — the delete is
 *  tombstoned so the upstream poll cannot resurrect it. */
export function setWordStatus(
  words: SavedWord[],
  lemma: string,
  status: VocabStatus | null,
): SavedWord[] {
  const key = lemma.trim();
  if (!key) return words;
  if (!status) {
    pendingDeletes.add(key);
    return words.filter((w) => w.lemma !== key);
  }
  pendingDeletes.delete(key);
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
  pendingDeletes.clear();
  // Demo-only: fill the localhost UI, never pollute chrome.storage/bridge
  // (extension pull would otherwise replace real words with demo words).
  try {
    window.localStorage.setItem(
      LOCAL_SAVED_WORDS_KEY,
      JSON.stringify(writeEnvelope(words)),
    );
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
      onChange(mergeUpstreamMap(getPrev(), map), "chrome.storage");
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
        onChange(mergeUpstreamMap(getPrev(), map), "bridge");
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
      const read = readEnvelope<unknown>(JSON.parse(raw));
      if (read.kind !== "unsupported") {
        const cues = normalizeSavedCuesList(read.data);
        return { cues, source: "localStorage", note: `Local · ${cues.length} câu` };
      }
    }
  } catch {
    /* ignore */
  }

  return { cues: [], source: "mock", note: "Chưa có câu đã lưu" };
}

export async function deleteSavedCueAsync(cueId: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (hasChromeStorage()) {
    const runtime = getChromeRuntime();
    if (!runtime?.sendMessage) throw new Error("Saved state worker unavailable");
    const result = await runtime.sendMessage({ type: "SAVED_CUES_MUTATE", op: "delete", id: cueId });
    if (!result?.ok) throw new Error(result?.error || "Saved state update failed");
  }

  // Also update localStorage — never over a payload from a newer build.
  try {
    if (hasUnsupportedPayload(LOCAL_SAVED_CUES_KEY)) return;
    const raw = window.localStorage.getItem(LOCAL_SAVED_CUES_KEY);
    if (raw) {
      const read = readEnvelope<unknown>(JSON.parse(raw));
      const cues = normalizeSavedCuesList(
        read.kind === "unsupported" ? [] : read.data,
      ).filter((c) => c.id !== cueId);
      window.localStorage.setItem(
        LOCAL_SAVED_CUES_KEY,
        JSON.stringify(writeEnvelope(cues)),
      );
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
