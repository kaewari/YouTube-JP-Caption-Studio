# Verification Gate

Apply this gate to every implementation and review session. The root
`AGENTS.md` is the canonical project policy; this file is the portable rule
for IDEs that discover `.agents/rules/`.

## Evidence required before PASS

- Read the request, current files, and current diff from disk.
- Run the applicable build, unit, and integration or API checks.
- For API work, call the real endpoint and record the HTTP status and parsed response.
- For database work, use an isolated test database and verify the resulting state.
- Confirm no test uses `skip`, `only`, a fake success response, or `|| true` to hide a failure.
- Run `git diff` and `git diff --check`; unexplained changes block PASS.
- Report each command, exit code, and actual output. Missing evidence is `NOT VERIFIED`.

## Safety

- Never claim a test or build was run when it was not.
- Never change a test only to make it pass.
- Never use production data for tests.
- Do not run destructive deletes or migrations against real data without explicit authorization.

## Status

- `PASS` requires all applicable checks and evidence.
- Use `FAIL` for a confirmed defect.
- Use `NOT VERIFIED` when a required check or evidence is unavailable.
