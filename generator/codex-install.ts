import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles, pathExists, writeFileEnsured } from "./fs.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_CODEX_DIR = path.join(REPO_ROOT, ".codex");
const MANAGED_ROOT = path.join(".managed", "coding-harness-config");
const MANIFEST_RELATIVE_PATH = path.join(MANAGED_ROOT, "manifest.json");
const SKILL_DEST_PREFIX = path.join("skills", "yourtechbud");
const AGENT_DEST_PREFIX = "agents";

interface ManifestEntry {
  path: string;
  sha256: string;
}

interface Manifest {
  schemaVersion: 1;
  repo: string;
  installedAt: string;
  files: ManifestEntry[];
}

function codexHome(): string {
  return path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

function toManifestPath(file: string): string {
  return file.split(path.sep).join("/");
}

function fromManifestPath(file: string): string {
  return file.split("/").join(path.sep);
}

function sha256(content: Buffer | string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function fileSha256(file: string): Promise<string | undefined> {
  if (!(await pathExists(file))) return undefined;
  return sha256(await fs.readFile(file));
}

async function readManifest(home: string): Promise<Manifest | undefined> {
  const manifestPath = path.join(home, MANIFEST_RELATIVE_PATH);
  if (!(await pathExists(manifestPath))) return undefined;
  const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Manifest;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.files)) {
    throw new Error(`${manifestPath} is not a supported coding-harness-config manifest`);
  }
  return parsed;
}

async function writeManifest(home: string, files: ManifestEntry[]): Promise<void> {
  const manifest: Manifest = {
    schemaVersion: 1,
    repo: REPO_ROOT,
    installedAt: new Date().toISOString(),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await writeFileEnsured(path.join(home, MANIFEST_RELATIVE_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function desiredFiles(): Promise<Array<{ source: string; relativeDest: string; sha256: string }>> {
  const result: Array<{ source: string; relativeDest: string; sha256: string }> = [];

  const skillsRoot = path.join(GENERATED_CODEX_DIR, "skills");
  for (const source of await listFiles(skillsRoot)) {
    const relative = path.relative(skillsRoot, source);
    result.push({
      source,
      relativeDest: toManifestPath(path.join(SKILL_DEST_PREFIX, relative)),
      sha256: sha256(await fs.readFile(source)),
    });
  }

  const agentsRoot = path.join(GENERATED_CODEX_DIR, "agents");
  for (const source of await listFiles(agentsRoot)) {
    const relative = path.relative(agentsRoot, source);
    result.push({
      source,
      relativeDest: toManifestPath(path.join(AGENT_DEST_PREFIX, relative)),
      sha256: sha256(await fs.readFile(source)),
    });
  }

  return result.sort((a, b) => a.relativeDest.localeCompare(b.relativeDest));
}

async function removeIfOwned(home: string, entry: ManifestEntry): Promise<boolean> {
  const target = path.join(home, fromManifestPath(entry.path));
  const currentHash = await fileSha256(target);
  if (!currentHash) return true;
  if (currentHash !== entry.sha256) {
    console.warn(`Skipping modified managed file: ${target}`);
    return false;
  }
  await fs.rm(target);
  return true;
}

async function pruneEmptyParents(home: string, relativeFile: string): Promise<void> {
  const stopDirs = new Set([home, path.join(home, "skills")]);

  let current = path.dirname(path.join(home, fromManifestPath(relativeFile)));
  while (!stopDirs.has(current) && current.startsWith(home)) {
    try {
      await fs.rmdir(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

async function install(): Promise<void> {
  const home = codexHome();
  if (!(await pathExists(GENERATED_CODEX_DIR))) {
    throw new Error(`Missing generated Codex directory: ${GENERATED_CODEX_DIR}. Run pnpm run generate first.`);
  }

  const previous = await readManifest(home);
  const previousByPath = new Map((previous?.files || []).map((entry) => [entry.path, entry]));
  const desired = await desiredFiles();
  const desiredPaths = new Set(desired.map((file) => file.relativeDest));

  for (const entry of previous?.files || []) {
    if (desiredPaths.has(entry.path)) continue;
    if (await removeIfOwned(home, entry)) await pruneEmptyParents(home, entry.path);
  }

  const installed: ManifestEntry[] = [];
  for (const file of desired) {
    const target = path.join(home, fromManifestPath(file.relativeDest));
    const currentHash = await fileSha256(target);
    const previousEntry = previousByPath.get(file.relativeDest);

    if (currentHash && currentHash !== file.sha256 && currentHash !== previousEntry?.sha256) {
      throw new Error(`Refusing to overwrite unmanaged or modified file: ${target}`);
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(file.source, target);
    installed.push({ path: file.relativeDest, sha256: file.sha256 });
  }

  await writeManifest(home, installed);
  console.log(`Installed ${installed.length} Codex file(s) into ${home}`);
}

async function clear(): Promise<void> {
  const home = codexHome();
  const previous = await readManifest(home);
  if (!previous) {
    console.log(`No coding-harness-config Codex install manifest found in ${home}`);
    return;
  }

  let removed = 0;
  let skipped = 0;
  for (const entry of previous.files) {
    if (await removeIfOwned(home, entry)) {
      removed += 1;
      await pruneEmptyParents(home, entry.path);
    } else {
      skipped += 1;
    }
  }

  if (skipped === 0) {
    await fs.rm(path.join(home, MANIFEST_RELATIVE_PATH), { force: true });
    await pruneEmptyParents(home, MANIFEST_RELATIVE_PATH);
  }

  console.log(`Removed ${removed} Codex file(s) from ${home}${skipped ? `; skipped ${skipped} modified file(s)` : ""}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "install") return install();
  if (command === "clear") return clear();
  throw new Error("Usage: tsx generator/codex-install.ts install | clear");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
