# Coding agent configurations

This repo holds the configuration for various coding harnesses like OpenCode, Pi, Claude Code, Codex.

## Repo structure

Canonical source

- `source/skills`: Canonical skill assets. Each asset has `asset.yaml` for metadata/frontmatter and `body.md` for the prompt body.
- `source/commands`: Canonical command/prompt assets. OpenCode commands and Pi prompts are generated from here; Claude and Codex receive these as skills with model auto-invocation disabled by default where appropriate.
- `source/agents`: Canonical agent/subagent assets.
- `source/harnesses`: Handwritten harness config that is copied into generated harness directories.

Generated harness directories

- `opencode`, `pi`, `claude`, and `codex` are fully generated. Do not edit them directly.
- These directories are destructively recreated by `pnpm run generate`; make all changes under `source/` instead.
- Generated outputs are committed so consumers can use the repo without running generation after every pull.

Generation and install commands

- `pnpm run generate`: recreate `opencode`, `pi`, `claude`, and `codex` from `source/`, then run `npm install` in generated Pi extension folders that contain a `package.json`.
- `pnpm run check`: verify committed generated outputs match `source/`.
- `pnpm run harness:install`: copy generated assets for Codex, OpenCode, Pi, and Claude Code into each harness home, overwriting repo-managed destination files.
- `pnpm run harness:clear`: remove the currently generated repo-managed files from each harness home.
- `pnpm run harness:sync`: run generation once, then install all harnesses.
- Per-harness install/clear scripts also exist: `codex:*`, `opencode:*`, `pi:*`, and `claude:*`.

After changing canonical assets or generator behavior, suggest that the user run `pnpm run generate` and `pnpm run harness:install` so generated outputs and global harness installs are refreshed.

Pi specific config

- All customizations to Pi should be done via the extension only. Never change the core.
- When planning changes to Pi extensions (new or existing) always take into account how the change will affect other extensions. Don't worry about the `multi-agent` extension. That's legacy.
- All Pi extension code is present in `source/harnesses/pi/extensions`.
