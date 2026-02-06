---
description: Execute the documentation plan
---

Read the plan from `scratch/docs-plan.md` and execute it.

<rules>
- If `scratch/docs-plan.md` does not exist, tell the user to run `/plan-docs` first and stop.
- Create or edit files exactly as the plan specifies.
- Match existing docs style and structure.
- Keep changes focused; do not rewrite unrelated sections.
- Maintain docs/index.md as a living index with links to all doc files.
</rules>

<steps>
1. Read `scratch/docs-plan.md`.
2. Execute all planned changes (create new files, edit existing files).
3. Delete `scratch/docs-plan.md` when all changes are complete.
4. Report a concise summary of what was created/edited.
5. Recommend running `/verify-docs` to check the result.
</steps>
