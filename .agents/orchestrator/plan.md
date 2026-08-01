# YouTube Caption Code Review & Refactoring Plan

## Objectives
1. Perform multi-dimensional code review of YouTube Caption codebase (Chrome Extension MV3, FastAPI local-bridge, Next.js Web UI).
2. Refactor code and generate patches for issues identified (Architecture, Security/MV3, Performance/Leaks, UX/UI, Maintainability).
3. Verify fixes via `cd local-bridge && python test_tokenize_import_enrich.py` and ensure MV3 unpack compatibility.
4. Produce a detailed Markdown Code Review Report with line-by-line findings and patches/code changes.

## Milestone Plan

### Milestone 1: Exploration & Code Architecture Audit
- **Subagents**: 3 Explorers (`teamwork_preview_explorer`)
- **Focus**:
  - Explorer 1: FastAPI `local-bridge` (architecture, performance, leaks, endpoints, test harness).
  - Explorer 2: Chrome Extension MV3 (`src`/`extension`, manifest.json, background script, content scripts, popup, message passing, MV3 security, memory leaks).
  - Explorer 3: Next.js Web UI / Frontend & Cross-component dataflow (Web UI interaction, bridge communication, UX/UI consistency).
- **Deliverables**: Comprehensive exploration reports detailing architecture, flaws, line numbers, and refactoring recommendations.

### Milestone 2: Refactoring & Patch Implementation
- **Subagent**: 1 Worker (`teamwork_preview_worker`)
- **Focus**: Implement all fixes/patches across local-bridge, Chrome Extension, and Web UI.
- **Verification**: Run `cd local-bridge && python test_tokenize_import_enrich.py` and check MV3 manifest & script compliance.
- **Deliverables**: Modified files, regression test run logs, and patch diffs.

### Milestone 3: Review, Challenge & Forensic Verification
- **Subagents**: 2 Reviewers (`teamwork_preview_reviewer`), 2 Challengers (`teamwork_preview_challenger`), 1 Forensic Auditor (`teamwork_preview_auditor`).
- **Focus**:
  - Reviewers: Evaluate code quality, MV3 compliance, security, maintainability, and regression test results.
  - Challengers: Stress test local-bridge endpoints, tokenization, memory usage, and edge cases.
  - Forensic Auditor: Verify authenticity of fixes, ensure no hardcoded/mocked tests or integrity violations.
- **Deliverables**: Review reports, stress test logs, auditor verdict.

### Milestone 4: Report Synthesis & Handoff
- **Subagent**: Synthesis by Orchestrator / User Liaison.
- **Deliverables**: Comprehensive Markdown Code Review Report in project root (`CODE_REVIEW_REPORT.md`) and notify Sentinel/Parent.
