<!-- date: 2026-10-11 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: execute sentence enhancement plan; independent renderer follow-up -->

# Bilingual renderer — independent alias and lexical-boundary follow-up

STATUS: **PASS for the bounded active-cue renderer, three reproduced defect fixes, parent isolated DOM run with independent artifact audit, and main source delivery.** Native activation, full semantic alignment, audio gold, Gemini, storage/Drive and full MVP remain **NOT VERIFIED**.

[Latest revised plan](../plan/youtube-sentence-enhancement-mvp-2026-10-10.md), [historical renderer review](youtube-sentence-mvp-bilingual-active-cue-2026-10-10.md), [historical main delivery](youtube-sentence-mvp-native-bilingual-package-followup-2026-10-10.md), [authorized Antigravity clock update/restart](youtube-sentence-mvp-runtime-and-import-clocks-2026-10-11.md).

## Request and shared flow

The user authorized executing the revised plan. NLP-01 and AGENTS require active-cue JLPT inheritance, lexical compounds, neutral unmapped text, no blanket fallback and preserved source spans. Independent reviewer read those original requirements, current disk source/diff and actual callers, independently of implementer claims.

Both content overlay (`renderOverlayCue`) and sidepanel `renderViHtml`/`renderEnHtml` pass cue tokens/settings to shared `Vocab.renderBilingualHtml`. The helper clones source tokens, uses existing compound/grammar/de-inflection mappings, builds active target aliases and emits escaped HTML. No network, database, source cue clock, storage contract or bridge data change occurs in this renderer slice.

## Reproduced defects and minimum fix

1. Active inflected lemma shape `話します` selected its surface alias and produced one span `sẽ nói` / `will talk`. Remove those two aliases; lexical `nói` / `talk` retains the active level while the auxiliary stays separate.
2. Active `私 N5` plus `自分 N4` force-overwrote shared `I/Tôi` aliases with the last token, assigning an unsupported lemma/level. `addTarget` now marks differing active lemma or level as ambiguous. The ambiguous key stays reserved in the regex and renders escaped neutral text, preventing shorter alias recoloring or later forced overwrite. Same lemma/level duplicates retain existing priority rules. Distinct `bản thân` still maps to active `自分 N4`. This is conservative uncertainty handling, not a proof of word alignment.
3. `て` + `ほしい` produced a whole pronoun/action phrase `want someone to do` in one grammar span. Remove that English alias; retain the Japanese grammar entry and level. The untranslated grammar phrase remains neutral rather than inventing alignment.

Production delta compared with this slice's before-source is only these three alias removals, five-line collision guard and ambiguous rendering condition. Existing test assertions are retained; appended regressions cover both token orders/repeats, same-lemma conflicting levels, distinct aliases, input immutability, auxiliary splitting and grammar clause neutrality. No dependency, video/cue-specific branch or new abstraction.

## Requirements and independent outcome

| Criterion | Status | Evidence / limit |
|---|---|---|
| Active-source grounding; no sentence-wide fallback | VERIFIED | Independent real production-module unit/probes; no source or unrelated cue yields escaped neutral output |
| Tested N-level inheritance | VERIFIED in bounded cases | Active levels override curated defaults; real DOM JA/VI/EN N4→N2 colors below |
| Competing aliases | VERIFIED | Independent before-source Red; current both orders/repeats/level-conflict Green, distinct VI alias retained |
| Auxiliary/pronoun boundaries | VERIFIED in tested cases | Independent and permanent Reds for `sẽ nói`/`will talk` and `want someone to do`; current Green |
| Source spacing, refs, immutability, escaping | VERIFIED in bounded cases | Current unit + independent production-helper probe; literal markup stays escaped, stale annotations ignored |
| Real DOM text/color/bounds | VERIFIED as parent run + independent artifact audit | Five current cases/15 measured lines; no independent second browser run |
| Main source/backups/modes | VERIFIED | Independent current source/main hashes, old bytes/modes and main tests |
| Native Chrome/current Gemini/full gold/persistence/Drive | NOT VERIFIED | Outside isolated helper/DOM checks; post-copy native reload pending |

## Parent Red and Green terminal evidence

### Auxiliary Red

```text
COMMAND: node extension/shared/vocab_style_test.js
EXIT CODE: 1
STDOUT:
(empty)
STDERR:
node:internal/assert/utils:146
  throw error;
  ^

AssertionError [ERR_ASSERTION]: Auxiliary remains separate from the lexical verb
    at Object.<anonymous> (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/extension/shared/vocab_style_test.js:428:10)
    at Module._compile (node:internal/modules/cjs/loader:1934:14)
    at Object..js (node:internal/modules/cjs/loader:2074:10)
    at Module.load (node:internal/modules/cjs/loader:1656:32)
    at Module._load (node:internal/modules/cjs/loader:1448:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:261:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v26.8.1

```

