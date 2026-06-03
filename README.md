# coding-harness-config

Shared config directory containing **skills**, **agents**, **plugins**, and **extensions** for the various coding harnesses YourTechBud uses (OpenCode, Pi, Claude Code).

The skills under `.agents/skills` are shared across harnesses; everything else is harness-specific and lives under the matching top-level directory (`.opencode`, `.pi`, `.claude`).

## OpenCode

1. Clone this repo somewhere on your machine.
2. Set `OPENCODE_CONFIG_DIR` to the `.opencode` directory _inside_ your cloned copy (i.e., `<path-you-cloned-to>/.opencode`).

Add this to your shell profile:

```sh
# ~/.zshrc or ~/.bashrc
export OPENCODE_CONFIG_DIR="/path/to/cloned/coding-harness-config/.opencode"
```

Restart your shell (or `source` your profile), and you're done.

The next time you start OpenCode, it should load all configuration from this directory automatically.

## Pi

Pi doesn't use an env var — instead, point its settings file at the directories in this repo.

1. Clone this repo somewhere on your machine.
2. Open `~/.pi/agent/settings.json` (create it if it doesn't exist).
3. Add (or merge) the following keys, replacing `/path/to/cloned/coding-harness-config` with the actual path where you cloned this repo:

```json
{
  "extensions": ["/path/to/cloned/coding-harness-config/.pi/extensions"],
  "skills": ["/path/to/cloned/coding-harness-config/.agents/skills"],
  "prompts": ["/path/to/cloned/coding-harness-config/.opencode/commands"],
  "agents": ["/path/to/cloned/coding-harness-config/.pi/agents"],
  "codexFastModels": [
    {
      "base": "gpt-5.5",
      "alias": "gpt-5.5-fast",
      "name": "GPT-5.5 Fast"
    }
  ]
}
```

Notes:

- `skills` points at `.agents/skills` because skills are shared with OpenCode.
- `prompts` reuses the OpenCode `commands` directory so slash-commands stay in sync.
- `extensions` and `agents` are Pi-specific and live under `.pi/`.
- `codexFastModels` is consumed by the Pi `codex-fast-model` extension. It registers `openai-codex/gpt-5.5-fast` as a local alias that sends upstream requests to `gpt-5.5` with `service_tier: "priority"`. Pi/OpenCode currently price that as 2.5× normal GPT-5.5.
- Add `openai-codex/gpt-5.5-fast` to `enabledModels` if you want it in Pi's scoped model picker / model cycling list.

Restart Pi and it should pick up everything automatically.

## Claude Code

_TBD — config lives under `.claude/` but setup instructions aren't written up yet._

## Maintenance

Remember to keep this repo updated periodically as your skills/agents/plugins/extensions evolve.
