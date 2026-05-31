import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

const CHECKPOINT_ENTRY_TYPE = "pi-undo.checkpoint";
const DEFAULT_TIMEOUT_MS = 120_000;
const SNAPSHOT_PRUNE_AGE = "7.days";
const SNAPSHOT_GC_INTERVAL_MS = 60 * 60 * 1000;
const SNAPSHOT_GC_INITIAL_DELAY_MS = 60 * 1000;

interface Checkpoint {
	version: 1;
	cwd: string;
	gitRoot: string;
	userEntryId: string;
	beforeCommit: string;
	afterCommit: string;
	changedFiles: string[];
	sessionFile?: string;
	createdAt: number;
}

interface ActiveTurn {
	cwd: string;
	gitRoot: string;
	userEntryId: string;
	beforeCommit: string;
	sessionFile?: string;
}

interface CommandResult {
	stdout: string;
	stderr: string;
	code: number | null;
}

interface SnapshotStore {
	gitRoot: string;
	gitDir: string;
}

const checkpoints = new Map<string, Checkpoint>();
let activeTurn: ActiveTurn | undefined;
let initializedStores = new Set<string>();
let gcInterval: ReturnType<typeof setInterval> | undefined;
let gcInitialTimeout: ReturnType<typeof setTimeout> | undefined;
const snapshotWarningShown = new Set<string>();

function stateRoot(): string {
	return join(homedir(), ".pi", "agent", "extension-state", "undo");
}

function projectHash(gitRoot: string): string {
	return createHash("sha256").update(resolve(gitRoot)).digest("hex").slice(0, 24);
}

function snapshotStoreFor(gitRoot: string): SnapshotStore {
	return {
		gitRoot,
		gitDir: join(stateRoot(), "snapshots", projectHash(gitRoot) + ".git"),
	};
}

function archiveDir(): string {
	return join(stateRoot(), "archived-sessions");
}

function isInside(parent: string, child: string): boolean {
	const p = resolve(parent);
	const c = resolve(child);
	return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

function splitNul(output: string): string[] {
	return output.split("\0").map((item) => item.trim()).filter(Boolean);
}

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<CommandResult> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
			signal: options.signal,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let settled = false;
		const timeout = setTimeout(() => {
			child.kill("SIGTERM");
		}, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.stderr.on("data", (chunk) => { stderr += chunk; });
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(error);
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolvePromise({ stdout, stderr, code });
		});
	});
}