### Pronoun-clause Red

```text
COMMAND: node extension/shared/vocab_style_test.js
EXIT CODE: 1
STDOUT:
(empty)
STDERR:
node:internal/assert/utils:146
  throw error;
  ^

AssertionError [ERR_ASSERTION]: A pronoun and lexical action are not one grammar alias
+ actual - expected

+ 'I <span class="tok-trans jlpt-n4" data-lemma="てほしい" data-surface="てほしい" title="[JLPT N4] てほしい">want someone to do</span> this.'
- 'I want someone to do this.'

    at Object.<anonymous> (/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/extension/shared/vocab_style_test.js:450:8)
    at Module._compile (node:internal/modules/cjs/loader:1934:14)
    at Object..js (node:internal/modules/cjs/loader:2074:10)
    at Module.load (node:internal/modules/cjs/loader:1656:32)
    at Module._load (node:internal/modules/cjs/loader:1448:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:261:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 'I <span class="tok-trans jlpt-n4" data-lemma="てほしい" data-surface="てほしい" title="[JLPT N4] てほしい">want someone to do</span> this.',
  expected: 'I want someone to do this.',
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v26.8.1

```

```text
COMMAND: node extension/shared/vocab_style_test.js
EXIT CODE: 0
STDOUT:
All vocab_style active-cue JLPT, source fidelity, escaping, and fallback tests passed!

STDERR:
(empty)
```

```text
COMMAND: node --check extension/shared/vocab_style.js
EXIT CODE: 0
STDOUT:
(empty)
STDERR:
(empty)
```

```text
COMMAND: git diff --check -- extension/shared/vocab_style.js extension/shared/vocab_style_test.js
EXIT CODE: 0
STDOUT:
(empty)
STDERR:
(empty)
```

## Fresh parent-executed DOM evidence

Task-owned hidden IAB tab3 loaded `http://127.0.0.1:18987/.tmp-sentence-mvp/renderer-independent-2026-10-11/aliases.html`. This isolated fixture reuses the existing ten-case fixture's renderer scaffolding, current production `vocab_style.js` and production sidepanel CSS, with five deterministic new cases. Local server GET fixture/CSS/module each returned actualHTTP200. Favicon returned404, logged as an incidental test-page warning. No user Chrome tab/profile, extension storage or Gemini state was read.

Read-only DOM collection used the following CUA Playwright evaluation before and after clicking the visible `Change 話します to N2` button:

```javascript
await aliasesTab.playwright.evaluate(() => [...document.querySelectorAll('.case')].map(card=>({
  id:card.dataset.id,tokensUnchanged:card.dataset.tokensUnchanged,
  lines:[...card.querySelectorAll('.line')].map(line=>{
    const b=line.getBoundingClientRect();
    return {lang:line.dataset.lang,text:line.textContent,
      bounds:{width:b.width,height:b.height,top:b.top,left:b.left},
      spans:[...line.querySelectorAll('.tok,.tok-trans')].map(s=>({
        text:s.textContent,classes:s.className,lemma:s.dataset.lemma,color:getComputedStyle(s).color
      })),images:line.querySelectorAll('img').length};
  })
})));
await aliasesTab.playwright.getByRole('button',{name:'Change 話します to N2',exact:true}).click();
```

Before/after receipt was saved directly from the returned browser objects, not reconstructed from intended expectations. All five cases have `tokensUnchanged:true`; all15 corresponding line text and width/height/top/left remain exact. Width1214px/left33px; JAheight37px and VI/ENheight30px. Auxiliary JA/VI/EN changes computed color from N4 `rgb(143, 211, 255)` to N2 `rgb(224, 138, 74)`; only lexical `nói`/`talk` are translation spans. Both alias orders keep `Tôi/I/myself` neutral; distinct `bản thân` retains `自分 N4`; conflicting levels and pronoun clause remain neutral.

Parent receipt checker ran as an inline `python3 - <<'PY'` command, exit0, actual stdout:

```text
PASS: five actual DOM cases, active N4→N2 CSS colors, neutral competing aliases and clause, exact text/input preservation; all15 line bound deltas0px
```

