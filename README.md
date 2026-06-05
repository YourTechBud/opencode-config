# coding-harness-config

Shared config directory containing **skills**, **commands/prompts**, **agents**, **plugins**, and **extensions** for the various coding harnesses YourTechBud uses (OpenCode, Pi, Claude Code).

Canonical assets live under `source/`. The harness directories (`.opencode`, `.pi`, `.claude`) are generated from that source and committed for direct consumption.

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

1. Clone this repo somewhere on your machine.
2. Open `~/.pi/agent/settings.json` (create it if it doesn't exist).
3. Add (or merge) the following keys, replacing `/path/to/cloned/coding-harness-config` with the actual path where you cloned this repo:

```json
{
  "extensions": ["/path/to/cloned/coding-harness-config/.pi/extensions"],
  "skills": ["/path/to/cloned/coding-harness-config/.pi/skills"],
  "prompts": ["/path/to/cloned/coding-harness-config/.pi/prompts"],
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

- `skills`, `prompts`, `extensions`, and `agents` point at generated Pi-specific outputs under `.pi/`.
- Edit canonical files under `source/`, then run `pnpm run generate` to update generated harness outputs.
- `codexFastModels` is consumed by the Pi `codex-fast-model` extension. It registers `openai-codex/gpt-5.5-fast` as a local alias that sends upstream requests to `gpt-5.5` with `service_tier: "priority"`. Pi/OpenCode currently price that as 2.5× normal GPT-5.5.
- Add `openai-codex/gpt-5.5-fast` to `enabledModels` if you want it in Pi's scoped model picker / model cycling list.

Restart Pi and it should pick up everything automatically.

## Claude Code

Claude Code config is packaged as a local plugin (`essentials`) under `.claude/`. Install it by registering the marketplace in your global settings.

1. Clone this repo somewhere on your machine.
2. Open `~/.claude/settings.json` (create it if it doesn't exist).
3. Add (or merge) the following, replacing the path with where you cloned this repo, then restart Claude Code:

```json
{
  "extraKnownMarketplaces": {
    "yourtechbud": {
      "source": {
        "source": "directory",
        "path": "/path/to/cloned/coding-harness-config/.claude"
      }
    }
  },
  "enabledPlugins": {
    "essentials@yourtechbud": true
  }
}
```

## Maintenance

Edit canonical assets under `source/`, then run:

```sh
pnpm run generate
pnpm run check
```

Do not edit `.opencode`, `.pi`, or `.claude` directly; they are destructively regenerated.
