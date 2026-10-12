<!-- date: 2026-10-10 -->
<!-- source: chat:01a120d0-c734-73f1-8ae0-5efe130ad593 · user: thực hiện plan YouTube Caption Studio -->

# Native bilingual renderer package follow-up

Read alongside the [latest native reload review](youtube-sentence-mvp-native-latest-reload-cost-clock-2026-10-10.md) and the [bilingual active-cue renderer review](youtube-sentence-mvp-bilingual-active-cue-2026-10-10.md).

STATUS: **NOT VERIFIED for native activation or the full MVP.** A complete filesystem audit after the latest Chrome reload found that `extension/shared/vocab_style.js` in the Chrome-loaded main project still differed from the reviewed worktree. The mismatch is now corrected with an exact, guarded two-file copy and backups. Main-directory unit/syntax checks and worktree DOM fixture checks pass. Chrome has not been reloaded after this copy, so native activation remains pending. Independent reviewer unavailable; this is not an automatic review.

## Findings and changes

The prior native reload review verified an eight-file hash set. A later whole-extension comparison showed two differing files: `shared/vocab_style.js` (production renderer) and `shared/vocab_style_test.js` (developer test). The main project’s test file was clean before the update. The worktree versions were reviewed and passed their current checks, then both exact byte streams were copied to `/Users/hoangson/Projects/YouTube JP Caption Studio/extension/shared/`.

The old main-project files were preserved under `.tmp-sentence-mvp/native-bilingual-sync-2026-10-10/` with original mode. The receipt confirms:

| File | Previous SHA-256 | Copied SHA-256 | Bytes | Mode |
|---|---|---|---:|---|
| `extension/shared/vocab_style.js` | `5ead2415c9b826bc1c84bddf554d18afdfe483f522eb253b7f88a385cb920713` | `2fcc7f23fa8d021866269928e32dbbfac7fda03ad2fb895ece764f343d42ed9d` | 105,042 | 0644 |
| `extension/shared/vocab_style_test.js` | `b13d1069af860ee7f41afe90ccc5deee2d2eb950e05cf10bceb0fb0c1d6596aa` | `7490aaa10c987d05b3af0a02f3cbd71b916190b1c656d5c1ebafa31aa0f2fc01` | 39,005 | 0644 |

The manifest and sidepanel load `shared/vocab_style.js`; the fresh native reload is required before claiming this renderer version is active. The exact tree audit now finds no byte mismatches for paths that exist in both worktree and Chrome-loaded source. Two untracked test modules are absent from the main tree, and six main-only `.DS_Store`/popup build artifacts remain; none was copied or deleted.

## Commands and actual output

### Guarded two-file copy

