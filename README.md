# coding-harness-config

Shared config directory containing **skills**, **commands/prompts**, **agents**, and **extensions** for the various coding harnesses YourTechBud uses (OpenCode, Pi, Claude Code, Codex).

Canonical assets live under `source/`. Harness outputs are generated as direct root directories (`opencode`, `pi`, `claude`, `codex`) and committed for direct consumption.

## Install / sync

Generated assets are copied into each harness home. The installer treats those destination files as managed by this repo and overwrites them on install. `clear` removes the currently generated files from each harness home.

Install or refresh all harnesses after generation:

```sh
pnpm run harness:install
```

Regenerate once, then install all harnesses:

```sh
pnpm run harness:sync
```

Remove only files installed by this repo:

```sh
pnpm run harness:clear
```

Per-harness install/clear scripts are also available:

```sh
pnpm run codex:install   # or codex:clear
pnpm run opencode:install
pnpm run pi:install
pnpm run claude:install
```

## Install locations

| Harness     | Destination                                                                     |
| ----------- | ------------------------------------------------------------------------------- |
| Codex       | `${CODEX_HOME:-~/.codex}/skills`, `${CODEX_HOME:-~/.codex}/agents`              |
| OpenCode    | `${OPENCODE_CONFIG_DIR:-~/.config/opencode}/skills`, `commands`, `agents`       |
| Pi          | `${PI_CODING_AGENT_DIR:-~/.pi/agent}/skills`, `prompts`, `agents`, `extensions` |
| Claude Code | `${CLAUDE_CONFIG_DIR:-~/.claude}/skills`, `agents`                              |

## OpenCode settings

The installer intentionally does **not** copy `opencode/opencode.json`. It honors `OPENCODE_CONFIG_DIR`; unset that environment variable to install into the default `~/.config/opencode` directory.

If desired, apply these settings manually to your OpenCode config:

```json
{
  "experimental": {
    "disable_paste_summary": true
  },
  "agent": {
    "explore": {
      "model": "openai/gpt-5.4-mini",
      "variant": "low"
    }
  }
}
```

## Pi settings

The installer copies Pi skills, prompts, agents, and extensions directly from `pi/` into `${PI_CODING_AGENT_DIR:-~/.pi/agent}`, so `~/.pi/agent/settings.json` does not need repo-local `skills`, `prompts`, `agents`, or `extensions` paths.

Recommended Pi settings:

```json
{
  "codexFastModels": [
    {
      "base": "gpt-5.5",
      "alias": "gpt-5.5-fast",
      "name": "GPT-5.5 Fast"
    }
  ]
}
```

`pnpm run generate` runs `npm install` for generated Pi extensions that contain a `package.json`. `pnpm run harness:install` then copies the generated extensions, including installed `node_modules`, into the Pi agent home.

The Pi `codex-fast-model` extension reads `codexFastModels` and registers `openai-codex/gpt-5.5-fast` as a local alias that sends upstream requests to `gpt-5.5` with `service_tier: "priority"`.

## Maintenance

Edit canonical assets under `source/`, then run:

```sh
pnpm run generate
pnpm run harness:install
pnpm run check
```

Do not edit `opencode`, `pi`, `claude`, or `codex` directly; they are destructively regenerated.
