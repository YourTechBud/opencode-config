---
description: Brainstorm repo-specific engineering guidance, including UX, refactoring, observability, and review priorities
agent: brainstorming
---

Your goal is to help the user converge on a small, durable set of engineering guidance docs for this repo.

<existing_guidance_flow>
Before starting, check whether `docs/engineering-guidance/` already exists in the repo.

If it does:
- Read and internalize the existing guidance (README, principles, lenses, etc.).
- Do NOT propose starting from scratch or re-derive what already exists.
- Instead, open with a brief summary of what you found, then ask the user:
  - What prompted them to revisit the guidance? What feels off or incomplete?
  - Is there a specific area (principle, lens, or structural choice) that no longer fits?
  - Has the repo evolved in ways the guidance hasn't kept up with?
  - Are there new concerns (e.g., new integrations, changed team norms, scaling issues) that need coverage?
- Compare the existing guidance against the seed principles, seed lenses, and seed structure in this prompt. If there are seed ideas not yet reflected in the repo's guidance, surface them as potential additions worth discussing — not as mandatory gaps, but as conversation starters the user may want to revisit.
- Use the same iterative, collaborative spirit as the fresh-start flow, but scoped to understanding the delta: what to add, remove, refine, or restructure.
- Once you and the user have converged on what needs to change, explicitly recommend continuing with `/write-engineering-guidance` to apply the updates.

If it does not exist, proceed with the fresh-start flow below.
</existing_guidance_flow>

<rules>
- Explore the repo and any relevant docs before proposing guidance.
- Keep this iterative and collaborative. Do not jump from repo exploration to a final proposal in a single response.
- Use the current conversation as the working context. Do not create scratch files or plans.
- Guidance should be useful during coding and review.
- Keep the guidance non-prescriptive, question-driven, and maintainable.
- Separate durable engineering principles from repo-specific nuance.
- Include repo nuance discovery in the framing and proposal based on what you learn while exploring the repo.
- Prefer a small, coherent guidance system over a large manual.
- Use the seed principles, structure, and lenses below as starting points, not requirements.
- Reuse, rename, merge, split, or extend the seed lenses only when it improves fit for the repo.
- Once the direction is solid, explicitly recommend continuing with `/write-engineering-guidance`.
</rules>

<goal>
Work with the user toward:
- what the guidance should optimize for in this repo
- the most important principles to capture
- the repo-specific nuances worth encoding
- whether user experience, developer review experience, or both should be explicit review concerns
- how the repo should treat refactoring, interface cleanup, and backward compatibility
- what logging, observability, and runtime visibility expectations are appropriate for this repo
- what artifacts help humans confidently review completed work, such as screenshots, videos, logs, traces, before/after notes, or verification summaries
- the guidance docs or lenses to create or update under `docs/engineering-guidance/`
- what to exclude to avoid bloat
- a canonical entry point at `docs/engineering-guidance/README.md`
</goal>

<seed_principles>
- optimize for future change
- preserve boundaries
- prefer deep modules over shallow fragmentation
- keep surfaces legible and signal-rich
- prefer local reasoning
- make contracts explicit
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

<seed_structure>
Start from a small guidance system under `docs/engineering-guidance/` with:
- `README.md` as the canonical entry point
- a core principles doc
- a how-to-use doc
- one or more docs under `lenses/`

This is a seed structure, not a requirement.
</seed_structure>

<seed_lenses>
Likely starting lenses:
- architecture, modules, and boundaries
- state, effects, and runtime behavior
- user experience and product behavior
- refactoring, interface evolution, and backward compatibility
- logging, observability, and diagnosability
- reviewability and confidence-building artifacts

These are seed lenses, not fixed filenames or the complete final set.
</seed_lenses>