```text
COMMAND: python3 - <<'PY'
from pathlib import Path
import hashlib, json, os, subprocess

repo=Path('/Users/hoangson/Projects/YouTube JP Caption Studio')
source_root=Path('/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio')
backup_dir=source_root/'.tmp-sentence-mvp/native-bilingual-sync-2026-10-10'
items=[
    ('extension/shared/vocab_style.js','5ead2415c9b826bc1c84bddf554d18afdfe483f522eb253b7f88a385cb920713','2fcc7f23fa8d021866269928e32dbbfac7fda03ad2fb895ece764f343d42ed9d'),
    ('extension/shared/vocab_style_test.js','b13d1069af860ee7f41afe90ccc5deee2d2eb950e05cf10bceb0fb0c1d6596aa','7490aaa10c987d05b3af0a02f3cbd71b916190b1c656d5c1ebafa31aa0f2fc01'),
]
status=subprocess.run(['git','-C',str(repo),'status','--short','--']+[x[0] for x in items],capture_output=True,text=True,check=True).stdout
assert not status, f'target source files became dirty before guarded copy: {status!r}'
assert not backup_dir.exists(), f'backup path already exists: {backup_dir}'
records=[]
for rel,old_expected,new_expected in items:
    source=source_root/rel
    target=repo/rel
    old=target.read_bytes(); new=source.read_bytes()
    old_hash=hashlib.sha256(old).hexdigest(); new_hash=hashlib.sha256(new).hexdigest()
    assert old_hash==old_expected, (rel,'target hash changed',old_hash)
    assert new_hash==new_expected, (rel,'source hash changed',new_hash)
    records.append((rel,target,old,new,old_hash,new_hash,target.stat().st_mode & 0o777))
backup_dir.mkdir(parents=True,mode=0o700)
os.chmod(backup_dir,0o700)
for rel,_,old,_,old_hash,_,mode in records:
    backup=backup_dir/Path(rel).name
    backup.write_bytes(old); os.chmod(backup,mode)
    assert hashlib.sha256(backup.read_bytes()).hexdigest()==old_hash
try:
    for rel,target,old,new,old_hash,new_hash,mode in records:
        staged=target.with_name('.'+target.name+'.codex-stage')
        assert not staged.exists(), f'staging file already exists: {staged}'
        with staged.open('xb') as stream:
            stream.write(new); stream.flush(); os.fsync(stream.fileno())
        os.chmod(staged,mode)
        os.replace(staged,target)
        assert hashlib.sha256(target.read_bytes()).hexdigest()==new_hash
        assert target.stat().st_mode & 0o777 == mode
except Exception:
    for rel,target,old,_,_,_,mode in records:
        staged=target.with_name('.'+target.name+'.codex-rollback')
        with staged.open('wb') as stream:
            stream.write(old); stream.flush(); os.fsync(stream.fileno())
        os.chmod(staged,mode); os.replace(staged,target)
    raise
receipt={'files':[{'path':rel,'old_sha256':old_hash,'new_sha256':new_hash,'bytes':len(new),'mode':format(mode,'04o')} for rel,_,_,new,old_hash,new_hash,mode in records]}
(backup_dir/'copy-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
os.chmod(backup_dir/'copy-receipt.json',0o600)
print('PASS: guarded two-file copy to Chrome-loaded source; previous bytes backed up and mode preserved')
print(json.dumps(receipt,ensure_ascii=False,sort_keys=True))
PY
EXIT CODE: 0
STDOUT:
PASS: guarded two-file copy to Chrome-loaded source; previous bytes backed up and mode preserved
{"files": [{"bytes": 105042, "mode": "0644", "new_sha256": "2fcc7f23fa8d021866269928e32dbbfac7fda03ad2fb895ece764f343d42ed9d", "old_sha256": "5ead2415c9b826bc1c84bddf554d18afdfe483f522eb253b7f88a385cb920713", "path": "extension/shared/vocab_style.js"}, {"bytes": 39005, "mode": "0644", "new_sha256": "7490aaa10c987d05b3af0a02f3cbd71b916190b1c656d5c1ebafa31aa0f2fc01", "old_sha256": "b13d1069af860ee7f41afe90ccc5deee2d2eb950e05cf10bceb0fb0c1d6596aa", "path": "extension/shared/vocab_style_test.js"}]
```

### Guarded copy receipt and extension-tree hash audit

