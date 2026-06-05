import * as fs from "node:fs/promises";
import * as path from "node:path";

const SKIP_NAMES = new Set(["node_modules", ".DS_Store"]);
const SKIP_EXTENSIONS = new Set([".log"]);

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function resetDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

function shouldSkip(name: string): boolean {
  return SKIP_NAMES.has(name) || SKIP_EXTENSIONS.has(path.extname(name));
}

export async function copyDir(src: string, dest: string): Promise<void> {
  if (!(await pathExists(src))) return;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldSkip(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else if (entry.isFile()) {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    }
  }
}

export async function writeFileEnsured(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

export async function listFiles(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const result: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldSkip(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) result.push(full);
    }
  }
  await walk(dir);
  return result.sort();
}
