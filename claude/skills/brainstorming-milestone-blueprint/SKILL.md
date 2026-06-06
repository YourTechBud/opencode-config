---
name: brainstorming-milestone-blueprint
description: |
  Layered on brainstorming to turn raw ideas, Sparks, or scattered project context into project-scoped milestone directions ready to execute.
  Invoke when the user asks what to work on next, wants to shape ideas into milestones, or mentions Sparks or milestone work.
---

# Brainstorming Milestone Blueprint

## Role

Layer on top of the core brainstorming loop for project-scoped milestone discovery and shaping. Use the brainstorming skill's phases, branches, questions, and first-principles pushback; this blueprint specializes them toward valuable work continuation.

## Goal

Help the user turn raw Sparks, thoughts, and project context into a small set of valuable candidate milestone directions through questioning, grouping, comparison, and first-principles pushback. The output is clarity, not a full plan.

## Definitions

- **Spark:** a raw user idea, pain, bug, feature notion, content thought, project impulse, observation, or unfinished thread. Sparks are raw material, not tasks or milestones.
- **Milestone:** a lightweight continuation marker for a valuable direction of work, with enough shape to know why it matters, what we are roughly doing, where to continue, and how to know when to stop.
- **Task:** a focused phase of work under a hardened milestone, sized for one human-agent collaboration cycle when possible, that meaningfully advances the milestone.

## Milestone Phases

Use these as milestone-specific outer-loop phases. Move fluidly; do not force every conversation through every phase.

1. **Orient + collect** — understand the single project context and gather raw Sparks/thoughts without judging too early.
2. **Discover value** — identify the value, pain, learning, capability, decision, or deliverable underneath the ideas. This is the heart of the skill.
3. **Explore + converge** — compare possible milestone directions; merge, split, discard, defer, or checkpoint candidates.
4. **Harden** — make one chosen direction safe to execute: boundaries, done condition, continuation point, and rough tasks if useful.
5. **Persist / checkpoint** — only when explicitly requested, save candidate milestones, hardened milestones, or tasks using the project-local `.pi/` convention.

Persistence can happen from any phase when the user explicitly asks to save or checkpoint something.

## Operating Principles

- Value before structure. Do not rush into milestone cards, tasks, or files before the value is understood.
- Treat Sparks as raw material. One Spark may split into many directions; many Sparks may merge into one direction; some should remain unshaped.
- Use first-principles pushback on the value premise: is this real value, or just an exciting implementation?
- Preserve optionality until convergence, then prevent endless branching by naming, merging, parking, or closing branches.
- Keep milestones and tasks directional by default. Preserve intent, outcomes, boundaries, and continuation while leaving implementation room for the human-agent execution loop.
- Prefer incremental value slices when shaping tasks. Avoid horizontal layer-by-layer plans as the default unless they are necessary to unlock or de-risk value.
- Keep priority ownership with the user. Compare tradeoffs, but do not choose the user's global active project/milestone unless asked.
- A milestone artifact is the residue of the conversation, not the thinking system itself.
- Keep artifacts lightweight. If the milestone system creates more mental load than it removes, simplify.

## Quality Checks

Use these as prompts during discovery and as checks during hardening:

1. Why this?
2. What direction?
3. What belongs now vs later?
4. Where do I continue?
5. How do I know this is done enough?
6. Does this reduce mental load?

## Persistence Rules

Persist only on explicit user request, such as "save this," "checkpoint this," "persist these milestones," or "write the files." Approval of an idea is not persistence consent.

When persisting, follow `persistence.md`. Use local project conventions if they exist; otherwise use `.pi/milestones/` and `.pi/tasks/`.

## Supporting References

Read the supporting files when that part of the conversation becomes active:

- `milestone-principles.md` — what makes a useful milestone
- `task-principles.md` — what makes a useful task
- `persistence.md` — filesystem conventions for persisted milestones/tasks
