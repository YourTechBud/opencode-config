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
2. **Explore current docs**: understand the docs/ structure, conventions, and existing content before deciding where new content fits or what needs updating.
3. **Write the plan** at `scratch/docs-plan.md` with:
   - Files to create (with proposed headings/sections)
   - Files to edit (exact sections to add/modify)
   - Rationale for placement decisions
   - Any open questions or assumptions (only if blocking)
4. **Return a compact summary** (not the full plan):
   - Confirm: "Full plan at scratch/docs-plan.md"
   - Format like: "N files affected: X (new), Y (edit section Z), ..."
5. **Ask** whether to proceed with `/write-docs` or run `/plan-docs` again with revised guidance.
</planning_steps>

<docs_conventions>
- Docs live in docs/ (create the directory if missing).
- Maintain docs/index.md as a living index with links to all doc files.
- Match existing style and structure.
- Prefer minimal diffs; avoid rewriting unrelated sections.
</docs_conventions>
