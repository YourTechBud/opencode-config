import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { RunPaths } from "./types.ts";

export function getMultiAgentBaseDir(cwd: string): string {
	return join(cwd, ".pi", "multi-agent");
}

export function getRuntimeBaseDir(cwd: string): string {
	return join(cwd, "scratch", "multi-agent-run");
}

export function getRunJsonPath(cwd: string): string {
	return join(getRuntimeBaseDir(cwd), "run.json");
}

export function hasExistingRuntimeRun(cwd: string): boolean {
	return existsSync(getRunJsonPath(cwd));
}

export function toKebabCase(input: string): string {
	const cleaned = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
	return cleaned.slice(0, 64) || "deliberation";
}

export function createUniqueTaskId(_cwd: string, task: string): string {
	return toKebabCase(task);
}

export function createRunPaths(cwd: string, _taskId: string): RunPaths {
	const baseDir = getRuntimeBaseDir(cwd);
	const runsDir = baseDir;
	const runDir = baseDir;
	const ipcDir = join(runDir, "ipc");
	const registryDir = join(ipcDir, "registry");
	const inboxDir = join(ipcDir, "inbox");
	const responseDir = join(ipcDir, "responses");
	const lockDir = join(ipcDir, "locks");
	const traceDir = join(runDir, "trace");
	const traceEventDir = join(traceDir, "events");
	const traceHtmlDir = join(traceDir, "html");
	const artifactDir = join(runDir, "artifacts");
	const messageLogPath = join(runDir, "agent-messages.jsonl");

	for (const dir of [
		baseDir,
		ipcDir,
		registryDir,
		inboxDir,
		responseDir,
		lockDir,
		traceDir,
		traceEventDir,
		traceHtmlDir,
		artifactDir,
	]) {
		mkdirSync(dir, { recursive: true });
	}

	return {
		baseDir,
		runsDir,
		runDir,
		ipcDir,
		registryDir,
		inboxDir,
		responseDir,
		lockDir,
		traceDir,
		traceEventDir,
		traceHtmlDir,
		artifactDir,
		messageLogPath,
	};
}
