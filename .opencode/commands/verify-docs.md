---
description: Verify documentation against conversation context
---

Review **all** documentation in docs/ and verify it against our conversation.

<verification_criteria>
1. **No contradictions**: identify any statements in docs that conflict with or contradict what we discussed in this conversation.
2. **Self-explanatory**: flag places where a reader would be confused without context they don't have — undefined terms, missing prerequisites, unclear steps, unstated assumptions.
3. **Nothing important missed**: identify topics, decisions, or details from our conversation that should be documented but are absent or incomplete across docs/.
</verification_criteria>

<steps>
1. Read all files in docs/ to understand the current documentation state.
2. Evaluate every doc against the three criteria above, using the full conversation as the reference.
3. Produce a narrative verification report covering:
   - What you reviewed (which files)
   - Findings for each criterion (contradictions, clarity gaps, missing content)
   - Concrete suggested edits where issues are found (specific files and sections)
   - An overall plain-language verdict
</steps>

<rules>
- Check **all** docs, not just recently changed ones. A prior doc may now be stale or contradicted by what we discussed.
- Do not make any edits. This command is read-only; only report findings.
- Keep the report concise but specific. Cite the doc file and section for each finding.
</rules>
