# Karpathy LLM-wiki pattern (gist)

Source concept, not this repo's exact schema — this repo's schema is root `AGENTS.md` §4.

## Idea

- **Raw**: plans and reviews are immutable once filed (`plan/`, `review/`). They record decisions at a point in time.
- **Wiki**: an LLM-maintained synthesis layer (`wiki/`) over the raw files. The LLM *writes* the wiki (ingest, query, lint) and *reads* it to answer "what's the status of…" without re-reading every raw file.
- **Schema**: the writing rules live in the agent instructions (`AGENTS.md`), not in the wiki itself.

## Rules of thumb

1. Never edit `plan/` / `review/` from the wiki — add new dated files only.
2. `wiki/index.md` = catalog + active status; `wiki/log.md` = append-only timeline; `wiki/topics/*.md` = per-topic syntheses.
3. Flag contradictions with existing topics instead of silently dropping either side.
4. Answers worth keeping get filed back as topics; trivia doesn't.

(Obsidian graph view over the repo root is optional and local-only.)
