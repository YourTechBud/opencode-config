# Persistence Conventions

Persistence is a lightweight checkpoint system, not a database. Persist only when the user explicitly asks to save, checkpoint, or write milestone/task files.

## Directory Layout

Use the project-local `.pi/` directory unless local conventions say otherwise.

```txt
.pi/
  milestones/
  tasks/
```

The filename stem is the ID.

Example:

```txt
.pi/milestones/improve-correction-confidence.md
```

ID:

```txt
improve-correction-confidence
```

## Milestone Files

Candidate and hardened milestones live in the same directory and are distinguished by status.

Path:

```txt
.pi/milestones/<milestone-id>.md
```

Frontmatter:

```yaml
---
title: Improve correction confidence
status: active
created: 2026-05-27
updated: 2026-05-27
tags: []
---
```

Statuses:

```txt
candidate
ready
active
paused
completed
killed
```

Body:

```md
# Summary

# Why this matters

# Direction

# Done condition

# Boundaries

# Continue with

# Notes
```

For candidate milestones, sections may be rough or explicitly uncertain. Do not invent certainty to fill a template.

## Task Files

Create task files only for hardened milestones, and only when persistence is explicitly requested.

Path:

```txt
.pi/tasks/<task-id>.md
```

Frontmatter:

```yaml
---
title: Inspect current correction flow
status: todo
milestone: improve-correction-confidence
created: 2026-05-27
updated: 2026-05-27
depends_on: []
---
```

Task statuses:

```txt
todo
in-progress
blocked
done
dropped
```

The `milestone` field references the milestone filename stem. Do not maintain two-way links from milestone files to task files unless local project conventions require it.

Body:

```md
# Outcome

# Context

# Done condition

# Notes
```

A task body should be self-contained enough to reorient future-you or a future agent from the task file alone.

## Update Behavior

When updating persisted files:

- Preserve user-written context unless clearly obsolete.
- Update `updated` dates.
- Prefer small edits over rewrites.
- Do not create task files for candidate milestones.
- Do not persist every interesting Spark; persist only useful checkpoint objects.
