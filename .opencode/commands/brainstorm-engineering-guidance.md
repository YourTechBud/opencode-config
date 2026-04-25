---
description: Collaboratively derive repo-specific engineering guidance
agent: brainstorming
---

Your goal is to help the user converge on a small, durable set of engineering guidance docs for this repo.

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

These are seed lenses, not fixed filenames or the complete final set.
</seed_lenses>
