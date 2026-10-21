/**
 * Schema versioning for the localStorage payloads.
 *
 * The storage keys already carry a `.v1` suffix, but a key name is not a
 * version: a payload written by a newer build must be detected, never
 * mis-parsed and never overwritten. Every payload therefore carries its own
 * `version` field.
 */

/** Schema version of the payloads this build reads and writes. */
export const STORAGE_SCHEMA_VERSION = 1;

export interface StoredEnvelope<T> {
  version: number;
  data: T;
}

export type EnvelopeRead<T> =
  /** Payload written by this build. */
  | { kind: "current"; version: number; data: T }
  /** Payload written before versioning existed — same shape, no version field. */
  | { kind: "legacy"; version: number; data: T }
  /** Payload written by a newer build — read as opaque, never overwritten. */
  | { kind: "unsupported"; version: number | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Read a stored payload. A missing version means the legacy (pre-versioning)
 *  shape, which is still valid v1. A newer version is reported as
 *  `unsupported` so the caller keeps the data instead of overwriting it. */
export function readEnvelope<T>(raw: unknown): EnvelopeRead<T> {
  if (isRecord(raw) && typeof raw.version === "number") {
    if (raw.version > STORAGE_SCHEMA_VERSION) {
      return { kind: "unsupported", version: raw.version };
    }
    return { kind: "current", version: raw.version, data: raw.data as T };
  }
  return { kind: "legacy", version: STORAGE_SCHEMA_VERSION, data: raw as T };
}

/** Wrap a payload with the current schema version. */
export function writeEnvelope<T>(data: T): StoredEnvelope<T> {
  return { version: STORAGE_SCHEMA_VERSION, data };
}
