---
description: Verify documentation against conversation context
---

Review **all** documentation in docs/ and verify it against our conversation.

<verification_criteria>
1. **No contradictions**: identify any statements in docs that conflict with or contradict what we discussed in this conversation.
2. **Self-explanatory**: flag places where a reader would be confused without context they don't have — undefined terms, missing prerequisites, unclear steps, unstated assumptions.
3. **Nothing important missed**: identify topics, decisions, or details from our conversation that should be documented but are absent or incomplete across docs/.
4. **Consolidation opportunities**: identify duplication, redundancy, and excess verbosity across docs/. Suggest merges (files/sections/paragraphs/sentences), trims, or "single source of truth + links" improvements that increase findability **without losing any details**.
5. **Structure compliance**: verify docs follow the repo docs architecture:
   - Doc root is `docs/`.
   - Required directories exist (even if empty):
     - `docs/architecture/`
     - `docs/journeys/`
     - `docs/product/`
   - `docs/` contains Markdown-only: no non-`.md` files anywhere under `docs/`.
   - `docs/README.md` is the single canonical index and must:
     - describe scope for `architecture/`, `journeys/`, `product/`, plus any custom top-level `docs/<dir>/` present
     - list/link every file under `docs/` excluding `docs/README.md` itself
     - group links by top-level directory (include "Docs root (discouraged)" if any root-level docs exist)
   - `.md` files directly under `docs/` (besides `docs/README.md`) are discouraged but allowed; call them out as a recommendation to move.
</verification_criteria>

<steps>
1. Read all files in docs/ to understand the current documentation state.
2. Evaluate every doc against the criteria above, using the full conversation as the reference.
3. Perform a structure audit:
   - List all files under `docs/`.
   - Flag any non-`.md` file under `docs/` as a structure violation.
   - Identify all top-level directories under `docs/` (including custom dirs).
   - Check `docs/README.md`:
     - Has scope entries for required dirs and any custom dirs present
     - Lists/links every `docs/**/*.md` excluding `docs/README.md`
     - Does not list `docs/README.md` itself
     - Groups links by top-level directory
   - Identify any `docs/*.md` (non-README) root-level docs and report them as discouraged-but-allowed.

4. Produce a narrative verification report covering:
   - What you reviewed (which files)
   - Findings for each criterion (contradictions, clarity gaps, missing content)
   - Findings for structure compliance (pass/fail + concrete issues + concrete fixes)
   - Concrete suggested edits where issues are found (specific files and sections)
   - Consolidation opportunities (specific, actionable merge/trim/link suggestions; include this section even if empty)
   - An overall plain-language verdict
</steps>

<rules>
- Check **all** docs, not just recently changed ones. A prior doc may now be stale or contradicted by what we discussed.
- Do not make any edits. This command is read-only; only report findings.
- Keep the report concise but specific. Cite the doc file and section for each finding.
- For each consolidation opportunity, cite the exact locations involved and propose a target "canonical" location. Explicitly note any details that must be preserved so nothing unique is lost during merging/trimming.
</rules>
