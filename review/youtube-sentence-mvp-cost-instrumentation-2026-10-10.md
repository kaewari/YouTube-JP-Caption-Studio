<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: Lưu plan, đổi tên và thực hiện đến cùng -->
# Sentence MVP — usage and list-price instrumentation

STATUS: PASS for bounded production receipt/cost instrumentation. Full MVP, live Gemini usage and account billing: NOT VERIFIED.

## Request and actual flow

Plan DATA-02/TRANS-02 requires HTTP counts, latency and cost evidence. Existing English and Vietnamese translation already use the shared worker; no separate English API path is needed. Flow: content scheduler → worker admission/cache → Gemini requestBatch HTTP → response JSON → receipt usage → translation validation → content trace/export. Usage now belongs to the HTTP attempt before translation validation, so a rejected ID/revision does not erase token evidence. No database/account/Drive changes.

Production changes are limited to `extension/shared/gemini_translate.js` and `extension/shared/sentence_benchmark.js`. Permanent runnable regression: `scripts/sentence_cost_sanity.js`. Six numeric usage fields are allowlisted; malformed counts make the attempt unpriced. Unknown response fields, keys, captions and context are excluded from cost exports.

## Pricing and limits

Standard paid text list prices independently checked on 2026-10-10 JST: Gemini 3.8 Flash input/cached/output (including thinking) USD .75/.075/3.75 per million tokens through 2026-12-31; Gemini 2.5 Flash .30/.03/2.50. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing). Prompt includes cached tokens; total includes prompt, candidates and thoughts. [Google UsageMetadata](https://ai.google.dev/api/generate-content#UsageMetadata).

The implementation expires its evidence at 2026-11-10 UTC instead of assuming future prices. Estimate = ((prompt−cached)×input + cached×cached price + (total−prompt)×output)/1e6. It refuses unknown model/time, malformed/inconsistent usage, unsuccessful HTTP or tool-use counts. `apiCostEstimate` is additive and labels partial observations. `apiCost` remains null: account tier, discounts, taxes, cache storage charges and actual billing are unverified. Receipt IDs deduplicate batches inside a trace; do not sum traces blindly because shared IDs can recur across traces.

## Red / Green and actual commands

Before production changes, `node scripts/sentence_cost_sanity.js` exited 1: actual localhost HTTP200 receipt had undefined per-attempt usage instead of the expected numeric object. After the minimal change, the same test exited 0. These tests execute production code against actual localhost HTTP responses; they are not live Gemini or billing checks.

```text
COMMAND: node scripts/sentence_cost_sanity.js
EXIT: 0
PASS: actual HTTP200 VI/EN batch dedup keeps thinking/cache usage; rejected translation retains usage; cache exports no historical request; list-price estimate is separate from unverified billing
PASS: missing/expired/unknown/invalid usage never becomes zero-cost success; totals include thinking; incomplete trace estimates are explicitly partial
```

```text
COMMAND: node extension/shared/gemini_translate_test.js
EXIT: 0
PASS: localhost HTTP200, 90 jobs / concurrent duplicate callers / 6 batches / peak 3; immutable inputs and cache
PASS: context/language invalidation; HTTP200 wrong revision/duplicate IDs and HTTP503 are failures, never completion
PASS: results after user lock, source edit or session change never mutate current cues
PASS: key probe shares three-request admission; actual HTTP429 without Retry-After waits >=1000ms then retries once
PASS: concurrent HTTP429 retries honor the longer shared cooldown
PASS: two production clients share one broker; 90 jobs HTTP peak 3, valid Settings probe admitted, oversized/foreign/unsupported rejected
```

```text
COMMAND: node scripts/sentence_benchmark_sanity.js
EXIT: 0
PASS: actual content sync excludes seeking onset
PASS: actual paint observer rechecks hidden tab, Japanese and overlay settings inside RAF
PASS: empty metrics remain NOT VERIFIED; cold/warm onset bounds distinguish ready/missing/uncertain; seek/gaps excluded; real receipt IDs deduplicate HTTP attempts; no fabricated cost
```

```text
COMMAND: git diff --check
EXIT: 0
(stdout/stderr empty)
```

## Independent read-only review

Reviewer `/root/independent_audit` read the original plan, current on-disk diff, both modules and receipt callers. It independently reran the three Node commands and git diff check, all exit 0 with the same PASS stdout above. Its separate production VM + actual HTTP probe covered 17 valid/malformed/missing/thinking/private-field/fallback cases: exit 0. Valid 1000 prompt/200 cached/100 candidates/50 thoughts/1150 total cost .0011775 USD; 404→2.5 fallback yields PARTIAL ESTIMATE .000621 USD, 1 priced/2 attempts. Numeric strings, fractional/null/negative/unsafe counts, missing total/candidates, inconsistent thoughts, tool tokens and malformed JSON all remain null/NOT VERIFIED. Missing thoughts still derives total−prompt. UTC boundary probe: exit 0; 2026-10-09 inclusive and 2026-11-10 exclusive, verified zero usage differs from no observations.

No blocking production finding. Reviewer harness errors (wrong path and omitted queueMicrotask) were corrected and logged; they do not count as software Red/Green.

## Preview copy evidence

After independent bounded PASS, exactly two modules were copied to the main project. Each previous SHA matched the prior deployment receipt before writing; original bytes backed up and file modes preserved. Copy script exit 0, stdout:

```text
GUARDED COPY extension/shared/gemini_translate.js SHA256 817217939ae8e9b3f1212d7fbc39cb34bfce9eb8baad12540def16ec01f141ad permissions preserved
GUARDED COPY extension/shared/sentence_benchmark.js SHA256 2edaa4cec4070fab510e20f25b292e5706a11df4214b69c92d1eaecf4ac25159 permissions preserved
```

Ignored backup/receipt: `.tmp-sentence-mvp/chrome-cost-before-2026-10-10/receipt.json`. Main filesystem copy VERIFIED; Chrome Reload/native activation of this newer cost slice NOT VERIFIED. The earlier native benchmark export predates this copy and correctly has no apiCostEstimate field.

REQUIREMENTS: per-attempt usage, privacy, thinking/cache arithmetic, invalid/expired evidence and dedup VERIFIED within this bounded test scope. Live token usage/billing, native activation and release DATA-02/TRANS-02 gates NOT VERIFIED.
API_CHECKS: actual localhost HTTP200/404/429/503 and malformed HTTP200 response behavior; no live Gemini call.
DATABASE_CHECKS: not applicable; no mutation.
PROBLEMS / REQUIRED_FIXES: actual native translation/readiness/cost observations and full release gates remain open.
