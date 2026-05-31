# coding-agent-config

Shared config directory containing **skills**, **agents**, **plugins**, and **extensions** for the various coding harnesses YourTechBud uses (OpenCode, Pi, Claude Code).

The skills under `.agents/skills` are shared across harnesses; everything else is harness-specific and lives under the matching top-level directory (`.opencode`, `.pi`, `.claude`).

## OpenCode

1. Clone this repo somewhere on your machine.
2. Set `OPENCODE_CONFIG_DIR` to the `.opencode` directory *inside* your cloned copy (i.e., `<path-you-cloned-to>/.opencode`).

Add this to your shell profile:

```sh
# ~/.zshrc or ~/.bashrc
export OPENCODE_CONFIG_DIR="/path/to/cloned/opencode-config/.opencode"
```

Restart your shell (or `source` your profile), and you're done.

The next time you start OpenCode, it should load all configuration from this directory automatically.

## Pi

Pi doesn't use an env var — instead, point its settings file at the directories in this repo.

1. Clone this repo somewhere on your machine.
2. Open `~/.pi/agent/settings.json` (create it if it doesn't exist).
3. Add (or merge) the following keys, replacing `/path/to/cloned/opencode-config` with the actual path where you cloned this repo:

```json
{
  "extensions": [
    "/path/to/cloned/opencode-config/.pi/extensions"
  ],
  "skills": [
    "/path/to/cloned/opencode-config/.agents/skills"
  ],
  "prompts": [
    "/path/to/cloned/opencode-config/.opencode/commands"
  ],
  "agents": [
    "/path/to/cloned/opencode-config/.pi/agents"
  ]
}
```

Notes:

- `skills` points at `.agents/skills` because skills are shared with OpenCode.
- `prompts` reuses the OpenCode `commands` directory so slash-commands stay in sync.
- `extensions` and `agents` are Pi-specific and live under `.pi/`.

Restart Pi and it should pick up everything automatically.

## Claude Code

_TBD — config lives under `.claude/` but setup instructions aren't written up yet._

## Maintenance

Remember to keep this repo updated periodically as your skills/agents/plugins/extensions evolve.
