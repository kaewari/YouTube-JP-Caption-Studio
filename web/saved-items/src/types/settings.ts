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
