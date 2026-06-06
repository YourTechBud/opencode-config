import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { pathExists } from "./fs.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_MANIFEST_RELATIVE_PATH = path.join(".managed", "coding-harness-config", "manifest.json");

const HARNESSES = ["codex", "opencode", "pi", "claude"] as const;
type HarnessName = (typeof HARNESSES)[number];
type Command = "install" | "clear";

interface InstallMapping {
  sourcePrefix: string;
  destPrefix: string;
}

interface HarnessConfig {
  displayName: string;
  generatedDir: string;
  home(): string;
  mappings: InstallMapping[];
}

const HARNESS_CONFIG: Record<HarnessName, HarnessConfig> = {
  codex: {
    displayName: "Codex",
    generatedDir: "codex",
    home: () => path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex")),
    mappings: [
      { sourcePrefix: "skills", destPrefix: "skills" },
      { sourcePrefix: "agents", destPrefix: "agents" },
    ],
  },
  opencode: {
    displayName: "OpenCode",
    generatedDir: "opencode",
    home: () => path.resolve(process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), ".config", "opencode")),
    mappings: [
      { sourcePrefix: "skills", destPrefix: "skills" },
      { sourcePrefix: "commands", destPrefix: "commands" },
      { sourcePrefix: "agents", destPrefix: "agents" },
    ],
  },
  pi: {
    displayName: "Pi",
    generatedDir: "pi",
    home: () => path.resolve(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent")),
    mappings: [
      { sourcePrefix: "skills", destPrefix: "skills" },
      { sourcePrefix: "prompts", destPrefix: "prompts" },
      { sourcePrefix: "agents", destPrefix: "agents" },
      { sourcePrefix: "extensions", destPrefix: "extensions" },
    ],
  },
  claude: {
    displayName: "Claude Code",
    generatedDir: "claude",
    home: () => path.resolve(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude")),
    mappings: [
      { sourcePrefix: "skills", destPrefix: "skills" },
      { sourcePrefix: "agents", destPrefix: "agents" },
    ],
  },
};

function toPortablePath(file: string): string {
  return file.split(path.sep).join("/");
}

function fromPortablePath(file: string): string {
  return file.split("/").join(path.sep);
}

async function listInstallFiles(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const result: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store" || path.extname(entry.name) === ".log") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() || entry.isSymbolicLink()) result.push(full);
    }
  }

  await walk(dir);
  return result.sort();
}

async function desiredFiles(config: HarnessConfig): Promise<Array<{ source: string; relativeDest: string }>> {
  const result: Array<{ source: string; relativeDest: string }> = [];
  const generatedRoot = path.join(REPO_ROOT, config.generatedDir);

  for (const mapping of config.mappings) {
    const sourceRoot = path.join(generatedRoot, mapping.sourcePrefix);
    for (const source of await listInstallFiles(sourceRoot)) {
      const relative = path.relative(sourceRoot, source);
      result.push({ source, relativeDest: toPortablePath(path.join(mapping.destPrefix, relative)) });
    }
  }

  return result.sort((a, b) => a.relativeDest.localeCompare(b.relativeDest));
}

function stopDirsFor(home: string, config: HarnessConfig): Set<string> {
  return new Set([home, ...config.mappings.map((mapping) => path.join(home, fromPortablePath(mapping.destPrefix)))]);
}

async function pruneEmptyParents(home: string, config: HarnessConfig, relativeFile: string): Promise<void> {
  const stopDirs = stopDirsFor(home, config);
  let current = path.dirname(path.join(home, fromPortablePath(relativeFile)));
  while (!stopDirs.has(current) && current.startsWith(home)) {
    try {
      await fs.rmdir(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

async function removeRelativeFile(home: string, config: HarnessConfig, relativeFile: string): Promise<boolean> {
  const target = path.join(home, fromPortablePath(relativeFile));
  if (!(await pathExists(target))) return false;
  await fs.rm(target, { force: true });
  await pruneEmptyParents(home, config, relativeFile);
  return true;
}

async function readLegacyManifestPaths(home: string): Promise<string[]> {
  const manifestPath = path.join(home, LEGACY_MANIFEST_RELATIVE_PATH);
  if (!(await pathExists(manifestPath))) return [];
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { files?: Array<{ path?: unknown }> };
    return Array.isArray(parsed.files)
      ? parsed.files.map((entry) => entry.path).filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function removeLegacyManifestDir(home: string): Promise<void> {
  const legacyDir = path.join(home, ".managed", "coding-harness-config");
  await fs.rm(legacyDir, { recursive: true, force: true });
  try {
    await fs.rmdir(path.join(home, ".managed"));
  } catch {
    // Keep .managed if something else still uses it.
  }
}

async function cleanupLegacyInstall(home: string, config: HarnessConfig): Promise<number> {
  let removed = 0;
  for (const relativeFile of await readLegacyManifestPaths(home)) {
    if (await removeRelativeFile(home, config, relativeFile)) removed += 1;
  }
  await removeLegacyManifestDir(home);
  return removed;
}

async function installHarness(name: HarnessName): Promise<void> {
  const config = HARNESS_CONFIG[name];
  const home = config.home();
  const generatedDir = path.join(REPO_ROOT, config.generatedDir);
  if (!(await pathExists(generatedDir))) {
    throw new Error(`Missing generated ${config.displayName} directory: ${generatedDir}. Run pnpm run generate first.`);
  }

  await cleanupLegacyInstall(home, config);

  const desired = await desiredFiles(config);
  for (const file of desired) {
    const target = path.join(home, fromPortablePath(file.relativeDest));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(file.source, target);
  }

  console.log(`Installed ${desired.length} ${config.displayName} file(s) into ${home}`);
}

async function clearHarness(name: HarnessName): Promise<void> {
  const config = HARNESS_CONFIG[name];
  const home = config.home();
  const generatedDir = path.join(REPO_ROOT, config.generatedDir);
  const desired = (await pathExists(generatedDir)) ? await desiredFiles(config) : [];
  const paths = new Set(desired.map((file) => file.relativeDest));
  for (const legacyPath of await readLegacyManifestPaths(home)) paths.add(legacyPath);

  let removed = 0;
  for (const relativeFile of [...paths].sort()) {
    if (await removeRelativeFile(home, config, relativeFile)) removed += 1;
  }
  await removeLegacyManifestDir(home);

  console.log(`Removed ${removed} ${config.displayName} file(s) from ${home}`);
}

function parseHarnesses(value: string | undefined): HarnessName[] {
  if (!value || value === "all") return [...HARNESSES];
  if (!HARNESSES.includes(value as HarnessName)) {
    throw new Error(`Unknown harness: ${value}. Expected one of: all, ${HARNESSES.join(", ")}`);
  }
  return [value as HarnessName];
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command | undefined;
  const harnesses = parseHarnesses(process.argv[3]);
  if (command !== "install" && command !== "clear") {
    throw new Error(`Usage: tsx generator/harness-install.ts install|clear [all|${HARNESSES.join("|")}]`);
  }

  for (const harness of harnesses) {
    if (command === "install") await installHarness(harness);
    else await clearHarness(harness);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
