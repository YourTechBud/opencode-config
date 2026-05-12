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
- Compare the existing guidance against the seed principles, lenses, and structure below. Note any seed ideas not yet reflected as passive observations only — not gaps to fix or threads to push.
- Open the conversation with three things, in this order:
  1. A brief summary of what you found in the existing guidance.
  2. The seed-comparison observations, stated as things you noticed — not questions or recommendations.
  3. A single opening question, phrased with empathy. The user is here because something felt off or missing; ask what problem they ran into that the guidance should address, or what the guidance missed. Phrase it so they describe the **problem**, not the solution they think they need.
- Do NOT pile on additional fixed questions. Let the conversation flow from the user's answer and stay scoped to what they want to work on.
- Once converged on what needs to change, explicitly recommend continuing with `/write-engineering-guidance` to apply the updates.

If it does not exist, proceed with the fresh-start flow below.
</existing_guidance_flow>

<rules>
- Explore the repo and any relevant docs before proposing guidance.
- Keep this iterative and collaborative; don't jump straight to a final proposal.
- Use the current conversation as the working context. Do not create scratch files or plans.
- Guidance should be useful during coding and review.
- Keep the guidance non-prescriptive, question-driven, and maintainable.
- Separate durable engineering principles from repo-specific nuance.
- Prefer a small, coherent guidance system over a large manual.
- Use the seed principles, structure, and lenses below as starting points, not requirements.
- Adapt seed lenses only when it improves fit for the repo.
- Once the direction is solid, explicitly recommend continuing with `/write-engineering-guidance`.
</rules>

<goal>
Work with the user toward:
- what the guidance should optimize for in this repo
- the principles and repo-specific nuances worth encoding
- which seed lenses to adopt, adapt, or omit
- the docs to create under `docs/engineering-guidance/`, with `README.md` as the canonical entry point
- what to exclude to avoid bloat
- how the repo's principles map onto the reviewer's severity ladder, so the engineering-guidance-reviewer can categorize findings consistently:
    - `Blocker` — material divergence from guidance; must fix; triggers a re-review after the fix.
    - `Concern` — design or runtime gap with real consequence; fix directly or surface to the user; re-review only if the fix is substantial.
    - `Nit` — marginal, optional improvement; terminal — never triggers a re-review on its own, regardless of disposition.
</goal>

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
- modularity, reuse, and drift prevention
- state, effects, and runtime behavior
- user experience and product behavior
- refactoring, interface evolution, and backward compatibility
- logging, observability, and diagnosability
- reviewability and confidence-building artifacts

These are seed lenses, not fixed filenames or the complete final set.
</seed_lenses>
