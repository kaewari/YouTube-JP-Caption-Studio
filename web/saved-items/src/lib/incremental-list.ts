/**
 * Windowing for long Saved Items lists.
 *
 * The popup renders every row it is given, so a 5 000-word library produced
 * 5 000 DOM rows (~620 000 px of scroll height) before the user saw anything.
 * These helpers keep the arithmetic in one place and testable; the component
 * owns the IntersectionObserver that grows the window.
 */

/** Rows rendered on first paint. */
export const INITIAL_ROWS = 100;

/** Rows added per scroll-to-bottom step. */
export const ROW_CHUNK = 100;

/** Window size for a list of `total` rows on first paint, clamped to it. */
export function initialVisibleCount(total: number, initial: number = INITIAL_ROWS): number {
  const size = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  return Math.min(size, Math.max(0, Math.floor(initial)));
}

/** Next window size after one growth step, clamped to the total. */
export function nextVisibleCount(
  current: number,
  total: number,
  chunk: number = ROW_CHUNK,
): number {
  const size = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const shown = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  if (shown >= size) return size;
  const step = Number.isFinite(chunk) && chunk >= 1 ? Math.floor(chunk) : ROW_CHUNK;
  return Math.min(shown + step, size);
}
