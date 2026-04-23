---
description: Write or refactor engineering guidance docs from the current conversation
agent: build
---

Use the current conversation as the source of truth.

If the conversation has not yet converged on the guidance shape and key principles, stop and ask the user to continue with `/brainstorm-engineering-guidance` first.

<rules>
- Write docs in `docs/engineering-guidance/` with `docs/engineering-guidance/README.md` as the canonical entry point.
- Feel free to refactor existing guidance substantially if that produces a cleaner and more coherent result.
- You may merge, split, rewrite, rename, or remove guidance docs when it materially improves clarity, navigation, or duplication.
- Optimize for clarity, concision, durability, low duplication, and easy scanning.
- Guidance should be useful during coding and review, for both humans and AI agents.
- Keep the tone pragmatic, question-driven, and non-prescriptive.
- Avoid stale repo code snippets, policy-heavy language, style-guide trivia, and framework folklore unless it reflects repeated repo risk.
- Prefer a small, coherent doc set over a sprawling manual.
- Use the seed structure and lenses below as a starting point, not a fixed file contract.
</rules>

<default_shape>
Unless the conversation already settled on a better structure, start from:
- `docs/engineering-guidance/README.md`
- `docs/engineering-guidance/core-principles.md`
- `docs/engineering-guidance/how-to-use.md`

And a small `docs/engineering-guidance/lenses/` set, likely including:
- architecture, modules, and boundaries
- state, effects, and runtime behavior

You may add, merge, split, rename, or remove lens docs if that produces a better fit for the repo and the conversation.
</default_shape>

<output>
After writing, summarize what was created, updated, merged, renamed, or removed.
</output>
