# Coding agent configurations

This repo holds the configuration for various coding harnesses like OpenCode, Pi and Claude Code.

## Repo structure

Common configurations

- `.agents/skills`: Contains skills which are symlinked to `.opencode/skills` and `.claude/skills`.

Opencode specific config

- `.opencode` contains opencode specific configuration
- `.opencode/agents` contains opencode agents. The agents with `mode: subagent` are shared with Pi. So edits to files with `mode: subagent` should be reproduced to the equivalent pi agents in `.pi/agents`.

Pi specific config

- `.pi` contains pi specific config
- All customizations to Pi should be done via the extension only. Never change the core.
- When planning changes to pi extensions (new or existing) always take into account how the change will affect other extensions. Dont worry about the `multi-agent` extension. That's legacy.

Claude code specific config

- `.claude` contains Claude code specific configuration
