---
description: Plan documentation changes based on conversation context
---

Review our conversation and identify what needs to be documented.

Extract:
- Key concepts, decisions, or information that should be captured
- Any context about target audience or doc style if mentioned

Then invoke the @documentation subagent with:
- mode: plan
- The content summary you extracted

If this is a revision (user gave feedback on a previous plan), include:
- mode: plan  
- The user's feedback on what to change

Report back:
- The compact summary the subagent returns
- Confirm the plan file location (scratch/docs-plan.md)
- Ask if the user wants to proceed with /write-docs or iterate further
