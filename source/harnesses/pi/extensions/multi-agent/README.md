# Pi Multi-Agent Deliberation Extension

Project-local Pi extension for orchestrating multiple visible Pi panes through a filesystem mailbox.

The extension is inert by default. Pi behaves normally until you run one of its commands.

## Commands

### Orchestrator

```text
/deliberate <task>
```

Starts an orchestrator run in the current Pi session.

### Child agent

```text
/child-agent <agent-id>
```

Registers the current Pi session as an observe-only child agent. The pane still renders like normal Pi when it receives work, but direct human input is blocked; talk only to the orchestrator.

Examples:

```text
/child-agent brainstorming
/child-agent product
/child-agent engineering
```

The child attaches to the single runtime workspace under `scratch/multi-agent-run/`. If no run exists yet, it waits and attaches when `/deliberate` creates one.

## Recommended demo flow

1. Open one terminal pane for the orchestrator.
2. Open one terminal pane per child agent.
3. In child panes, run:

```text
/child-agent brainstorming
/child-agent product
/child-agent engineering
```

4. In the orchestrator pane, run:

```text
/deliberate <task>
```

5. The orchestrator uses `send_agent_messages` to route work to active child panes.

## Storage layout

Persistent configuration lives under:

```text
.pi/multi-agent/
  settings.json
  orchestrator-rules.md # optional
  child-agents/*.md
```

Exactly one child agent must carry the `driver` label; `/deliberate` fails fast if none is found.

Runtime artifacts live under the single-run workspace:

```text
scratch/multi-agent-run/
  task.md
  run.json
  agent-messages.jsonl
  ipc/
  trace/
  artifacts/
```

Only one runtime run is supported at a time. If `scratch/multi-agent-run/run.json` already exists, `/deliberate` fails fast. Manually delete `scratch/multi-agent-run` before starting a new independent run.

## IPC behavior

`send_agent_messages` writes one request envelope per recipient and waits for all responses. Fan-out is parallel internally, but the tool call blocks externally until every child responds, fails/busies, or the 30-minute timeout expires.

Busy rejection is protocol/UI only and must not mutate the receiving agent's message history.

## HTML traces

Each active agent writes a lifecycle trace:

```text
scratch/multi-agent-run/trace/html/index.html
scratch/multi-agent-run/trace/html/orchestrator.html
scratch/multi-agent-run/trace/html/<child-id>.html
```

Child HTML shows IPC envelope metadata followed by the exact normal user message injected into Pi. The child terminal only shows the normal Pi conversation.

Provider request payload snapshots are captured by default for active orchestrator/child modes because exact prompt visibility is the purpose of the trace.

## Config layout

Child agents are configured by Markdown files in `.pi/multi-agent/child-agents/`.

Optional project-specific orchestrator guidance can be added in `.pi/multi-agent/orchestrator-rules.md`. Its Markdown body is inserted near the end of the orchestrator system prompt under “Additional Orchestrator rules”. Frontmatter is allowed but ignored. These rules may supplement the built-in orchestrator instructions, but they cannot override the built-in role, constraints, loop, or stop rules.

Example:

```md
---
id: brainstorming
displayName: Brainstorming Agent
labels: [driver, brainstorming]
skillCommands:
  - /skill:brainstorming
tools: [read, bash]
thinkingLevel: high
---

You are the exploration driver.
```

## Manual reset

Before starting a new independent run, delete the runtime workspace:

```bash
rm -rf scratch/multi-agent-run
```

## Current limitations

- Only one runtime run is supported at a time.
- Child panes must be started by the user; the extension does not spawn terminals.
- Runtime state is session-local and not restored after `/reload`.
- HTML is regenerated deterministically on events, but no browser auto-refresh is provided.
- The old in-process SDK child-session path has been replaced by filesystem IPC for the demo flow.