```text
COMMAND: python3 - <<'PY'
from pathlib import Path
import hashlib, json
worktree=Path('/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio/extension')
loaded=Path('/Users/hoangson/Projects/YouTube JP Caption Studio/extension')
root=Path('/Users/hoangson/.codex/worktrees/04c4/YouTube JP Caption Studio')
receipt=json.loads((root/'.tmp-sentence-mvp/native-bilingual-sync-2026-10-10/copy-receipt.json').read_text())
for item in receipt['files']:
    rel=item['path'].removeprefix('extension/')
    src=worktree/rel; dst=loaded/rel
    backup=root/'.tmp-sentence-mvp/native-bilingual-sync-2026-10-10'/Path(item['path']).name
    h=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    assert h(src)==item['new_sha256']==h(dst)
    assert h(backup)==item['old_sha256']
    assert format(dst.stat().st_mode & 0o777,'04o')==item['mode']
print('PASS: copied source hashes, original backups, and modes verified for 2 files')
files=[p for p in worktree.rglob('*') if p.is_file()]
missing=[]; different=[]
for path in files:
    other=loaded/path.relative_to(worktree)
    if not other.is_file(): missing.append(path.relative_to(worktree).as_posix())
    elif h(path)!=h(other): different.append(path.relative_to(worktree).as_posix())
extra=[p.relative_to(loaded).as_posix() for p in loaded.rglob('*') if p.is_file() and not (worktree/p.relative_to(loaded)).is_file()]
print(f'extension_tree worktree_files={len(files)} loaded_files={sum(1 for p in loaded.rglob("*") if p.is_file())} missing={len(missing)} different={len(different)} extra={len(extra)}')
for name in missing: print('missing:',name)
for name in extra: print('extra:',name)
assert not different
print('PASS: all files present in the worktree now match byte-for-byte in Chrome source tree; remaining differences are test-only missing files and six main-only generated/OS artifacts')
PY
EXIT CODE: 0
STDOUT:
PASS: copied source hashes, original backups, and modes verified for 2 files
extension_tree worktree_files=82 loaded_files=86 missing=2 different=0 extra=6
missing: shared/gemini_translate_test.js
missing: shared/sentence_groups_test.js
extra: .DS_Store
extra: popup/_next/static/chunks/16d--vceafafl.css
extra: popup/_next/static/chunks/0r0xsuo6v3o4f.js
extra: popup/_next/static/reMe9cauV7NiRAflHrZZX/_ssgManifest.js
extra: popup/_next/static/reMe9cauV7NiRAflHrZZX/_clientMiddlewareManifest.js
extra: popup/_next/static/reMe9cauV7NiRAflHrZZX/_buildManifest.js
PASS: all files present in the worktree now match byte-for-byte in Chrome source tree; remaining differences are test-only missing files and six main-only generated/OS artifacts
```

### Worktree behavioral checks before copy

```text
COMMAND: node extension/shared/vocab_style_test.js
EXIT CODE: 0
STDOUT:
All vocab_style active-cue JLPT, source fidelity, escaping, and fallback tests passed!
```

```text
COMMAND: python3 scripts/sentence_bilingual_dom_sanity.py .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/n2-after.json n2 .tmp-sentence-mvp/bilingual-active-cue-2026-10-10/n4-before.json
EXIT CODE: 0
STDOUT:
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

### Main Chrome-loaded directory after guarded copy

```text
COMMAND: node extension/shared/vocab_style_test.js && node --check extension/shared/vocab_style.js && git diff --check -- extension/shared/vocab_style.js extension/shared/vocab_style_test.js
EXIT CODE: 0
STDOUT:
All vocab_style active-cue JLPT, source fidelity, escaping, and fallback tests passed!
STDERR: empty
```

The copy receipt/hash audit verified both source hashes, both prior-byte backups and mode preservation:

```text
PASS: guarded two-file copy to Chrome-loaded source; previous bytes backed up and mode preserved
{"files": [{"bytes": 105042, "mode": "0644", "new_sha256": "2fcc7f23fa8d021866269928e32dbbfac7fda03ad2fb895ece764f343d42ed9d", "old_sha256": "5ead2415c9b826bc1c84bddf554d18afdfe483f522eb253b7f88a385cb920713", "path": "extension/shared/vocab_style.js"}, {"bytes": 39005, "mode": "0644", "new_sha256": "7490aaa10c987d05b3af0a02f3cbd71b916190b1c656d5c1ebafa31aa0f2fc01", "old_sha256": "b13d1069af860ee7f41afe90ccc5deee2d2eb950e05cf10bceb0fb0c1d6596aa", "path": "extension/shared/vocab_style_test.js"}]
```

The directory audit reported `worktree_files=82 loaded_files=86 missing=2 different=0 extra=6`. Missing files are test-only `shared/gemini_translate_test.js` and `shared/sentence_groups_test.js`; extras are `.DS_Store` and five popup `_next` build artifacts already in the main directory. No different production source remains in the shared file set. This is a filesystem/hash result, not proof the browser has loaded the copied renderer.

## Pending native check and remaining gates

No Chrome action occurred after the file copy. A fresh Chrome extension Reload and sidepanel render check are still required to verify the active-cue renderer in the native profile. No Gemini request/key, Drive sync, script save, database, bridge process, or user state was touched. The full50 audio gold, source17/rra05 semantics, Gemini readiness/cost, protected storage/Drive, release KPIs, and independent review remain open. Original remains the default.
