---
name: codegraph
description: >
  Use Codegraph MCP (codegraph_explore) when this repo has a `.codegraph/`
  index. Prefer one explore call over grep/Read loops for "how does X work",
  architecture, blast radius, or symbols about to edit. Pass projectPath to
  this repo root when the MCP has no default project. If no `.codegraph/`,
  fall back to Read/Grep/Glob — do not run `codegraph init` unless the user asks.
---

# Codegraph

When the workspace (or a path under it) has `.codegraph/`:

1. Call MCP **`codegraph_explore`** first for navigation / architecture / edit prep.
2. Pass `projectPath` = this repo root (or the indexed package) if the server has no default project.
3. Treat returned source as already Read — do not re-open those files unless you need lines outside the cap.
4. If there is no `.codegraph/`, use built-in Read/Grep/Glob. Indexing is the user's choice (`codegraph init`); agents do not create it unsolicited.

`.codegraph/` stays local (gitignore) — not promoted to GitHub.
