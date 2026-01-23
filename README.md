# opencode-config

Shared OpenCode config directory containing my personal **skills**, **agents**, and **plugins**.

## Usage

1. Clone this repo somewhere on your machine.
2. Set `OPENCODE_CONFIG_DIR` to the `.opencode` directory *inside* your cloned copy (i.e., `<path-you-cloned-to>/.opencode`).

Add this to your shell profile:

```sh
# ~/.zshrc or ~/.bashrc
export OPENCODE_CONFIG_DIR="/path/to/cloned/opencode-config/.opencode"
```

Restart your shell (or `source` your profile), and you’re done.

The next time you start OpenCode, it should load all configuration from this directory automatically.

## Maintenance

Remember to keep this repo updated periodically as your skills/agents/plugins evolve.
