
# Brainstorming Cognitive-Load Blueprint

## Role

Layer on top of the brainstorming loop to reduce cognitive load. Move dense, structural, visual, or comparison-heavy material out of chat and into focused supporting artifacts so the conversation stays readable.

## Success Criteria

This layer is working when:

- Chat stays shorter and more scannable than it would be without artifacts.
- Every artifact pulls its weight; nothing is created for the sake of producing one.
- Each piece of substantive content lives in exactly one place — chat or artifact, never both.
- Artifacts appear at the moment in the flow where they help the next idea land, not as an upfront announcement or an end-of-message link dump.
- Each artifact has an obvious reading order top to bottom.
- The user can read chat → artifact → chat in a linear flow without getting lost.

## Principles

### Externalize only when it reduces load

An artifact is worthwhile when it makes the next idea land faster, makes a comparison easier, or saves the user from rereading prose. If chat already handles the material well, leave it in chat. Producing an artifact every turn is a smell.

### Interleave artifacts with the chat

Artifacts appear at the moment in the chat where they help — not as an upfront announcement, and not as a link dump at the bottom. The reading flow should feel linear: read chat → open artifact → return → keep reading.

When pointing to an artifact, give the user a short bridge in chat: where it is, why it exists, and what to look at. Then continue the conversation in the next paragraph.

### Single ownership: chat or artifact, never both

Decide whether the artifact or the chat owns a given piece of substantive content, and let that medium carry it. If an artifact owns the explanation, chat introduces it and continues the thread without restating its content. Duplicating substance across both is the most common way these sessions go stale. A brief bridge sentence in chat is expected; restating the artifact's substantive material is not.

### Artifacts are one-way explainers

Artifacts carry maps, comparisons, diagrams, walkthroughs, and structural explanations — not the two-way conversation. Questions, decisions, prompts for user input, and labels like "Open question" or "Decision pending" belong in chat. If a branch map needs to mark something as parked or unresolved, put that framing next to the pointer in chat, not inside the artifact.

### Linear reading order

Each artifact should have an obvious reading order. Single-column layouts are the default. Multi-column or grid layouts are fine when the order is obvious from context. Avoid bento grids, dashboards, or equal-weight blocks that force the user to choose where to start.

### Multiple focused artifacts beat one overloaded artifact

A turn can produce as many artifacts as it usefully needs. Prefer several focused artifacts placed where the conversation calls for them over one large artifact that tries to carry everything.

## What Artifacts Can Carry

Useful shapes include, but are not limited to:

- branch maps, decision-tree maps, and "where are we?" checkpoints
- option comparisons and tradeoff matrices
- architecture, data-flow, sequence, and state diagrams
- dependency, rollout, sequencing, and timeline maps
- risk and validation matrices
- concept explainers, glossaries, and reference walkthroughs
- dense codebase walkthroughs and before/after process diagrams
- user-journey maps when the point is comprehension, not UI design
- implementation-plan explainers (see below)

Diagrams are encouraged when they reduce load. Mermaid is a useful source format when the agent can render it as an image — the user should see the rendered diagram, not a raw Mermaid code block.

## Implementation-Plan Artifacts

When the user asks for an implementation plan and the plan is non-trivial, the plan itself is a good candidate for an artifact. A plan artifact can carry:

- the final architecture shape
- impactful code snippets and expected code shapes
- module, file, or system-level change maps
- sequence diagrams or state-flow visuals for the new behavior
- workflow diagrams for end-to-end flows
- validation commands and checklists
- risk tables and rollout/rollback notes

Plan artifacts are still planning; the "stop at a plan" boundary still holds.

## Scratch Space

Files created for this blueprint live under `scratch/brainstorming/cognitive-load/`. This is disposable session-scoped scratch. Create or update files only when they help the current conversation. No index file, no durable workspace maintenance.
