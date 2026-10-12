<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: review the revised sentence enhancement plan and verify the bilingual renderer slice -->

# Bilingual active-cue JLPT renderer — bounded review

STATUS: **NOT VERIFIED**

This review covers only the bilingual vocabulary renderer and active-cue JLPT behavior in the current worktree. It corresponds to Phase 3 / `NLP-01` in the [revised plan](../plan/youtube-sentence-enhancement-mvp-2026-10-09.md) and the repository's bilingual token/color invariants. It does not certify the full sentence enhancement MVP.

## Findings

| Requirement | Result | Evidence |
|---|---|---|
| Vietnamese phrase text without a matching Japanese cue does not get fabricated token spans; unmapped text remains neutral and escaped. | VERIFIED in local unit and real-browser fixture | `node extension/shared/vocab_style_test.js`; ten-case browser receipt checker below. |
| Translation spans inherit the level of their active Japanese lemma and the production CSS color, including N3 `単純` → “đơn giản” / “simple”. | VERIFIED in local unit and real-browser fixture | N4/N3/N2 class and computed-color assertions passed in the browser receipt checker. |
| Changing the active `自分` cue from N4 to N2 preserves rendered text and every measured Japanese/Vietnamese/English line bound while changing its color. | VERIFIED in isolated browser fixture | Before/after `getBoundingClientRect()` receipts and computed CSS color checks passed for all three lines. |
| Grammar cluster `ことになっている` uses its declared N3 level even though the first token carries N4. | VERIFIED in local unit test | `grammarHtml` assertion in `extension/shared/vocab_style_test.js`. |
| Source token objects remain unchanged; whitespace-separated `週 末` does not become `週末`; missing or unrelated cues do not cause phrase coloring. | VERIFIED in local unit and real-browser fixture | Renderer unit tests and browser receipt checks passed. |
| Independent code review. | NOT VERIFIED | The available `independent_audit` agent was in `errored` status because of account usage limits through 2026-10-17 02:42 UTC. No independent review PASS is claimed. |
| Installed Caption Studio extension behavior in the user's Chrome profile. | NOT VERIFIED | The earlier request to borrow the YouTube tab was denied. Verification stayed on a task-owned Agent Window at `127.0.0.1`; no user tab or installed extension state was read in this slice. |

The scoped code change removes the Vietnamese-only global phrase fallback that could synthesize spans without an active Japanese token, makes grammar clusters use the grammar entry's declared level instead of defaulting to N3, and adds the active N3 mapping for `単純`. The renderer and tests also retain the source-cue cloning and alignment checks. The isolated fixture explicitly states that it uses deterministic token inputs and makes no installed Chrome storage, Gemini, video, or audio claims.

## Browser receipt evidence

The real Chromium Agent Window loaded `http://127.0.0.1:55094/bilingual`, which serves `testdata/sentence-mvp/bilingual-active-cue.html` and the current production `vocab_style.js`. The fixture's button changed the `自分` level and rerendered all ten cases. The DOM checker measured bounds and inspected computed colors in that browser. It passed after the receipt collector removed `<rt>` readings from a cloned line before checking exact source text; this preserves visible/source spacing without mistaking furigana for the source. The intermediate receipt attempts that included ruby readings were logged in `local-bridge/errors.log` and are not treated as application failures.

Navigation command and raw stdout:

```sh
BSK_AUTO_START=0 bsk navigate --session mtfl --wait-until load http://127.0.0.1:55094/bilingual --json
```

Exit code: `0`.

```json
{"tab_id":1847737222,"url":"http://127.0.0.1:55094/bilingual","final_url":"http://127.0.0.1:55094/bilingual","reached":"load"}
```

Receipt capture command (the JSON response was redirected to the ignored `.tmp-sentence-mvp/` directory):

