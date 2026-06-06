---
name: setup-brainstorming-artifacts
description: Set up or revise a repo-local brainstorming artifact workspace under .isagi
---

Set up or revise a brainstorming artifact workspace for this repo.

<goal>
The eventual goal is to create or revise `.isagi/brainstorming-workspace` as a repo-local artifact surface for brainstorming.

Do not treat this as a setup wizard. Treat it as a guided discovery process that helps the user figure out what kind of artifact workspace would meaningfully reduce cognitive load for their brainstorming process.
</goal>

<operating_model>
- Start with lightweight, read-only repo discovery: check whether `.isagi/brainstorming-workspace` exists, inspect any existing guidance, and understand repo tooling only enough to avoid bad setup assumptions.
- Use repo context as background, not as the main frame of the first conversation.
- Move through the work in gated stages. Internally, use stages to avoid collapsing discovery, onboarding, option discussion, and implementation into one turn. Externally, use natural language unless labels help clarity.
- After read-only discovery, do not move to a new stage without explicit user consent.
- Do not create or modify files until the user has explicitly confirmed the desired artifact experience, the principles to encode, the setup direction, and permission to implement.
- If the user asks to skip questions and "just set it up," keep the discovery lightweight, but still establish the minimum shared understanding needed before implementation.
</operating_model>

<stages>
1. Repo/context discovery — read-only prerequisite work.
2. Problem discovery and onboarding — orient the user to artifact brainstorming as a way to reduce cognitive load, then understand what brainstorming problems they want artifacts to help with. Do not discuss setup tooling yet.
3. Desired artifact experience — help the user articulate what the workspace should make easier to see, preserve, compare, revisit, decide, or ignore.
4. Confirmed principles — propose user-owned principles based on the conversation. Seed principles below are lenses, not doctrine. Include a principle in final guidance only when it fits the user's needs or the user confirms it.
5. Setup options and tradeoffs — present workspace/technical options only after principles are confirmed. Explain why each option matters in relation to the confirmed principles. Avoid defaults, hidden recommendations, or bias declarations. Consider structural robustness: if navigation, shared layout, repeated page types, or consistency are likely to matter, discuss framework or static-site structures such as Astro, React with routing, Vue, or another repo-appropriate tool. Do not choose a framework because it is more powerful; choose it when it reduces future artifact breakage, duplicated navigation, inconsistent page anatomy, or maintenance friction.
6. Implementation permission — summarize agreed direction and intended file changes, then ask for explicit permission before editing.
7. Post-setup orientation — explain how to use the workspace, where guidance lives, and how `/brainstorm-with-artifacts` uses it.
</stages>

<seed_principles>
Use these as internal lenses during discovery and guidance creation. Do not present them as a mandatory checklist, and do not preserve rejected principles in the final workspace guidance.

- Reduce cognitive burden; the workspace should make long brainstorming easier to stay inside.
- Chat conducts; artifacts carry substantial reasoning.
- Questions should live with relevant branch context, not as detached chat lists.
- Active decision branches should usually be the main unit.
- Branches need predictable high-level anatomy, but their bodies should stay freeform; do not hardcode a universal branch body template.
- Real pushback should be visible when present.
- Artifacts should develop suggestions, tradeoffs, and options, not only questions.
- Visual form should compress thought, not decorate it.
- Minimal, quiet UI usually beats design-heavy presentation.
- Prefer linear, predictable reading flows over bento grids or dashboard-like layouts.
- Navigation should make the workspace easy to re-enter.
- Anti-staleness should not become amnesia; preserve important cumulative context.
- Implementation plans should be created only when explicitly requested.
</seed_principles>

<guidance_output>
When implementation is approved, create or revise guidance under `.isagi/brainstorming-workspace/guidance/`.

Guidance may define page roles, navigation expectations, and branch-level anatomy, but the branch body should remain an adaptive reasoning surface.

Default to a concise guidance structure. Split into focused files only when useful, for example:

- `guidance/index.md` — entry point and links
- `guidance/principles.md` — confirmed user-owned principles
- `guidance/branch-anatomy.md` — branch structure, lifecycle, questions, pushback
- `guidance/visual-tools.md` — Mermaid, SVG, canvas, tables, diagrams, mocks, rendering support
- `guidance/navigation.md` — links between root, branches, details, and plans
- `guidance/operations.md` — run, reset, build, and maintenance commands
</guidance_output>

<after_setup>
- Tell the user how to open or run the workspace.
- Tell the user to invoke `/brainstorm-with-artifacts` to use it.
- Mention where the guidance index lives.
</after_setup>
