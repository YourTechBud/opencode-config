---
name: create-review-guide
description: Generate a reviewer's orientation guide (HTML) for a changeset to make human review faster
disable-model-invocation: true
---

You generate a reviewer's orientation guide for a code change, so a human can
review a large diff efficiently. This is a navigation aid, not a quality review —
it does not judge or approve the code; it helps the reviewer build a mental model
and know where to look.

# Change scope

User-supplied scope:

$ARGUMENTS

If no user-supplied scope is provided, default to the current working tree changes
relative to `HEAD`, including staged, unstaged, and untracked files.

# Goal

Produce a single self-contained HTML file under `scratch/review/` that orients a
reviewer across two layers. Name the file after what the change is about, using a
short descriptive kebab-case slug (e.g. `scratch/review/auth-token-refresh.html`)
rather than a fixed name, so each guide is distinct and earlier guides are not
clobbered.

The guide covers two layers:

1. Orientation — what this change is trying to achieve, and what a reviewer should
   therefore expect to change.
2. Review walk — a module-by-module walk through the change. Start with a reading
   path overview: the affected modules in recommended reading order, each with a
   one-line reason. Then, for each module in that order, give its breakdown (expected
   logic, what is non-obvious or risky, what to verify) together with its files and
   focused notes on what to look at in each. End with a "Loose ends & miscellaneous"
   bucket for changed files that don't belong to a clean module (config, lockfiles,
   stray tweaks), so every changed file is still covered.

# Success criteria

- A reviewer can build a mental model before reading any code, then read code to
  check whether it matches expectations.
- Logic is framed as expectations to test against the code, not conclusions to trust.
- Risky or non-obvious spots are called out with what to verify.
- It reads easily: plain, friendly language and short sentences, with repo jargon or
  technical terms defined briefly the first time they appear.
- The page is light and easy on the eyes, not a wall of text.
- A clear reading path is recommended; files live inside the module they belong to;
  every changed file is covered, including loose ends.

# Constraints

- Read-only, except for writing the single HTML artifact.
- This complements, and does not replace, an engineering-quality review. If
  `docs/engineering-guidance/` exists, you may consult it to inform what tends to be
  risky in this repo, but do not produce a quality verdict.
- Read enough surrounding code to describe each module's intent accurately.
- Output one self-contained HTML file under `scratch/review/`, named with a short
  descriptive kebab-case slug for the change (not a fixed `index.html`). Keep it
  information-dense and scannable; use your judgment on structure and whether any
  diagram earns its place.
- Write in plain language and assume the reader may not know the repo's jargon or a
  given technical term; define such terms briefly on first use without bloating the
  main line. Favor a light, scannable surface with short blocks and breathing room,
  using progressive disclosure (e.g., on-demand tooltips or small expandable asides)
  so depth is available without crowding the page. Add a glossary only when many
  recurring terms make a reference list worth it.

# Stop rules

After writing the file, let the user know where it is — print the absolute path to
it (a short line like "Wrote the review guide to `<absolute path>`" is fine). Don't
open it.