Independent reviewer separately audited the original saved JSON, hashes and actual screenshot, with exact command/output recorded below. `dom-receipt.json`13889B SHA256 `da78c276ea38c5eeb310315f43665c7b41da66d8a00566db5d7a528537b79f2d`. `aliases-n2.jpg`50516B SHA256 `f1ccc403a931badeafb86b95f53ae989e45702e2cda2e1b92eec6e510e0edde3`, actual1280×720 JPEG. Although screenshot requested fullPage, IAB returned viewport: first three cases shown, levels clipped, clause outside image. The image is not full-page/all-five visual proof; the DOM receipt measures all five, including lines outside viewport. Tab closed and test HTTP server stopped after checks; Antigravity bridge stays running.

## Main delivery

Guarded two-file atomic copy verified previous main hashes before editing, retained exact old bytes/modes0644 and then matched reviewed source hashes. Source SHA256 `ec88996f74f3fd3738ce690f4849ff26e58fafdc107b75047958e78035d2e302`; test `77eb47a3b69e91afe01831972e4f52b01730000ca0393bd6e33963140fd20d22`. Old source `2fcc7f23fa8d021866269928e32dbbfac7fda03ad2fb895ece764f343d42ed9d`; old test `7490aaa10c987d05b3af0a02f3cbd71b916190b1c656d5c1ebafa31aa0f2fc01`. Reviewer independently checked current main plus backups and reran main commands.

```text
CWD: /Users/hoangson/Projects/YouTube JP Caption Studio
COMMAND: node extension/shared/vocab_style_test.js
EXIT CODE: 0
STDOUT:
All vocab_style active-cue JLPT, source fidelity, escaping, and fallback tests passed!

STDERR:
(empty)
```

```text
CWD: /Users/hoangson/Projects/YouTube JP Caption Studio
COMMAND: node --check extension/shared/vocab_style.js
EXIT CODE: 0
STDOUT:
(empty)
STDERR:
(empty)
```

```text
CWD: /Users/hoangson/Projects/YouTube JP Caption Studio
COMMAND: git diff --check -- extension/shared/vocab_style.js extension/shared/vocab_style_test.js
EXIT CODE: 0
STDOUT:
(empty)
STDERR:
(empty)
```

## Remaining gates

This closes the historical renderer independent-review gap for the bounded reviewed source behavior, not native activation. Earlier raw reviews remain immutable historical evidence. Native latest default/renderer/importer reload, source17/rra05 boundaries, representative five-video audio gold, live Gemini translation/readiness/cost, protected persistence/Drive and full release remain open. The full implementation goal stays active. Antigravity runtime/data authority and authorized two-helper restart remain unchanged; a separate final preservation check still returned PID42809/health200/source5551989d…/all44 unchanged, exit0.

API_CHECKS: not applicable to renderer behavior; local static asset HTTP200 is page-loading evidence only.

DATABASE_CHECKS: not applicable; no database or production storage mutation in this slice.

PROBLEMS / REQUIRED_FIXES: none blocking in the bounded reviewed slice; ambiguous targets deliberately remain neutral pending trustworthy word alignment. Full MVP is not PASS.

## Independent exact supplementary commands and outputs

The following are the reviewer's original executed commands, supplied verbatim in its documentation follow-up (not reconstructed/re-run). CWD is the worktree. Each exited0; stderr empty.

### Independent production-helper probe