```sh
BSK_AUTO_START=0 bsk evaluate --session mtfl --quiet --json '(() => { const capture=()=>[...document.querySelectorAll(".case")].map(card=>({id:card.dataset.id,lines:[...card.querySelectorAll(".line")].map(line=>{const b=line.getBoundingClientRect();const visible=line.cloneNode(true);visible.querySelectorAll("rt").forEach(rt=>rt.remove());return {lang:line.dataset.lang,text:visible.textContent,bounds:{x:b.x,y:b.y,width:b.width,height:b.height},images:line.querySelectorAll("img").length,spans:[...line.querySelectorAll(".tok,.tok-trans")].map(s=>({text:s.innerText,classes:s.className,lemma:s.dataset.lemma||"",color:getComputedStyle(s).color}))}}),tokensUnchanged:card.dataset.tokensUnchanged})); const before=capture(); document.querySelector("#change-level").click(); const after=capture(); return {before,after}; })()' > .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/runtime-receipts-wrapper.json
```

Raw stdout was empty because it was redirected; exit code: `0`.

```sh
python3 -c "import json; from pathlib import Path; root=Path('.tmp-sentence-mvp/bilingual-active-cue-2026-10-10'); value=json.loads((root/'runtime-receipts-wrapper.json').read_text(encoding='utf-8'))['value']; assert len(value['before']) == len(value['after']) == 10; (root/'n4-before.json').write_text(json.dumps(value['before'], ensure_ascii=False, indent=2)+'\\n', encoding='utf-8'); (root/'n2-after.json').write_text(json.dumps(value['after'], ensure_ascii=False, indent=2)+'\\n', encoding='utf-8'); print('Wrote real browser receipts: 10 N4 rows, 10 N2 rows')"
```

Exit code: `0`; stdout: `Wrote real browser receipts: 10 N4 rows, 10 N2 rows`.

```sh
python3 scripts/sentence_bilingual_dom_sanity.py .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/n2-after.json n2 .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/n4-before.json
```

Exit code: `0`. Raw stdout:

```text
PASS all ten runtime cases present
PASS self/ja: 自分 inherits n2
PASS self/ja: actual CSS color equals rgb(224, 138, 74)
PASS self/vi: Tôi inherits n2
PASS self/vi: actual CSS color equals rgb(224, 138, 74)
PASS self/en: I inherits n2
PASS self/en: actual CSS color equals rgb(224, 138, 74)
PASS surprise/ja: びっくり inherits n3
PASS surprise/ja: actual CSS color equals rgb(245, 215, 110)
PASS surprise/vi: ngạc nhiên inherits n3
PASS surprise/vi: actual CSS color equals rgb(245, 215, 110)
PASS surprise/en: surprised inherits n3
PASS surprise/en: actual CSS color equals rgb(245, 215, 110)
PASS start/ja: 始め inherits n4
PASS start/ja: actual CSS color equals rgb(143, 211, 255)
PASS start/vi: bắt đầu inherits n4
PASS start/vi: actual CSS color equals rgb(143, 211, 255)
PASS start/en: start inherits n4
PASS start/en: actual CSS color equals rgb(143, 211, 255)
PASS simple/vi: đơn giản inherits n3 from 単純
PASS simple/vi: actual CSS color equals rgb(245, 215, 110)
PASS simple/en: simple inherits n3 from 単純
PASS simple/en: actual CSS color equals rgb(245, 215, 110)
PASS missing/vi: unmapped words neutral
PASS missing/vi: no executable image markup
PASS missing/vi: literal markup preserved
PASS missing/en: unmapped words neutral
PASS missing/en: no executable image markup
PASS missing/en: literal markup preserved
PASS unrelated/vi: unmapped words neutral
PASS unrelated/vi: no executable image markup
PASS unrelated/en: unmapped words neutral
PASS unrelated/en: no executable image markup
PASS wish: pronouns and auxiliaries are separate
PASS gap: exact source whitespace
PASS range/vi: independent 最初 n3 color
PASS range/vi: independent 最後 n4 color
PASS range/vi: no whole-clause span
PASS range/en: independent 最初 n3 color
PASS range/en: independent 最後 n4 color
PASS range/en: no whole-clause span
PASS self: input tokens unchanged
PASS self: measured nonzero DOM bounds
PASS surprise: input tokens unchanged
PASS surprise: measured nonzero DOM bounds
PASS start: input tokens unchanged
PASS start: measured nonzero DOM bounds
PASS missing: input tokens unchanged
PASS missing: measured nonzero DOM bounds
PASS unrelated: input tokens unchanged
PASS unrelated: measured nonzero DOM bounds
PASS wish: input tokens unchanged
PASS wish: measured nonzero DOM bounds
PASS gap: input tokens unchanged
PASS gap: measured nonzero DOM bounds
PASS cluster: input tokens unchanged
PASS cluster: measured nonzero DOM bounds
PASS simple: input tokens unchanged
PASS simple: measured nonzero DOM bounds
PASS range: input tokens unchanged
PASS range: measured nonzero DOM bounds
PASS self/ja: level-change preserves text and all measured pixel bounds
PASS self/ja: button changed actual CSS color
PASS self/vi: level-change preserves text and all measured pixel bounds
PASS self/vi: button changed actual CSS color
PASS self/en: level-change preserves text and all measured pixel bounds
PASS self/en: button changed actual CSS color
0 failure(s)
```

