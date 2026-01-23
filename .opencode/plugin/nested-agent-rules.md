# Nested Agent Rules Plugin

Automatically discovers and loads nested `AGENTS.md` and `CLAUDE.md` files when working with files in subdirectories.

## Overview

OpenCode by default only loads `AGENTS.md` files from the current working directory upward to the git root. This plugin extends that functionality to automatically discover and inject nested rule files based on where the LLM actually operates (reads, writes, or edits files).

## How It Works

1. **Monitors File Access**: Tracks when files are accessed via:
   - `@` mentions (e.g., `@packages/player-view/src/App.tsx`)
   - LLM tool calls (read, write, edit)
2. **Discovers Rules**: Walks up from the file's directory to find `AGENTS.md` or `CLAUDE.md` files
3. **Stores Rules**: Caches discovered rules per session (only discovers once, but injects on every call)
4. **Injects on Every LLM Call**: Adds ALL discovered rules to the system prompt before EVERY LLM request
5. **Avoids Duplicates**: Skips files already loaded by OpenCode and won't re-discover the same file

## Features

- ✅ Supports both `AGENTS.md` and `CLAUDE.md` files
- ✅ Injects rules on **every** LLM request (not just once)
- ✅ Per-session caching to avoid re-discovering files
- ✅ Respects OpenCode's existing rule files (skips already-loaded files)
- ✅ Toast notifications for immediate feedback (configurable)
- ✅ Structured logging for debugging

## Configuration

### Environment Variables

| Variable              | Default       | Description                               |
| --------------------- | ------------- | ----------------------------------------- |
| `NESTED_AGENTS_DEBUG` | `1` (enabled) | Set to `0` to disable toast notifications |

### Disabling Toast Notifications

```bash
# Run OpenCode without toast notifications
NESTED_AGENTS_DEBUG=0 opencode

# Or set it in your shell profile
export NESTED_AGENTS_DEBUG=0
```

## Testing the Plugin

The project has test AGENTS.md files set up in various locations:

```
/AGENTS.md                           # Root (loaded by OpenCode)
├── packages/AGENTS.md               # Will be discovered by plugin
│   └── player-view/AGENTS.md        # Will be discovered by plugin
│       └── src/AGENTS.md            # Will be discovered by plugin
└── apps/
    └── maverick/CLAUDE.md            # Tests CLAUDE.md fallback
```

### Test Scenarios

#### Test 1: Multi-Level Nesting (via LLM tool)

Ask OpenCode to read a deeply nested file:

```
Read the file packages/player-view/src/components/course-header/types.ts
```

**Expected behavior:**

- Toast: "Loaded nested rules: packages/player-view/AGENTS.md"

#### Test 1b: Multi-Level Nesting (via @ mention)

Use the @ operator to attach a file:

```
@packages/player-view/src/App.tsx what does this file do?
```

**Expected behavior:**

- Toast: "Loaded nested rules: packages/player-view/AGENTS.md"

#### Test 2: CLAUDE.md Fallback

Ask OpenCode to read a file in maverick:

```
Read the file apps/maverick/src/main.ts
```

**Expected behavior:**

- Toast: "Loaded nested rules: apps/maverick/CLAUDE.md"

#### Test 3: Persistent Injection

Ask OpenCode to read another file in the same directory:

```
Read the file packages/player-view/src/App.tsx
```

**Expected behavior:**

- No new toasts (files already discovered)
- But the rules ARE still injected into the system prompt on every LLM call

Ask the LLM a follow-up question:

```
What CLAUDE.md files do you see in your system message?
```

**Expected behavior:**

- The LLM should reference the nested AGENTS.md rules from packages/player-view/

### Viewing Logs

To see detailed logs:

```bash
# Run OpenCode with debug logging
opencode --log-level DEBUG

# Or check logs after the fact
# Logs are stored in OpenCode's data directory
```

## How to Verify It's Working

1. **Toast Notifications** (if enabled): You'll see brief notifications when nested rules are loaded
2. **Ask the LLM**: After loading nested rules, ask the LLM what instructions it has - it should reference the nested rule files
3. **Check Logs**: Use `--log-level DEBUG` to see detailed plugin activity

## Implementation Details

### Hooks Used

- `chat.message`: Detects file attachments via @ mentions and discovers rules immediately
- `tool.execute.after`: Detects file operations (read, write, edit) and discovers new rule files
- `experimental.chat.system.transform`: Injects ALL discovered rules into system prompt on EVERY LLM call

### File Discovery Algorithm

1. Triggered when:
   - User attaches a file via `@filepath` mention
   - LLM reads, writes, or edits a file via tool calls
2. Start from the directory containing the file being operated on
3. Walk up the directory tree toward project root
4. At each level, check for `AGENTS.md` first, then `CLAUDE.md`
5. Stop when reaching the project root (exclusive - root rules already loaded)
6. Skip any files already in the system prompt or previously discovered
7. **Store discovered rules** for injection on all subsequent LLM calls

### Injection Behavior

- **Discovery**: Rules are discovered ONCE when a file operation occurs in a new directory
- **Injection**: ALL discovered rules are injected into the system prompt on EVERY LLM call
- **Order**: Rules are injected from **farthest to closest** (root → specific), so more specific rules appear later in the system prompt and can override general rules
- **Persistence**: Once discovered, rules continue to be injected for the entire session

## Troubleshooting

### Plugin Not Loading

1. Check that the file exists: `.opencode/plugin/nested-agent-rules.ts`
2. Check for TypeScript errors: `pnpm tsc --noEmit` (if you have a tsconfig)
3. Restart OpenCode

### No Toast Notifications

- Check that `NESTED_AGENTS_DEBUG` is not set to `0`
- Check OpenCode logs to see if rules are being loaded

### Rules Not Being Applied

1. Verify the AGENTS.md files exist in the expected locations
2. Use `--log-level DEBUG` to see what files are being discovered
3. Ask the LLM to list what instructions it has received

## Future Enhancements

Potential improvements:

- [ ] Add a `/nested-rules-status` command to show loaded files
- [ ] Support for custom file patterns (e.g., `RULES.md`, `INSTRUCTIONS.md`)
- [ ] Option to scan directories proactively instead of reactively
- [ ] Integration with OpenCode's file watcher for automatic reload on changes

## License

This plugin is part of the Fluidcast V2 project.
