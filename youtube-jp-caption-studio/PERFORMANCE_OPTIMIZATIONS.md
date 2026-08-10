# Performance Optimization Recommendations

## Executive Summary
Analysis of the YouTube JP Caption Studio codebase reveals several performance bottlenecks and optimization opportunities across the extension content script, local bridge, and cue processing pipeline.

---

## 1. Content Script Optimizations (`extension/content/content.js`)

### 1.1 Reduce `findActiveCue` Linear Search (HIGH IMPACT)
**Location:** Lines 3067-3088
**Issue:** Every 250ms tick performs O(n) search through all cues
```javascript
function findActiveCue(mediaTime) {
  const live = cues.slice().sort(...) // Creates new array + sorts every call!
  for (let i = 0; i < live.length; i++) { ... }
}
```

**Recommendations:**
- Cache sorted cue list (only re-sort when cues change)
- Use binary search instead of linear scan (cues are time-sorted)
- Track current index and scan forward/backward from last position

**Expected Impact:** 10-50x faster for videos with 500+ cues

### 1.2 Throttle `tick()` Interval
**Location:** Line 3643
**Current:** `setInterval(tick, 250)` (4 Hz)
**Recommendation:** 
- Reduce to 100-150ms during active playback
- Pause/slow to 500ms when video paused or user inactive
- Use `requestAnimationFrame` synced to video frame updates

**Expected Impact:** 40-60% reduction in CPU usage

### 1.3 Optimize `publishSidePanelState` Message Size
**Location:** Lines 2069-2117
**Issue:** Full cue list sent on every state update (can be 100KB+)
**Current:** Sends entire `cues.map(...)` array when `forceList || listDirty`

**Recommendations:**
- Implement delta updates (only send changed cues)
- Compress payload using simple string compression
- Batch multiple changes within 50-100ms window

**Expected Impact:** 70-90% reduction in message payload size

### 1.4 Memoize `compactSource` Calls
**Location:** Lines 828-833, used extensively in mergeCache/findCachedMatch
**Issue:** Called repeatedly for same strings during cache merge operations

**Recommendation:**
```javascript
const compactCache = new Map();
function compactSource(s) {
  if (compactCache.has(s)) return compactCache.get(s);
  const result = String(s || "").normalize("NFKC").replace(/\s+/g, "").trim();
  compactCache.set(s, result);
  return result;
}
// Clear cache when cues reset
```

**Expected Impact:** 20-30% faster cache merge operations

### 1.5 Debounce `enrichTokensAfterImport`
**Location:** Lines 3094-3120+
**Issue:** Tokenization batch requests can fire frequently

**Recommendation:** Add debouncing (300-500ms) and batch by video session

---

## 2. Local Bridge Optimizations (`local-bridge/`)

### 2.1 Increase LRU Cache Capacity
**Location:** `app/core/cache.py`, Line 38
**Current:** `dict_cache: LRUCache[dict] = LRUCache(2048)`
**Recommendation:** Increase to 4096-8192 entries (dictionary lookups are frequent)

**Memory Cost:** ~10-20MB additional RAM
**Expected Impact:** 30-50% reduction in SQLite queries

### 2.2 Pre-load Sudachi Tokenizer
**Location:** `app/services/tokenize_ja.py`, Lines 15-40
**Issue:** Lazy loading causes first-request latency

**Recommendation:**
- Load tokenizer during bridge startup (not first request)
- Keep tokenizer warm with periodic keepalive

**Expected Impact:** Eliminate 200-500ms first-tokenization delay

### 2.3 Optimize SQLite Connection Pooling
**Location:** `app/services/dictionary.py`, Lines 284-301
**Current:** Single connection with `check_same_thread=False`

**Recommendation:**
- Use connection pooling for concurrent tokenize_batch requests
- Add query result caching for repeated lemma lookups

---

## 3. Cue Processing Pipeline

### 3.1 Avoid Redundant Normalization
**Location:** `content.js` line 394-396
```javascript
const normalized = CueTiming.clampCueEndsToNextStart(
  Normalize.normalizeCues(rawCues)
);
```

**Issue:** `clampCueEndsToNextStart` re-normalizes already processed cues

**Recommendation:** Ensure single-pass normalization during initial load

### 3.2 Optimize `mergeCache` Function
**Location:** Lines 1210-1286
**Issue:** Nested loops O(n*m) for cue matching

**Recommendations:**
- Build hash map of cached cues by time key before loop
- Early exit when owned script match found
- Skip tombstone check for non-owned cues

**Expected Impact:** 2-5x faster for videos with 1000+ cached cues

---

## 4. Memory Management

### 4.1 Clear Stale Timers on Navigation
**Location:** Lines 3648-3653
**Current:** Properly clears timers ✓

**Additional Recommendation:**
- Clear `pending` Map entries after timeout (line 191-194)
- Add memory limit to `pending` Map (max 100 entries)

### 4.2 Reduce Closure Allocations
**Location:** Throughout `content.js`
**Issue:** Anonymous functions in loops create garbage

**Example Fix:**
```javascript
// Before (line 206):
.map((s) => (s && s.utf8 != null ? String(s.utf8) : ""))

// After: Extract to named function
function extractUtf8(s) { return s && s.utf8 != null ? String(s.utf8) : ""; }
.map(extractUtf8)
```

---

## 5. Network/Bridge Communication

### 5.1 Batch Bridge Requests
**Location:** Multiple `bridgeFetch` calls throughout

**Recommendation:**
- Combine `/tokenize_batch` with dictionary lookups
- Use HTTP/2 server push for preloaded data

### 5.2 Compress Large Payloads
**Location:** `saveTranscript` (lines 1140+)

**Current:** Sends full cue list uncompressed
**Recommendation:** 
- Use gzip/brotli compression for POST bodies >10KB
- Implement incremental save (only changed cues)

---

## Priority Implementation Order

1. **Week 1:** `findActiveCue` binary search + cue list caching
2. **Week 1:** Throttle `tick()` interval based on playback state
3. **Week 2:** Delta updates for `publishSidePanelState`
4. **Week 2:** Increase LRU cache + preload tokenizer
5. **Week 3:** Optimize `mergeCache` with hash maps
6. **Week 3:** Memoize `compactSource` and other hot functions
7. **Week 4:** Network compression + request batching

---

## Testing & Validation

For each optimization:
1. Measure baseline performance (CPU, memory, latency)
2. Implement change
3. A/B test with 500/1000/2000 cue videos
4. Verify no regressions in functionality
5. Monitor error rates in production

### Key Metrics to Track:
- `tick()` execution time (target: <10ms)
- `findActiveCue` execution time (target: <1ms for 1000 cues)
- Side panel message size (target: <10KB typical)
- Bridge response latency (target: <50ms p95)
- Memory usage over 1-hour session (target: <200MB growth)

---

## Tools for Profiling

1. Chrome DevTools Performance tab
2. `console.time/timeEnd` for critical functions
3. Chrome Task Manager for memory tracking
4. `performance.now()` for micro-benchmarks
5. Python `cProfile` for bridge profiling
