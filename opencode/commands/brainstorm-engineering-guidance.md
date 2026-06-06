---
description: Brainstorm repo-specific engineering guidance, including UX, refactoring, observability, and review priorities
agent: brainstorming
---

You help me converge on a small, durable set of engineering guidance docs for this repo. Explore the repo and any relevant docs before proposing anything.

# What I want to work on

$ARGUMENTS

# Goal

Converge on a small, coherent guidance system under `docs/engineering-guidance/`, with `README.md` as the canonical entry point. Use my intent above as the spine of the conversation — what I want to work on drives the direction; the seed knowledge below is here so we don't rediscover it from scratch.

# Seed knowledge

Draw on these aggressively as inspiration — adapt, tighten, or omit to fit the repo. They are starting points, not requirements.

<seed_principles>
- optimize for future change
- preserve boundaries
- prefer deep modules over shallow fragmentation
- keep surfaces legible and signal-rich
- prefer local reasoning
- make contracts explicit
- actively look for opportunities where shared components, functions, or modules could reduce behavioral, visual, or logic drift without weakening readability, boundaries, or local reasoning
- keep behavior honest and visible
- concentrate complexity intentionally
- verification should match risk
- favor navigability
- review failure semantics and graceful degradation
- review diagnosability and runtime visibility
- treat end-user experience as a first-class engineering concern when changes affect product behavior
- make completed work easy for humans to review and trust
- prefer clean internal interfaces over compatibility shims when callers can be migrated safely
- preserve compatibility deliberately at real user, data, integration, public API, or deployment boundaries
- discuss logging and observability expectations based on repo risk and runtime needs
- review trust boundaries and privilege exposure lightly
- scrutinize new package dependencies lightly
</seed_principles>

<seed_lenses>
- architecture, modules, and boundaries
- modularity, reuse, and drift prevention
- state, effects, and runtime behavior
- user experience and product behavior
- refactoring, interface evolution, and backward compatibility
- logging, observability, and diagnosability
- reviewability and confidence-building artifacts
</seed_lenses>

<seed_structure>
- `README.md` as the canonical entry point
- a core principles doc
- a how-to-use doc
- one or more docs under `lenses/`
</seed_structure>

# Success criteria

- Guidance is non-prescriptive, question-driven, and maintainable.
- Durable engineering principles are separated from repo-specific nuance.
- The system stays small and coherent rather than a large manual; we're explicit about what to exclude to avoid bloat.
- Each lens defines its own severity ladder so the engineering-guidance-reviewer can categorize findings consistently:
    - `Blocker` — material divergence from guidance; must fix; triggers a re-review after the fix.
    - `Concern` — design or runtime gap with real consequence; fix directly or surface to the user; re-review only if the fix is substantial.
    - `Nit` — marginal, optional improvement; terminal — never triggers a re-review on its own.
- If guidance already exists under `docs/engineering-guidance/`, build on it rather than re-deriving from scratch.

# Stop rule

Once the direction is solid, recommend continuing with `/write-engineering-guidance` to apply the updates.
