import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

const CONTEXT_FILE_CANDIDATES = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"] as const;
const DETAILS_KEY = "hierarchicalAgentsContext";

interface LazyContextDetails {
	loaded?: string[];
}

function normalizePath(filePath: string): string {
	return path.resolve(filePath);
}

function normalizeReadPath(rawPath: unknown, cwd: string): string | undefined {
	if (typeof rawPath !== "string" || rawPath.trim().length === 0) return undefined;
	const withoutAt = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;
	return path.isAbsolute(withoutAt) ? normalizePath(withoutAt) : normalizePath(path.resolve(cwd, withoutAt));
}

function isWithinOrEqual(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function findContextFileInDir(dir: string): string | undefined {
	for (const fileName of CONTEXT_FILE_CANDIDATES) {
		const candidate = path.join(dir, fileName);
		if (fs.existsSync(candidate)) return normalizePath(candidate);
	}
	return undefined;
}

function isContextFile(filePath: string): boolean {
	return CONTEXT_FILE_CANDIDATES.includes(path.basename(filePath) as (typeof CONTEXT_FILE_CANDIDATES)[number]);
}

function collectContextFilesForRead(filePath: string, cwd: string): string[] {
	const root = normalizePath(cwd);
	const target = normalizePath(filePath);
	let current = path.dirname(target);
	const discovered: string[] = [];

	if (!isWithinOrEqual(root, current)) return discovered;

	while (isWithinOrEqual(root, current)) {
		const contextFile = findContextFileInDir(current);
		if (contextFile && contextFile !== target) {
			discovered.push(contextFile);
		}

		if (current === root) break;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	return discovered.reverse();
}

function escapeXmlAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function formatProjectContext(files: Array<{ path: string; content: string }>): string {
	const instructions = files
		.map(
			(file) =>
				`<project_instructions path="${escapeXmlAttribute(file.path)}">\n${file.content}\n</project_instructions>`,
		)
		.join("\n\n");

	return [
		"<system_reminder>",
		"Additional project context was discovered based on the file that was just read.",
		"",
		"<project_context>",
		"",
		"Project-specific instructions and guidelines:",
		"",
		instructions,
		"",
		"</project_context>",
		"</system_reminder>",
	].join("\n");
}

function getTextFromContentPart(part: unknown): string | undefined {
	if (!part || typeof part !== "object") return undefined;
	const candidate = part as { type?: unknown; text?: unknown };
	return candidate.type === "text" && typeof candidate.text === "string" ? candidate.text : undefined;
}

function appendTextToToolContent(content: unknown, textToAppend: string): unknown[] {
	const contentParts = Array.isArray(content) ? [...content] : [];

	for (let index = contentParts.length - 1; index >= 0; index--) {
		const text = getTextFromContentPart(contentParts[index]);
		if (text === undefined) continue;
		contentParts[index] = {
			...(contentParts[index] as object),
			text: `${text}\n\n${textToAppend}`,
		};
		return contentParts;
	}

	contentParts.push({ type: "text", text: textToAppend });
	return contentParts;
}

function getLazyLoadedFromDetails(details: unknown): string[] {
	if (!details || typeof details !== "object") return [];
	const nested = (details as Record<string, unknown>)[DETAILS_KEY] as LazyContextDetails | undefined;
	if (!nested || !Array.isArray(nested.loaded)) return [];
	return nested.loaded.filter((item): item is string => typeof item === "string").map(normalizePath);
}

function collectLoadedFromBranch(ctx: ExtensionContext): Set<string> {
	const loaded = new Set<string>();
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message") continue;
		const message = entry.message as { role?: string; toolName?: string; details?: unknown };
		if (message.role !== "toolResult" || message.toolName !== "read") continue;
		for (const filePath of getLazyLoadedFromDetails(message.details)) {
			loaded.add(filePath);
		}
	}
	return loaded;
}

function readContextFiles(filePaths: string[]): Array<{ path: string; content: string }> {
	const files: Array<{ path: string; content: string }> = [];
	for (const filePath of filePaths) {
		try {
			files.push({ path: filePath, content: fs.readFileSync(filePath, "utf-8") });
		} catch {
			// Ignore unreadable context files so a normal read result is not broken by this extension.
		}
	}
	return files;
}

export default function hierarchicalAgentsContextExtension(pi: ExtensionAPI) {
	let startupContextFiles = new Set<string>();
	let pendingContextFiles = new Set<string>();

	pi.on("session_start", () => {
		startupContextFiles = new Set<string>();
		pendingContextFiles = new Set<string>();
	});

	pi.on("session_tree", () => {
		pendingContextFiles = new Set<string>();
	});

	pi.on("before_agent_start", (event) => {
		for (const file of event.systemPromptOptions.contextFiles ?? []) {
			startupContextFiles.add(normalizePath(file.path));
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "read" || event.isError) return;

		const readPath = normalizeReadPath((event.input as { path?: unknown } | undefined)?.path, ctx.cwd);
		if (!readPath) return;

		const alreadyLoaded = collectLoadedFromBranch(ctx);
		for (const filePath of startupContextFiles) alreadyLoaded.add(filePath);
		for (const filePath of pendingContextFiles) alreadyLoaded.add(filePath);

		const candidates = collectContextFilesForRead(readPath, ctx.cwd).filter((filePath) => {
			if (alreadyLoaded.has(filePath)) return false;
			// When reading a context file directly, do not echo that same file back as lazy context.
			if (isContextFile(readPath) && filePath === readPath) return false;
			return true;
		});

		if (candidates.length === 0) return;

		for (const filePath of candidates) pendingContextFiles.add(filePath);
		const files = readContextFiles(candidates);
		if (files.length === 0) return;

		const loaded = files.map((file) => file.path);
		const systemReminder = formatProjectContext(files);
		return {
			content: appendTextToToolContent(event.content, systemReminder),
			details: {
				...(event.details && typeof event.details === "object" ? event.details : {}),
				[DETAILS_KEY]: { loaded },
			},
		};
	});
}
