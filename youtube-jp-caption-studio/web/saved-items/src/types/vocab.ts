/** Matches extension dict popup → chrome.storage.local `userVocab`. */
export type VocabStatus = "known" | "learning" | "ignored" | "special";

export type VocabStatusFilter = VocabStatus | "all";

export type SavedItemsTab = "vocabulary" | "saved-words" | "saved-phrases";

export interface SavedWord {
  lemma: string;
  reading?: string;
  glossVi?: string;
  glossEn?: string;
  status: VocabStatus;
  jlpt?: "n5" | "n4" | "n3" | "n2" | "n1" | "";
  contextJa?: string;
  videoTitle?: string;
  updatedAt: number;
}

/** Shape stored in chrome.storage.local as `userVocab`. */
export type UserVocabMap = Record<string, VocabStatus>;

export const VOCAB_STATUS_META: Record<
  VocabStatus,
  { label: string; short: string; color: string }
> = {
  known: { label: "Đã biết", short: "Biết", color: "#9cffcd" },
  learning: { label: "Học", short: "Học", color: "#ffbd80" },
  ignored: { label: "Đừng học", short: "Bỏ", color: "#b894c5" },
  special: { label: "Đặc biệt", short: "Đặc", color: "#e74c5c" },
};

export const STATUS_ORDER: VocabStatus[] = [
  "learning",
  "known",
  "ignored",
  "special",
];