A reviewed viewport screenshot of the live fixture is retained at `.tmp-sentence-mvp/bilingual-active-cue-2026-10-10/simple-n3-runtime.png` (2710 × 1538, 125708 bytes, SHA-256 `c377978b8aa8cb49dde94ef69317478792a6bb8ff9b3f54886fc8e9d2e940c76`). N4 and N2 DOM receipts are also ignored local evidence, not product data.

Screenshot command and raw stdout:

```sh
BSK_AUTO_START=0 bsk screenshot --session ewup --full-page --scope current --out .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/simple-n3-runtime.png --json
```

Exit code: `0`.

```json
{"byte_size":125708,"format":"png","height":1538,"path":".tmp-sentence-mvp/bilingual-active-cue-2026-10-10/simple-n3-runtime.png","scope":"current","tab_id":1847737216,"width":2710}
```

Hash command and raw stdout:

```sh
shasum -a 256 .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/simple-n3-runtime.png .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/n4-before.json .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/n2-after.json
```

Exit code: `0`.

```text
c377978b8aa8cb49dde94ef69317478792a6bb8ff9b3f54886fc8e9d2e940c76  .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/simple-n3-runtime.png
23d166e4c9a1dc3cfe87673ab99c50398e8f44d993acfe97fad271d2e1b787d5  .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/n4-before.json
87891bd665f9f5fed71643d4641594237f0196a5f38bd2928282e9d3ba343371  .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/n2-after.json
```

## Commands

```sh
node --check extension/shared/vocab_style.js
```

Exit code: `0`; stdout and stderr were empty.

```sh
node extension/shared/vocab_style_test.js
```

Exit code: `0`; stdout:

```text
All vocab_style active-cue JLPT, source fidelity, escaping, and fallback tests passed!
```

```sh
python3 -m py_compile scripts/sentence_bilingual_dom_sanity.py
```

Exit code: `0`; stdout and stderr were empty.

```sh
git diff --check
```

Exit code: `0`; stdout and stderr were empty. This checks whitespace only.

## Problems and remaining work

- The independent reviewer could not run because the configured reviewer agent was unavailable under the account's usage limit; the review's overall status is therefore NOT VERIFIED.
- Native extension reload, Gemini translation, YouTube video/audio behavior, and production profile state were not verified. The local fixture is deliberately isolated from those systems.
- The full revised plan remains active. This bounded renderer result does not close `QA-01`, live translation/KPI, native activation, or the remaining sentence-boundary and source-quality evidence.

API_CHECKS: not applicable to this renderer-only slice.

DATABASE_CHECKS: not applicable to this renderer-only slice.