```sh
node - <<'JS'
const assert=require('node:assert/strict');require('./extension/shared/vocab_style.js');const V=globalThis.HardsubVocab;
const plain=h=>h.replace(/<rt>.*?<\/rt>/gu,'').replace(/<[^>]*>/gu,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
for(const [lang,text,aux,word] of [['vi','Tôi sẽ nói.','sẽ nói','nói'],['en','I will talk.','will talk','talk']]){
 const html=V.renderBilingualHtml(text,lang,[{surface:'話します',lemma:'話します',jlpt:'n2',pos:'動詞'}],{});
 assert.equal(plain(html),text);assert.ok(!html.includes('>'+aux+'</span>'));assert.ok(html.includes('class="tok-trans jlpt-n2"')&&html.includes('>'+word+'</span>'));console.log('PASS auxiliary separate '+lang+' '+html);
}
const competing=[{surface:'私',lemma:'私',jlpt:'n5',pos:'代名詞'},{surface:'自分',lemma:'自分',jlpt:'n4',pos:'代名詞'}];
for(const tokens of [competing,[...competing].reverse(),[...competing,competing[0]]]){
 assert.equal(V.renderBilingualHtml('I remember myself.','en',tokens,{}),'I remember myself.');
 const html=V.renderBilingualHtml('Tôi nhớ bản thân.','vi',tokens,{});assert.ok(html.startsWith('Tôi nhớ <span class="tok-trans jlpt-n4" data-lemma="自分"'));assert.equal(plain(html),'Tôi nhớ bản thân.');
}
console.log('PASS conflicting aliases neutral, both orders + repeated token; distinct alias retains 自分N4');
for(const tokens of [[{...competing[1]},{...competing[1],jlpt:'n2'}],[{...competing[1],jlpt:'n2'},{...competing[1]}]])assert.equal(V.renderBilingualHtml('Tôi','vi',tokens,{}),'Tôi');
console.log('PASS same lemma conflicting levels neutral');
const clauseTokens=[{surface:'て',lemma:'て',pos:'助詞'},{surface:'ほしい',lemma:'ほしい',pos:'形容詞',jlpt:'n4'}];
assert.equal(V.renderBilingualHtml('I want someone to do this.','en',clauseTokens,{}),'I want someone to do this.');console.log('PASS pronoun clause no longer clumped');
const frozen=[{surface:'自分',lemma:'自分',jlpt:'n2',pos:'代名詞',start:0,end:2,offsetUnit:'utf16',sourceRefs:[{cueId:'a',charStart:0,charEnd:2}],_clusterLevel:'n5',_clusterLemma:'私'}];
const before=JSON.stringify(frozen);Object.freeze(frozen[0].sourceRefs[0]);Object.freeze(frozen[0].sourceRefs);Object.freeze(frozen[0]);Object.freeze(frozen);
V.renderRubyHtml({source:'自分',tokens:frozen},{});const h=V.renderBilingualHtml('Tôi & <img>','vi',frozen,{});assert.ok(h.includes('jlpt-n2'));assert.ok(h.endsWith(' &amp; &lt;img&gt;'));assert.equal(JSON.stringify(frozen),before);console.log('PASS frozen source/refs preserved, stale annotation ignored, mapped+unmapped markup escaped');
for(const lvl of ['n1','n2','n3','n4','n5']){const t={surface:'自分',lemma:'自分',jlpt:lvl,pos:'代名詞'};assert.equal(V.jlptClassForToken(t),'jlpt-'+lvl);assert.ok(V.renderBilingualHtml('I','en',[t],{}).includes('class="tok-trans jlpt-'+lvl+'"'));}
console.log('PASS all five active levels override curated defaults consistently');
for(const tokens of [[],null,[{surface:'Zéphyr',lemma:'Zéphyr',pos:'名詞',freq_rank:1}],[{surface:'猫',lemma:'猫',jlpt:'n4',pos:'名詞'}]])assert.equal(V.renderBilingualHtml('family & <img>','en',tokens,{}),'family &amp; &lt;img&gt;');
assert.equal(V.renderRubyHtml({source:'週 末',tokens:[{surface:'週',lemma:'週'},{surface:'末',lemma:'末'}]},{}),'週 末');
console.log('PASS no source/unrelated/unknown frequency neutral + exact source coverage fallback');
JS
```

Actual stdout:

```text
PASS auxiliary separate vi Tôi sẽ <span class="tok-trans jlpt-n2" data-lemma="話します" data-surface="話します" title="[JLPT N2] 話します">nói</span>.
PASS auxiliary separate en I will <span class="tok-trans jlpt-n2" data-lemma="話します" data-surface="話します" title="[JLPT N2] 話します">talk</span>.
PASS conflicting aliases neutral, both orders + repeated token; distinct alias retains 自分N4
PASS same lemma conflicting levels neutral
PASS pronoun clause no longer clumped
PASS frozen source/refs preserved, stale annotation ignored, mapped+unmapped markup escaped
PASS all five active levels override curated defaults consistently
PASS no source/unrelated/unknown frequency neutral + exact source coverage fallback
```

### Independent fresh DOM artifact audit

