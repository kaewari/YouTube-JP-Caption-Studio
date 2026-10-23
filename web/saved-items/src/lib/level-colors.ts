/**
 * JLPT level colors — mirrors extension/shared/vocab_style.js (LEVEL_KEYS,
 * DEFAULT_LEVEL_COLORS, normalizeLevelColors). Keep in sync.
 */

export interface LevelColorEntry {
  on: boolean;
  color: string;
}

export type LevelColors = Record<string, LevelColorEntry>;

export const LEVEL_KEYS = ["n5", "n4", "n3", "n2", "n1", "unknown"];

export const LEVEL_LABELS: Record<string, string> = {
  n5: "N5",
  n4: "N4",
  n3: "N3",
  n2: "N2",
  n1: "N1",
  unknown: "Không rõ",
};

export const DEFAULT_LEVEL_COLORS: LevelColors = {
  n5: { on: true, color: "#7fd6a8" },
  n4: { on: true, color: "#8fd3ff" },
  n3: { on: true, color: "#f5d76e" },
  n2: { on: true, color: "#e08a4a" },
  n1: { on: true, color: "#e74c5c" },
  // Must match extension/shared/vocab_style.js DEFAULT_LEVEL_COLORS.unknown:
  // the extension is what paints the overlay, so its value is the source of truth.
  unknown: { on: true, color: "#94a3b8" },
};

export function normalizeLevelColors(raw: unknown): LevelColors {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, Partial<LevelColorEntry>>)
      : {};
  const out: LevelColors = {};
  for (const key of LEVEL_KEYS) {
    const d = DEFAULT_LEVEL_COLORS[key];
    const e = src[key] || {};
    out[key] = {
      on: e.on !== false,
      color: String(e.color || d.color),
    };
  }
  return out;
}
