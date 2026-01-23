import type { Plugin } from "@opencode-ai/plugin";
import { readFile, stat } from "fs/promises";
import { dirname, join, resolve, relative } from "path";

// File names to search for (first found wins per directory)
const AGENTS_FILES = ["AGENTS.md", "CLAUDE.md"];

// Debug mode: toast notifications enabled by default, disable with NESTED_AGENTS_DEBUG=0
const DEBUG = process.env.NESTED_AGENTS_DEBUG !== "0";

export const NestedAgentRulesPlugin: Plugin = async ({
  client,
  directory,
  worktree,
}) => {
  const projectRoot = worktree || directory;

  // Per-session state
  const sessionState = new Map<
    string,
    {
      loadedAgentsFiles: Map<string, string>; // path -> content (for re-injection on every call)
      initialAgentsFiles: Set<string>;
      firstTransform: boolean;
    }
  >();

  function getSessionState(sessionID: string) {
    if (!sessionState.has(sessionID)) {
      sessionState.set(sessionID, {
        loadedAgentsFiles: new Map(),
        initialAgentsFiles: new Set(),
        firstTransform: true,
      });
    }
    return sessionState.get(sessionID)!;
  }

  async function findAgentsFile(dir: string): Promise<string | null> {
    for (const filename of AGENTS_FILES) {
      const filePath = join(dir, filename);
      try {
        await stat(filePath);
        return filePath;
      } catch {
        continue;
      }
    }
    return null;
  }

  async function discoverAgentsFiles(
    startDir: string,
    state: ReturnType<typeof getSessionState>,
  ): Promise<void> {
    let currentDir = resolve(startDir);
    const absoluteRoot = resolve(projectRoot);
    const discovered: Array<{ path: string; content: string }> = [];

    while (currentDir.startsWith(absoluteRoot) && currentDir !== absoluteRoot) {
      const agentsFile = await findAgentsFile(currentDir);

      if (
        agentsFile &&
        !state.loadedAgentsFiles.has(agentsFile) &&
        !state.initialAgentsFiles.has(agentsFile)
      ) {
        try {
          const content = await readFile(agentsFile, "utf-8");
          const relativePath = relative(projectRoot, agentsFile);
          const formattedContent = `Instructions from: ${relativePath}\n${content}`;

          discovered.push({
            path: relativePath,
            content: formattedContent,
          });

          // Store for re-injection on every LLM call
          state.loadedAgentsFiles.set(agentsFile, formattedContent);
        } catch {
          // File read failed, skip
        }
      }

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }

    // Log newly discovered files (in order: farthest first)
    for (const item of discovered.reverse()) {
      await client.app.log({
        body: {
          service: "nested-agent-rules",
          level: "info",
          message: `Discovered nested rules: ${item.path}`,
        },
      });

      if (DEBUG) {
        await client.tui.showToast({
          body: {
            message: `Loaded nested rules: ${item.path}`,
            variant: "info",
          },
        });
      }
    }
  }

  return {
    "chat.message": async (input, output) => {
      // Hook into message creation to catch @ file attachments
      const state = getSessionState(input.sessionID);

      for (const part of output.parts) {
        if (part.type === "file" && part.url?.startsWith("file://")) {
          const filePath = part.url.slice(7); // Remove "file://" prefix
          const fileDir = dirname(filePath);

          // Discover new AGENTS.md files for attached files
          if (fileDir.startsWith(resolve(projectRoot))) {
            await discoverAgentsFiles(fileDir, state);
          }
        }
      }
    },

    "tool.execute.after": async (input, output) => {
      const targetTools = ["read", "write", "edit"];
      if (!targetTools.includes(input.tool)) return;

      const filePath = output.metadata?.filePath || output.title;
      if (!filePath) return;

      const state = getSessionState(input.sessionID);
      const fileDir = dirname(resolve(projectRoot, filePath));

      // Discover new AGENTS.md files when operating on files in subdirectories
      if (fileDir.startsWith(resolve(projectRoot))) {
        await discoverAgentsFiles(fileDir, state);
      }
    },

    "experimental.chat.system.transform": async (input, output) => {
      const state = getSessionState(input.sessionID);

      // Detect files already loaded by OpenCode on first call
      if (state.firstTransform) {
        state.firstTransform = false;
        for (const line of output.system) {
          const match = line.match(/^Instructions from: (.+)$/m);
          if (match) {
            const absPath = resolve(projectRoot, match[1]);
            state.initialAgentsFiles.add(absPath);
          }
        }
      }

      // Inject ALL loaded nested rules on EVERY LLM call
      for (const content of state.loadedAgentsFiles.values()) {
        output.system.push(content);
      }
    },
  };
};