```sh
python3 - <<'PY'
from pathlib import Path
import json,hashlib
from PIL import Image
b=Path('.tmp-sentence-mvp/renderer-independent-2026-10-11');p=b/'dom-receipt.json';assert p.stat().st_size==13889 and hashlib.sha256(p.read_bytes()).hexdigest()=='da78c276ea38c5eeb310315f43665c7b41da66d8a00566db5d7a528537b79f2d'
r=json.loads(p.read_text());ids={'auxiliary','ambiguous','reverse','levels','clause'}
a={v['id']:v for v in r['before']};z={v['id']:v for v in r['after']};assert set(a)==set(z)==ids
for case in ids:
 assert a[case]['tokensUnchanged']==z[case]['tokensUnchanged']=='true'
 for old,new in zip(a[case]['lines'],z[case]['lines']):
  assert old['lang']==new['lang'];assert old['text']==new['text'];assert old['bounds']==new['bounds'];assert new['images']==0
  assert new['bounds']['width']==1214 and new['bounds']['left']==33 and new['bounds']['height']==(37 if new['lang']=='ja' else 30)
for state,level,color in [('before','n4','rgb(143, 211, 255)'),('after','n2','rgb(224, 138, 74)')]:
 row=next(v for v in r[state] if v['id']=='auxiliary')
 for line,expected in zip(row['lines'],['話します','nói','talk']):
  assert len(line['spans'])==1;s=line['spans'][0];assert s['text']==expected and s['lemma']=='話します' and s['color']==color and 'jlpt-'+level in s['classes'].split()
for case in ['ambiguous','reverse']:
 row=z[case];vi=next(l for l in row['lines'] if l['lang']=='vi');en=next(l for l in row['lines'] if l['lang']=='en')
 assert en['spans']==[] and en['text']=='I remember myself.'
 assert len(vi['spans'])==1 and vi['spans'][0]['text']=='bản thân' and vi['spans'][0]['lemma']=='自分' and vi['spans'][0]['color']=='rgb(143, 211, 255)'
for case in ['levels','clause']:assert all(l['spans']==[] for l in z[case]['lines'] if l['lang']!='ja')
pic=b/'aliases-n2.jpg';assert pic.stat().st_size==50516 and hashlib.sha256(pic.read_bytes()).hexdigest()=='f1ccc403a931badeafb86b95f53ae989e45702e2cda2e1b92eec6e510e0edde3'
with Image.open(pic) as im:im.load();assert im.size==(1280,720);assert im.format=='JPEG'
print('PASS parent-executed actual DOM artifact: 5cases/15lines exact text + zero width/height/top/left deltas')
print('PASS N4->N2 actual JA/VI/EN CSS colors; auxiliary independent; competing and level aliases neutral; distinct bản thân N4 retained; clause neutral')
print('PASS DOM receipt13889B SHAda78c276...; JPEG50516B SHA f1ccc403... decoded1280x720; viewport only, final2cases not fully pictured')
PY
```

Actual stdout:

```text
PASS parent-executed actual DOM artifact: 5cases/15lines exact text + zero width/height/top/left deltas
PASS N4->N2 actual JA/VI/EN CSS colors; auxiliary independent; competing and level aliases neutral; distinct bản thân N4 retained; clause neutral
PASS DOM receipt13889B SHAda78c276...; JPEG50516B SHA f1ccc403... decoded1280x720; viewport only, final2cases not fully pictured
```

### Independent post-copy delivery audit

```sh
python3 - <<'PY'
from pathlib import Path
import json,hashlib,stat
b=Path('.tmp-sentence-mvp/renderer-independent-2026-10-11');main=Path('/Users/hoangson/Projects/YouTube JP Caption Studio')
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for row in json.loads((b/'main-copy.json').read_text())['files']:
 target=main/row['path'];work=Path(row['path']);backup=b/(target.name+'.main-before')
 assert target.read_bytes()==work.read_bytes();assert h(target)==row['new_sha256'];assert h(backup)==row['old_sha256'];assert target.stat().st_size==row['bytes']
 assert oct(stat.S_IMODE(target.stat().st_mode))==oct(stat.S_IMODE(backup.stat().st_mode))==row['mode']
 print('PASS delivered '+target.name+' SHA '+h(target)+' mode '+row['mode']+'; old backup SHA '+h(backup)+' exact')
assert (b/'vocab_style.js.main-before').read_bytes()==(b/'vocab_style.before.js').read_bytes()
print('PASS main pre-fix source backup exact independently reviewed before-source')
PY
```

Actual stdout:

```text
PASS delivered vocab_style.js SHA ec88996f74f3fd3738ce690f4849ff26e58fafdc107b75047958e78035d2e302 mode 0o644; old backup SHA 2fcc7f23fa8d021866269928e32dbbfac7fda03ad2fb895ece764f343d42ed9d exact
PASS delivered vocab_style_test.js SHA 77eb47a3b69e91afe01831972e4f52b01730000ca0393bd6e33963140fd20d22 mode 0o644; old backup SHA 7490aaa10c987d05b3af0a02f3cbd71b916190b1c656d5c1ebafa31aa0f2fc01 exact
PASS main pre-fix source backup exact independently reviewed before-source
```
