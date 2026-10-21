/**
 * Resolve the `@/…` path alias (tsconfig `paths`) for plain Node runs so the
 * self-check can import the real source modules instead of copies.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    for (const candidate of [
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    ]) {
      if (existsSync(candidate)) {
        return nextResolve(`file://${candidate}`, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
