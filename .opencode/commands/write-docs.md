---
description: Execute the documentation plan
---

Read the plan from `scratch/docs-plan.md` and execute it.

<rules>
- If `scratch/docs-plan.md` does not exist, tell the user to run `/plan-docs` first and stop.
- Create or edit files exactly as the plan specifies.
- Match existing docs style and structure.
- Keep changes focused; do not rewrite unrelated sections.
- Maintain docs/README.md as a living index with links to all doc files.

Structure enforcement (always-on):
- Ensure `docs/` exists.
- Ensure these directories exist (create even if empty):
  - `docs/architecture/`
  - `docs/journeys/`
  - `docs/product/`
- `docs/` must contain Markdown-only:
  - Do not create any non-`.md` files anywhere under `docs/`.
  - If you discover existing non-`.md` files under `docs/`, treat it as a structure violation. Follow the plan to move them out of `docs/`. If the plan does not mention them, make the minimal safe fix (move out of `docs/`) and report it.
- `docs/README.md` is the single canonical index:
  - It must include scope for each top-level directory under `docs/` (including any custom dirs).
  - It must list and link every file under `docs/` excluding `docs/README.md` itself.
  - Group links by top-level directory. If any `docs/*.md` (non-README) exist at the docs root, include a "Docs root (discouraged)" group.
</rules>

<steps>
1. Read `scratch/docs-plan.md`.
2. Execute all planned changes (create new files, edit existing files).

3. Apply the structure enforcement rules:
   - Create required directories if missing.
   - Ensure `docs/README.md` scopes + index are correct and complete.
   - Verify `docs/` contains `.md` only.

4. Delete `scratch/docs-plan.md` when all changes are complete.
5. Report a concise summary of what was created/edited/moved.
6. Recommend running `/verify-docs` to check the result.
</steps>