async function runRequired(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<CommandResult> {
	const result = await run(command, args, options);
	if (result.code !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed (${result.code ?? "signal"}): ${result.stderr || result.stdout}`.trim());
	}
	return result;
}

async function git(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<CommandResult> {
	return runRequired("git", args, options);
}

async function findGitRoot(cwd: string): Promise<string> {
	const result = await git(["-C", cwd, "rev-parse", "--show-toplevel"]);
	return result.stdout.trim();
}

async function ensureSnapshotStore(store: SnapshotStore): Promise<void> {
	if (initializedStores.has(store.gitDir) && existsSync(store.gitDir)) return;
	await mkdir(dirname(store.gitDir), { recursive: true });
	if (!existsSync(store.gitDir)) {
		await git(["init", "--bare", store.gitDir]);
	}
	await git(["--git-dir", store.gitDir, "config", "core.autocrlf", "false"]);
	await git(["--git-dir", store.gitDir, "config", "core.longpaths", "true"]);
	await git(["--git-dir", store.gitDir, "config", "core.symlinks", "true"]);
	await git(["--git-dir", store.gitDir, "config", "core.fsmonitor", "false"]);
	initializedStores.add(store.gitDir);
}

function snapshotGitArgs(store: SnapshotStore, args: string[]): string[] {
	return ["--git-dir", store.gitDir, "--work-tree", store.gitRoot, ...args];
}

async function trackSnapshot(gitRoot: string, signal?: AbortSignal): Promise<string> {
	const store = snapshotStoreFor(gitRoot);
	await ensureSnapshotStore(store);

	// Pathspec exclusion prevents the hidden snapshot repo from trying to index the project's real .git directory.
	await git(snapshotGitArgs(store, ["add", "-A", "--", ".", ":(exclude).git"]), { cwd: gitRoot, signal, timeoutMs: 300_000 });
	const tree = (await git(snapshotGitArgs(store, ["write-tree"]), { cwd: gitRoot, signal })).stdout.trim();
	const now = new Date().toISOString();
	const commit = (await git(snapshotGitArgs(store, ["commit-tree", tree, "-m", `pi undo snapshot ${now}`]), {
		cwd: gitRoot,
		signal,
		env: {
			GIT_AUTHOR_NAME: "pi-undo",
			GIT_AUTHOR_EMAIL: "pi-undo@local",
			GIT_AUTHOR_DATE: now,
			GIT_COMMITTER_NAME: "pi-undo",
			GIT_COMMITTER_EMAIL: "pi-undo@local",
			GIT_COMMITTER_DATE: now,
		},
	})).stdout.trim();
	return commit;
}

async function diffFiles(gitRoot: string, fromCommit: string, toCommit: string, signal?: AbortSignal): Promise<string[]> {
	const store = snapshotStoreFor(gitRoot);
	await ensureSnapshotStore(store);
	const result = await git(snapshotGitArgs(store, ["diff", "--name-only", "-z", fromCommit, toCommit, "--", "."]), { cwd: gitRoot, signal });
	return splitNul(result.stdout).sort();
}

async function snapshotCommitExists(gitRoot: string, commit: string, signal?: AbortSignal): Promise<boolean> {
	const store = snapshotStoreFor(gitRoot);
	if (!existsSync(store.gitDir)) return false;
	const result = await run("git", snapshotGitArgs(store, ["cat-file", "-e", `${commit}^{commit}`]), {
		cwd: gitRoot,
		signal,
	});
	return result.code === 0;
}

async function missingCheckpointSnapshots(checkpoint: Checkpoint): Promise<string[]> {
	const missing: string[] = [];
	if (!(await snapshotCommitExists(checkpoint.gitRoot, checkpoint.beforeCommit))) missing.push("before");
	if (!(await snapshotCommitExists(checkpoint.gitRoot, checkpoint.afterCommit))) missing.push("after");
	return missing;
}

async function pathExistsInSnapshot(gitRoot: string, commit: string, relativePath: string, signal?: AbortSignal): Promise<boolean> {
	const store = snapshotStoreFor(gitRoot);
	const result = await run("git", snapshotGitArgs(store, ["cat-file", "-e", `${commit}:${relativePath}`]), {
		cwd: gitRoot,
		signal,
	});
	return result.code === 0;
}

async function restoreFiles(gitRoot: string, commit: string, files: string[], signal?: AbortSignal): Promise<void> {
	const store = snapshotStoreFor(gitRoot);
	await ensureSnapshotStore(store);
	if (!(await snapshotCommitExists(gitRoot, commit, signal))) {
		throw new Error(`Snapshot ${commit.slice(0, 12)} is no longer available.`);
	}
	const existing: string[] = [];
	const deleted: string[] = [];

	for (const file of files) {
		if (!file || file.includes("\0")) continue;
		const absolute = resolve(gitRoot, file);
		if (!isInside(gitRoot, absolute)) throw new Error(`Refusing to restore path outside repository: ${file}`);
		if (await pathExistsInSnapshot(gitRoot, commit, file, signal)) existing.push(file);
		else deleted.push(file);
	}

	for (let i = 0; i < existing.length; i += 100) {
		const batch = existing.slice(i, i + 100);
		await git(snapshotGitArgs(store, ["checkout", commit, "--", ...batch]), { cwd: gitRoot, signal, timeoutMs: 300_000 });
	}

	for (const file of deleted) {
		const absolute = resolve(gitRoot, file);
		await rm(absolute, { force: true });
		await removeEmptyParents(dirname(absolute), gitRoot);
	}
}

async function removeEmptyParents(startDir: string, stopDir: string): Promise<void> {
	let current = resolve(startDir);
	const stop = resolve(stopDir);
	while (isInside(stop, current) && current !== stop) {
		try {
			await rm(current, { recursive: false });
		} catch {
			return;
		}
		current = dirname(current);
	}
}

function getEntryMessageRole(entry: SessionEntry): string | undefined {
	return entry.type === "message" ? entry.message.role : undefined;
}

function findLastUserEntry(entries: readonly SessionEntry[]): SessionEntry | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry && getEntryMessageRole(entry) === "user") return entry;
	}
	return undefined;
}

function extractUserText(entry: SessionEntry): string {
	if (entry.type !== "message" || entry.message.role !== "user") return "";
	const content = entry.message.content;
	if (typeof content === "string") return content;
	return content.filter((item) => item.type === "text").map((item) => item.text).join("");
}

function isCheckpoint(value: unknown): value is Checkpoint {
	if (!value || typeof value !== "object") return false;
	const item = value as Partial<Checkpoint>;
	return item.version === 1 &&
		typeof item.cwd === "string" &&
		typeof item.gitRoot === "string" &&
		typeof item.userEntryId === "string" &&
		typeof item.beforeCommit === "string" &&
		typeof item.afterCommit === "string" &&
		Array.isArray(item.changedFiles) &&
		typeof item.createdAt === "number";
}

function restoreCheckpointsFromEntries(entries: readonly SessionEntry[]): void {
	checkpoints.clear();
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== CHECKPOINT_ENTRY_TYPE) continue;
		const data = entry.data;
		if (!isCheckpoint(data)) continue;
		const previous = checkpoints.get(data.userEntryId);
		if (!previous || previous.createdAt <= data.createdAt) checkpoints.set(data.userEntryId, data);
	}
}

async function currentOrStoredCheckpoint(userEntry: SessionEntry): Promise<Checkpoint> {
	if (activeTurn?.userEntryId === userEntry.id) {
		const turn = activeTurn;
		const afterCommit = await trackSnapshot(turn.gitRoot);
		const changedFiles = await diffFiles(turn.gitRoot, turn.beforeCommit, afterCommit);
		return {
			version: 1,
			cwd: turn.cwd,
			gitRoot: turn.gitRoot,
			userEntryId: turn.userEntryId,
			beforeCommit: turn.beforeCommit,
			afterCommit,
			changedFiles,
			sessionFile: turn.sessionFile,
			createdAt: Date.now(),
		};
	}

	const checkpoint = checkpoints.get(userEntry.id);
	if (checkpoint) return checkpoint;

	throw new Error("No filesystem checkpoint found for the last user turn. Only turns created after the /undo extension is loaded can be undone.");
}

async function archiveSessionFile(sessionFile: string | undefined): Promise<string | undefined> {
	if (!sessionFile || !existsSync(sessionFile)) return undefined;
	await mkdir(archiveDir(), { recursive: true });
	const target = join(archiveDir(), `${Date.now()}-${basename(sessionFile)}`);
	await rename(sessionFile, target);
	return target;
}

async function runSnapshotGc(gitRoot: string): Promise<void> {
	const store = snapshotStoreFor(gitRoot);
	if (!existsSync(store.gitDir)) return;
	await git(snapshotGitArgs(store, ["gc", `--prune=${SNAPSHOT_PRUNE_AGE}`]), { cwd: gitRoot, timeoutMs: 300_000 });
}

function stopAutomaticGc(): void {
	if (gcInitialTimeout) clearTimeout(gcInitialTimeout);
	if (gcInterval) clearInterval(gcInterval);
	gcInitialTimeout = undefined;
	gcInterval = undefined;
}

function startAutomaticGc(cwd: string): void {
	stopAutomaticGc();
	const tick = async () => {
		try {
			const gitRoot = await findGitRoot(cwd);
			await runSnapshotGc(gitRoot);
		} catch {
			// Snapshot cleanup is best-effort. Non-Git projects simply have nothing to clean.
		}
	};
	gcInitialTimeout = setTimeout(() => { void tick(); }, SNAPSHOT_GC_INITIAL_DELAY_MS);
	gcInterval = setInterval(() => { void tick(); }, SNAPSHOT_GC_INTERVAL_MS);
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
}

export default function undoExtension(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		activeTurn = undefined;
		restoreCheckpointsFromEntries(ctx.sessionManager.getEntries());
		startAutomaticGc(ctx.cwd);
	});

	pi.on("session_shutdown", () => {
		stopAutomaticGc();
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		try {
			const userEntry = findLastUserEntry(ctx.sessionManager.getBranch());
			if (!userEntry) return;
			const gitRoot = await findGitRoot(ctx.cwd);
			const beforeCommit = await trackSnapshot(gitRoot, ctx.signal);
			activeTurn = {
				cwd: ctx.cwd,
				gitRoot,
				userEntryId: userEntry.id,
				beforeCommit,
				sessionFile: ctx.sessionManager.getSessionFile(),
			};
		} catch (error) {
			activeTurn = undefined;
			if (!snapshotWarningShown.has(ctx.cwd)) {
				snapshotWarningShown.add(ctx.cwd);
				notify(ctx, `/undo snapshots disabled: ${error instanceof Error ? error.message : String(error)}`, "warning");
			}
		}
	});

	pi.on("agent_end", async (_event, ctx) => {
		const turn = activeTurn;
		if (!turn) return;
		activeTurn = undefined;
		try {
			const afterCommit = await trackSnapshot(turn.gitRoot, ctx.signal);
			const changedFiles = await diffFiles(turn.gitRoot, turn.beforeCommit, afterCommit, ctx.signal);
			const checkpoint: Checkpoint = {
				version: 1,
				cwd: turn.cwd,
				gitRoot: turn.gitRoot,
				userEntryId: turn.userEntryId,
				beforeCommit: turn.beforeCommit,
				afterCommit,
				changedFiles,
				sessionFile: turn.sessionFile,
				createdAt: Date.now(),
			};
			checkpoints.set(turn.userEntryId, checkpoint);
			pi.appendEntry(CHECKPOINT_ENTRY_TYPE, checkpoint);
		} catch (error) {
			notify(ctx, `Failed to save /undo checkpoint: ${error instanceof Error ? error.message : String(error)}`, "warning");
		}
	});

	pi.registerCommand("undo", {
		description: "Destructively undo the last user turn and restore touched files",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (!ctx.isIdle()) {
				ctx.abort();
				await ctx.waitForIdle();
			}

			const userEntry = findLastUserEntry(ctx.sessionManager.getBranch());
			if (!userEntry) {
				notify(ctx, "Nothing to undo", "info");
				return;
			}

			const prompt = extractUserText(userEntry);
			const oldSessionFile = ctx.sessionManager.getSessionFile();
			let checkpoint: Checkpoint;
			try {
				checkpoint = await currentOrStoredCheckpoint(userEntry);
			} catch (error) {
				notify(ctx, `/undo requires a Git repository with snapshot support: ${error instanceof Error ? error.message : String(error)}`, "error");
				return;
			}

			const missing = await missingCheckpointSnapshots(checkpoint);
			if (missing.length > 0) {
				notify(
					ctx,
					`Cannot undo: ${missing.join(" and ")} snapshot${missing.length === 1 ? " is" : "s are"} no longer available. No files or session state were changed.`,
					"error",
				);
				return;
			}

			const result = await ctx.fork(userEntry.id, {
				position: "before",
				withSession: async (nextCtx) => {
					try {
						await restoreFiles(checkpoint.gitRoot, checkpoint.beforeCommit, checkpoint.changedFiles);
					} catch (error) {
						nextCtx.ui.notify(
							`Filesystem restore failed; previous session was kept: ${error instanceof Error ? error.message : String(error)}`,
							"error",
						);
						if (prompt) nextCtx.ui.setEditorText(prompt);
						return;
					}

					if (prompt) nextCtx.ui.setEditorText(prompt);
					const archived = await archiveSessionFile(oldSessionFile);
					if (archived) nextCtx.ui.notify(`Undone turn. Previous session archived: ${archived}`, "info");
					else nextCtx.ui.notify("Undone turn.", "info");
				},
			});

			if (result.cancelled) {
				notify(ctx, "Undo cancelled; no files were restored.", "warning");
			}
		},
	});

}
