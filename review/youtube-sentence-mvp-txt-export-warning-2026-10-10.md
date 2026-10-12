<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: thực hiện plan, không dừng giữa chừng -->
# TXT export metadata warning

STATUS: PASS for bounded warning slice. Native activation, actual TXT download, screen-reader speech and full MVP NOT VERIFIED.

Plan §11.3 requires a clear warning for flattened exports that cannot restore metadata. Existing TXT exporter emits original JA/EN/VI strings with whole-second clocks, omitting locks, ownership, Enhanced sidecar and saved snapshots. The smallest change adds a visible note beneath the existing TXT button and associates it through aria-describedby. Only production sidepanel HTML/CSS changed in this slice; exporter, handler, format and storage are unchanged. JSON backup remains the appropriate full metadata restore path. No new SRT/VTT export was added.

## Actual runtime Red and Green

Parent used CUA on the real sidepanel HTML/CSS/JS served by `python3 scripts/sidepanel_original_runtime_fixture.py` at localhost18865. Four synthetic source cues and isolated Chrome transport do not establish native storage, Drive or Gemini behavior. TXT command transport records dispatch only; it does not download TXT. Prior tool Red threw:

```text
RED: open rendered TXT export menu has no loss-of-metadata warning or JSON backup guidance
```

Green note text:

```text
TXT không giữ khóa, dữ liệu Enhanced hay câu đã lưu. Dùng Sao lưu JSON để khôi phục đầy đủ.
```

Real getBoundingClientRect measurements at1280×720: menu190×377.09375, left1049.171875/top303.3125/bottom680.40625; note156×61.59375. At320×640: menu left124/top194.71875/right314/bottom571.8125; note left141/top265.71875/right297/bottom327.3125. Positive dimensions and containment asserted after actual resize. Open screenshot saved `.tmp-sentence-mvp/txt-export-warning-320.jpg`,34692bytes,SHA256ddf433b6305e653af6adcfe54288bb5ece1671300ccebfa905cc47120e65b454. Parent visually inspected the image; note is readable and menu stays inside viewport.

## Independent reviewer and runtime executor qualification

Reviewer independently read source/current diff and executed production exporter in Node VM. Reviewer browser inventory was empty; it authored keyboard/visibility probe for parent to execute in the existing CUA tab. Parent supplied full raw output; reviewer independently asserted saved results. This is a reviewer-authored, root-executed runtime probe, not a browser session independently controlled by reviewer.

Probe first incorrectly asserted closed descendants must have zero geometry. Closed details retained note156×61.59375 while actual documented locator.isVisible returned false for note and menu. AX/DOM snapshot excludes all menu controls and screenshot confirms hidden popover. Reviewer corrected only the closed visibility measurement to !open && !isVisible(note/menu), keeping open positive-pixel/in-bounds, focus and command assertions. This is a probe correction, not a production bug or weakened hidden requirement. Attempted Element.checkVisibility was unavailable in the CUA DOM scope; supported locator.isVisible was used. Distinct failures logged in local-bridge/errors.log.

Final root probe completed without tool error; CUA has no shell exit code. Enter on summary opened menu; Tab1 focused sp-import, Tab2 sp-export with aria-describedby=sp-export-note; Enter recorded exactly {"type":"SP_CMD","cmd":"export"}. Viewport override reset afterward. Raw keyboard result `.tmp-sentence-mvp/txt-export-warning-keyboard.json`,3773bytes,SHA256410bc2a53fb91704f54561b10ff57521943213074bc315049e3d92953dc8f599.

Reviewer actual commands:

```text
COMMAND: node (stdin production exporter VM probe)
EXIT: 0
[001] 0:01 → 0:04
JA: 晴れ。
EN: Sunny.
VI: Nắng.
PASS: production TXT export emits flat original text/targets and whole-second clocks; no lock/ownership/Enhanced/saved metadata, no source mutation; warning accurately names losses but does not promise clock roundtrip
```

```text
COMMAND: python3 - (independent assertions over saved actual CUA output)
EXIT: 0
{"closedOpen":false,"noteVisible":false,"menuVisible":false,"keyboardOpen":true,"tabSequence":["sp-import","sp-export"],"description":"sp-export-note","dispatch":{"type":"SP_CMD","cmd":"export"}}
PASS: independent assertions over actual root-executed reviewer-authored CUA output; closed visibility, keyboard open/Tab/Enter and320px positive-pixel bounds hold; fixture proves command dispatch only
```

```text
COMMAND: git diff --check
EXIT: 0
(stdout/stderr empty)
```

No remaining blocking finding in this bounded slice. Accessibility evidence is DOM association/focus only; speech is NOT VERIFIED. Production VM verifies payload separately; actual browser TXT download NOT VERIFIED. TXT remains flattened with whole-second timestamps; warning does not make it lossless.

## Main copy and remaining full-plan work

After independent bounded PASS, guarded Python copy required main file SHA to match prior receipt, backed up both originals, preserved modes, compared new bytes and updated receipt. Exact main/worktree difference was warning only. Parent command `python3 -` exit0:

```text
GUARDED COPY extension/sidepanel/sidepanel.html SHA256 72ff3574b7f25f1928043f2a887b76b113c8d29f239d6a62eefcad9df9aaa98d permissions preserved
GUARDED COPY extension/sidepanel/sidepanel.css SHA256 6ed1c2d7ed8784cb05193b6d0eaa8d4d05d8c080b29f41e90524cea24327dba5 permissions preserved
```

Backup/receipt `.tmp-sentence-mvp/chrome-txt-warning-before-2026-10-10/receipt.json`. Installed Chrome reload/activation of warning and newer cost/clock slices remains NOT VERIFIED. Three named flags in plan §12 are still absent on disk at this review time; per-video Original toggle does not fulfill independent rollback flags. They require a separate behavioral slice. Audio gold, live translation readiness/billing, native protected-data persistence, Drive and rate/seek/background remain open. Full goal active.

REQUIREMENTS: clear flat export warning VERIFIED; ordinary command path VERIFIED in isolated DOM; native delivery and full roundtrip NOT VERIFIED.
API_CHECKS: localhost fixture HTTP200 only; no production API changes/calls in warning review.
DATABASE_CHECKS: not applicable; no production storage writes.
PROBLEMS / REQUIRED_FIXES: remaining full-plan gates above; no bounded warning blocker.
