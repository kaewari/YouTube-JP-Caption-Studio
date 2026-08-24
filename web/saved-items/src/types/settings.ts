/**
 * Matches extension popup `hardsubSettings` in chrome.storage.local
 * (`extension/popup/popup.js` DEFAULTS).
 */
export interface HardsubRoi {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface HardsubSettings {
  /** Caption engine (tick / overlay). Not auto-MT. */
  enabled: boolean;
  /**
   * Legacy field kept for chrome.storage compat; ignored (no machine translation).
   */
  autoTranslate: boolean;
  showOnVideo: boolean;
  autoOpen: boolean;
  showFurigana: boolean;
  dimHardsub: boolean;
  sourceLang: "ja" | "en" | "auto";
  copyFormat: "full" | "ja_vi" | "ja" | "vi";
  exportFormat: string;
  roi: HardsubRoi;
  maxSentences: number;
  dictShowSentence: boolean;
  barScale: number;
  barBgOpacity: number;
  barTextOpacity: number;
  barShowJa: boolean;
  barShowEn: boolean;
  barShowVi: boolean;
  barPos: { nx: number; ny: number } | null;
  vocabLevel: number;
  vocabHighlight: boolean;
  showKnownGreen: boolean;
  hideRareWords: boolean;
  /** Side panel "Làm nổi bật theo cấp độ" — master JLPT coloring toggle. */
  levelHighlightEnabled: boolean;
  /** Per-level colors, mirror of extension/shared/vocab_style.js. */
  levelColors: Record<string, { on: boolean; color: string }>;
  /** Per-platform enable/disable settings (default all true). */
  enabledPlatforms?: {
    youtube: boolean;
    netflix: boolean;
    abema: boolean;
    web: boolean;
  };
  /**
   * Preserved through chrome.storage round-trips (never dropped on save):
   * status-class colors/categories used by content + side panel.
   */
  vocabColors?: Record<string, string>;
  vocabCats?: Record<string, boolean>;
}

export const DEFAULT_HARDSUB_SETTINGS: HardsubSettings = {
  enabled: true,
  autoTranslate: false,
  showOnVideo: false,
  autoOpen: false,
  showFurigana: true,
  dimHardsub: false,
  sourceLang: "ja",
  copyFormat: "full",
  exportFormat: "ja_en_vi",
  roi: { top: 0.75, left: 0.05, width: 0.9, height: 0.22 },
  maxSentences: 500,
  dictShowSentence: true,
  barScale: 1,
  barBgOpacity: 0.82,
  barTextOpacity: 1,
  barShowJa: true,
  barShowEn: true,
  barShowVi: true,
  barPos: null,
  vocabLevel: 5000,
  vocabHighlight: true,
  showKnownGreen: true,
  hideRareWords: false,
  levelHighlightEnabled: true,
  levelColors: {
    n5: { on: true, color: "#7fd6a8" },
    n4: { on: true, color: "#8fd3ff" },
    n3: { on: true, color: "#f5d76e" },
    n2: { on: true, color: "#e08a4a" },
    n1: { on: true, color: "#e74c5c" },
    unknown: { on: true, color: "#c5c5d0" },
  },
  enabledPlatforms: {
    youtube: true,
    netflix: true,
    abema: true,
    web: true,
  },
};

export type SettingsPersistSource =
  | "localStorage"
  | "defaults"
  | "chrome.storage"
  | "bridge";

export interface BridgeHealth {
  ready: boolean;
  ocr_engine?: string;
  mt_engine?: string;
  models_loaded?: {
    ocr?: boolean;
    mt?: boolean;
    sudachi?: boolean;
    dict?: boolean;
    freq?: boolean;
  };
  pressure?: string;
  latency_p50_ms?: number;
}
