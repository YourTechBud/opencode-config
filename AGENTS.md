# Coding agent configurations

This repo holds the configuration for various coding harnesses like OpenCode, Pi and Claude Code.

## Repo structure

Canonical source

- `source/skills`: Canonical skill assets. Each asset has `asset.yaml` for metadata/frontmatter and `body.md` for the prompt body.
- `source/commands`: Canonical command/prompt assets. OpenCode commands and Pi prompts are generated from here; Claude receives these as plugin skills with model auto-invocation disabled by default.
- `source/agents`: Canonical agent/subagent assets.
- `source/harnesses`: Handwritten harness config that is copied into generated harness directories.

Generated harness directories

- `.opencode`, `.pi`, and `.claude` are fully generated. Do not edit them directly.
- These directories are destructively recreated by `pnpm run generate`; make all changes under `source/` instead.
- Generated outputs are committed so consumers can use the repo without running generation after every pull.

Generation commands

- `pnpm run generate`: recreate `.opencode`, `.pi`, and `.claude` from `source/`.
- `pnpm run check`: verify committed generated outputs match `source/`.

Pi specific config

- All customizations to Pi should be done via the extension only. Never change the core.
- When planning changes to pi extensions (new or existing) always take into account how the change will affect other extensions. Dont worry about the `multi-agent` extension. That's legacy.
- All pi extension code is present in `source/harnesses/pi/extensions`
