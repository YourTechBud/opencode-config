---
description: Plan documentation changes from provided guidance
---

You are planning documentation updates. The user has provided guidance on what to document.

<doc_guidance>
$ARGUMENTS
</doc_guidance>

<rules>
- The content in <doc_guidance> is the **source of truth** for what to document.
- Do NOT attempt to document the entire conversation by default.
- Only pull from conversation context where it helps fulfill <doc_guidance>.
- If <doc_guidance> is empty or unclear, ask the user what they want documented and stop.
</rules>

<planning_steps>

1. **Check for existing plan**: if `scratch/docs-plan.md` exists, read it and treat <doc_guidance> as revision feedback on that plan.
2. **Explore current docs**: understand the docs/ structure, conventions, existing content, and any duplication/verbosity issues before deciding what to change.
3. **Write the plan** at `scratch/docs-plan.md` with:
   - Files to create (with proposed headings/sections)
   - Files to edit (exact sections to add/modify)
   - Consolidation/refactor changes (moves/merges/trims) that improve findability and reduce duplication
   - Major diffs to confirm (file moves/renames/deletes, cross-file merges, large restructures)
   - Detail preservation notes (what information is moved/merged and where it ends up)
   - Rationale for placement decisions
   - Any open questions or assumptions (only if blocking)
4. **Return a compact summary** (not the full plan):
   - Confirm: "Full plan at scratch/docs-plan.md"
   - Format like: "N files affected: X (new), Y (edit section Z), ..."
   - Explicitly call out any "Major diffs to confirm".
5. **Ask** whether to proceed with `/write-docs` or run `/plan-docs` again with revised guidance.
   </planning_steps>

<docs_conventions>

- Docs live in docs/ (create the directory if missing).
- Maintain docs/README.md as a living index with links to all doc files.
- Match existing style and structure.
- Prefer minimal diffs; avoid rewriting unrelated sections.
- Prefer refactoring/consolidating existing docs over adding new sections when it reduces duplication or improves findability, without losing any details.
- Non-minimal diffs are allowed when they materially improve organization; explicitly call them out in the plan as "Major diffs to confirm".
  </docs_conventions>
