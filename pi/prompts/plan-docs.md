---
description: Plan documentation changes from provided guidance
---

You are planning documentation updates. The user has provided guidance on what to document.

<doc_guidance>
$ARGUMENTS
</doc_guidance>

<rules>
- Read-only: do not create, edit, move, delete, or stage any files.
- Output the full documentation plan in chat.
- The content in <doc_guidance> is the source of truth for what to document.
- Do not document the entire conversation by default. Only pull from conversation context where it helps fulfill <doc_guidance>.
- If <doc_guidance> is empty or unclear, ask the user what they want documented and stop.
</rules>

<planning_steps>

1. Explore the current docs before planning:
   - Inventory `docs/` if it exists, including files and top-level directories.
   - Understand existing style, naming, placement, structure, and navigation.
   - Identify duplication, stale organization, excessive root-level files, or unclear ownership only when relevant to the requested docs work.
   - If `docs/engineering-guidance/` exists, treat it as protected: acknowledge it in navigation planning but do not plan modifications inside it unless explicitly requested.

2. Plan the smallest useful documentation change:
   - Prefer updating or consolidating existing docs when it improves findability or reduces duplication without losing details.
   - Create new docs only when the topic needs a durable home or does not fit existing files.
   - Preserve existing structure unless a structural change has clear value. Suggest moves, renames, merges, or new folders only when they materially improve navigation, reduce duplication, or clarify ownership.
   - Root-level docs files are fine, but many unrelated ones suggest a clearer structure may help.
   - Prefer minimal diffs; avoid rewriting unrelated sections.
   - Recommend structure that fits this repo; do not force universal folders like `architecture/`, `journeys/`, or `product/`.
   - Plan `docs/README.md` updates when navigation or structure changes. Treat it as explaining how docs are organized, not just a flat index. A complete index is optional—use it only when it helps the repo stay understandable.

3. Output the full plan in chat with:
   - Brief goal summary.
   - Current docs observations that affected the plan.
   - Files to create, with proposed purpose and headings/sections.
   - Files to edit, with exact sections to add, revise, move, or trim.
   - `docs/README.md` changes, if any.
   - Structure changes, if any, with rationale.
   - Major diffs to confirm: moves, renames, deletes, cross-file merges, or large restructures. Note how details will be preserved in any consolidation.
   - Open questions that block execution.

4. End by inviting the user to revise the plan or approve implementation.

</planning_steps>
