
# Brainstorming UI/UX Blueprint

## Role

Layer on top of the brainstorming loop for UI/UX work. Make interface, interaction, and visual ideas concrete by grounding them in the actual user problem and the product's existing taste, then exploring meaningfully distinct variants instead of describing options in prose.

## Success Criteria

This layer is working when:

- The user can see proposed UI directions, not just read about them.
- The problem the UI is solving is explicit and confirmed before mockups are committed to.
- Mockups borrow taste from the actual product rather than from a generic UI playbook.
- 2–5 meaningfully distinct variants are produced when the user is deciding direction.
- Each variant clearly embodies a different hypothesis or tradeoff, not a cosmetic tweak.
- Relevant states and journeys are accounted for when they would change the design decision.

## Principles

### Start with the problem, not the requested UI

Treat a requested interface as one hypothesis, not the answer. Refocus on what user problem is being solved, what behavior or outcome the UI should enable, and whether the requested UI is the best solution. The user may have a strong opinion about the surface — treat it as input, not constraint, until the underlying need is understood.

### Never assume; always ask

UI/UX problems are especially sensitive to assumptions about who the user is, what they are doing, and in what context. Ask before committing to mockups; polished mockups that solve the wrong problem are worse than rough mockups that solve the right one.

### Ground in the existing product

When working in a repo or existing app, inspect the current UI and styling conventions before proposing mockups. Look at:

- the styling system or framework in use (Tailwind, CSS modules, styled-components, design-system imports, etc.)
- the existing component library and primitive patterns
- design tokens, spacing scale, typography, color system
- layout patterns and interaction conventions
- existing screens that solve similar problems

If the repo alone does not give enough taste signal, ask the user for screenshots, references, or links to existing screens.

### Match the product's taste

Do not impose a generic UI taste. Infer the product's taste from the repo, the app, screenshots, references, or anything the user provides. Avoid universal rules like "avoid gradients" or "always use this layout" — the right taste depends on the product. If the repo has its own frontend or design guidance, defer to it.

### Show, don't tell

Once the problem is understood enough to visualize, prefer concrete mockups, sketches, or layout variants over prose-only descriptions. This is a strong default, not an invariant — when the design space is still too undefined to mock up usefully, ask rather than invent.

### Explore 2–5 variants

When exploring a UI direction, usually produce 2–5 meaningfully distinct variants. Even when the user has a clear idea in mind, variants tend to surface tradeoffs, alternatives, or better solutions the user did not initially see. Avoid variants that are only cosmetic tweaks; each variant should embody a distinct hypothesis or tradeoff.

### Explore states and journeys when they matter

Good UI/UX brainstorming usually considers more than the happy path. Account for empty, loading, error, disabled, hover/focus, and other relevant states when they would change the design decision. Same for end-to-end journeys when the question is about flow rather than a single screen. This is a prompt to think broadly, not a mandatory checklist for every mockup.

### Use clear assumptions

Mockups can include illustrative placeholder data and inferred details. When they do, make those assumptions visible enough that the user can tell what is real, what is inferred from context, and what is invented for the sake of the mockup.

## Scratch Space

Files created for this blueprint live under `scratch/brainstorming/ui-ux/`. This is disposable session-scoped scratch.

## What This Blueprint Does Not Own

This blueprint does not prescribe universal accessibility, responsive-design, or visual taste rules. Those come from the repo's own frontend guidance, the user, the product context, or any applicable design skill. Still account for accessibility or responsive behavior when they would materially affect the design decision being brainstormed.
