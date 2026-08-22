/** Minimal chrome.storage typing for extension pages (no @types/chrome required). */
export type ChromeStorageChange = {
  oldValue?: unknown;
  newValue?: unknown;
};

export type ChromeStorageArea = {
  get: (
    keys: string | string[] | Record<string, unknown> | null,
  ) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

type ChromeLike = {
  storage?: {
    local?: ChromeStorageArea;
    onChanged?: {
      addListener: (
        cb: (changes: Record<string, ChromeStorageChange>, area: string) => void,
      ) => void;
      removeListener: (
        cb: (changes: Record<string, ChromeStorageChange>, area: string) => void,
      ) => void;
    };
  };
  runtime?: { id?: string };
};

function chromeApi(): ChromeLike | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const c = (globalThis as { chrome?: ChromeLike }).chrome;
  return c;
}

/** True when running as an extension page (popup / full page) with storage. */
export function hasChromeStorage(): boolean {
  const c = chromeApi();
  return !!(c?.storage?.local?.get && c?.storage?.local?.set);
}

export function getChromeStorage(): ChromeStorageArea | null {
  return chromeApi()?.storage?.local ?? null;
}

export function getChromeStorageOnChanged() {
  return chromeApi()?.storage?.onChanged ?? null;
}

/** Popup or other chrome-extension:// page (not localhost). */
export function isExtensionPage(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.protocol === "chrome-extension:" || hasChromeStorage()
  );
}

export const BRIDGE_BASE = "http://127.0.0.1:8765";
