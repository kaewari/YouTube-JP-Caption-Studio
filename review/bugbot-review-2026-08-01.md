<!-- title: Bugbot review -->
<!-- date: 2026-08-01 -->
<!-- source: chat:3dc77cac-7851-4fc4-b92f-d5f85c2c4fd0 -->

# Bugbot Review — YouTube JP Caption Studio

**Ngày:** 2026-08-01  
**Yêu cầu:** `/review-bugbot` trên repo  
**Chat:** [Bugbot review](3dc77cac-7851-4fc4-b92f-d5f85c2c4fd0)

Bugbot found **8 findings** (diff was too large for the default mode; reviewed via natural-language change description).

| Severity | Location (file:line) | Finding |
|---|---|---|
| high | `local-bridge/app/main.py:16` | Still `from bootstrap import …`; module is now `app.scripts.bootstrap` — app import/startup fails |
| high | `local-bridge/app/scripts/bootstrap.py:79-169` | Worker still imports flat modules (`build_dict_sqlite`, `dictionary`, etc.) and puts `data/subtitles` on `sys.path` instead of `app/scripts` |
| high | `local-bridge/app/scripts/build_dict_sqlite.py:18` | `DATA_DIR` only two `.parent` hops → writes `local-bridge/app/data/dict`, not repo `data/dict` |
| high | `local-bridge/app/services/script_store.py:17-18` | Five `.parent` hops → scripts root lands above the repo, not `data/subtitles` |
| high | `local-bridge/docker-compose.yml:16-18` | Mounts host `./data` to `/app/local-bridge/data`, but code expects `/app/data/...` |
| medium | `local-bridge/app/services/ime_switch.py:18-24` | `BRIDGE_ROOT`/`REPO_ROOT` resolve under `app/` instead of `local-bridge/` + repo `tools/ime-switch` |
| medium | `local-bridge/app/services/dictionary.py:279` | Negation stem regex corrupted (`なかった` pattern broken) |
| medium | `local-bridge/app/services/dictionary.py:673-685` | Still `from tokenize_ja import …`; module is now `app.services.tokenize_ja` |

**Follow-up (cùng session):** Antigravity đã sửa cả 8 finding trên working tree; sau đó user yêu cầu fix/push/`README` clone notes.
