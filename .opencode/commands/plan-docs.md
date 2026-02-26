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
2. **Explore current docs**:
   - Inventory everything under `docs/` (files + directories).
   - Verify `docs/` is Markdown-only; note any non-`.md` files under `docs/` as structure violations.
   - Note any `.md` files at `docs/` root (discouraged but allowed).
   - Identify top-level directories under `docs/` besides `architecture/`, `journeys/`, `product/` (custom dirs; discouraged but allowed).
   - Understand existing style, conventions, and any duplication/verbosity issues before deciding what to change.
3. **Write the plan** at `scratch/docs-plan.md` with:
    - Files to create (with proposed headings/sections)
    - Files to edit (exact sections to add/modify)
    - Consolidation/refactor changes (moves/merges/trims) that improve findability and reduce duplication
    - Structure enforcement actions:
      - Ensure `docs/`, `docs/architecture/`, `docs/journeys/`, `docs/product/` exist
      - Plan moves for any non-`.md` files found under `docs/` (move out of `docs/`)
      - Plan moves for any root-level docs (optional; discouraged-but-allowed; call out as major diffs if you move them)
      - For any custom `docs/<dir>/`, add/update scope and links in `docs/README.md`
      - Ensure `docs/README.md` includes scopes + a complete index of all docs files (excluding itself), grouped by top-level directory
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

<docs_structure_policy>

These rules apply to any repo where this command is run.

- Doc root is `docs/`.
- Always ensure these directories exist (create them even if empty):
  - `docs/architecture/` (architectural docs)
  - `docs/journeys/` (user workflows)
  - `docs/product/` (vision and product docs)
- `docs/` contains Markdown docs only:
  - Allowed: `.md` files and directories
  - Not allowed: any non-`.md` files anywhere under `docs/` (treat as a structure violation; plan to move them out of `docs/`)
- Files directly under `docs/` (other than `docs/README.md`) are discouraged but allowed; prefer moving them into an appropriate directory (call out moves as "Major diffs to confirm").
- Additional top-level directories under `docs/` are discouraged but allowed.
  - If you use any custom directory (e.g. `docs/research/`), `docs/README.md` must include:
    - a one-line scope for it (what goes there)
    - links to all docs within it
- `docs/README.md` is the single canonical index. It must:
  - explain "where things go" (scope for `architecture/`, `journeys/`, `product/`, plus any custom dirs present)
  - list and link every file under `docs/` excluding `docs/README.md` itself
  - group links by top-level directory under `docs/` (include a "Docs root (discouraged)" group if any root-level docs exist)

</docs_structure_policy>

<readme_template_guidance>

When creating or updating `docs/README.md`, use this shape (adapt headings to existing style if it already exists):

1. "Where things go" section:
   - `architecture/`: Architectural docs.
   - `journeys/`: User workflows.
   - `product/`: Vision and product docs.
   - Any custom top-level dirs under `docs/`: One-line scope each.
   - Note: "Docs at `docs/` root are discouraged; prefer categorizing." (only if root-level docs exist)
2. "Index" section grouped by top-level directory under `docs/`:
   - `docs/architecture/` (links)
   - `docs/journeys/` (links)
   - `docs/product/` (links)
   - `docs/<custom>/` (links for each custom dir)
   - `docs/` root (discouraged) (links for any `docs/*.md` excluding `docs/README.md`)

Index rules:
- Include every file under `docs/` excluding `docs/README.md` itself.
- Because `docs/` is Markdown-only, everything listed should be a `.md` file.
- Use repo-relative paths in links (e.g. `docs/product/vision.md`).
- Stable ordering: sort paths lexicographically within each group.

</readme_template_guidance>
  </docs_conventions>
