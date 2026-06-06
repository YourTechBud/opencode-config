import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { getAgentSearchDirs } from "./settings.ts";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AgentDefinition {
	name: string;
	description: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	body: string;
	filePath: string;
}

interface AgentFrontmatter {
	name?: unknown;
	description?: unknown;
	model?: unknown;
	thinkingLevel?: unknown;
	thinking?: unknown;
}

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

function isValidName(name: string): boolean {
	return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name);
}

function parseAgentFile(filePath: string): AgentDefinition | undefined {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const parsed = parseFrontmatter<AgentFrontmatter>(content);
		const fm = parsed.frontmatter;
		if (typeof fm.name !== "string" || typeof fm.description !== "string") return undefined;
		const name = fm.name.trim();
		const description = fm.description.trim();
		if (!name || !description || !isValidName(name)) return undefined;

		const rawThinking = typeof fm.thinkingLevel === "string" ? fm.thinkingLevel : fm.thinking;
		const thinkingLevel = typeof rawThinking === "string" && THINKING_LEVELS.has(rawThinking) ? (rawThinking as ThinkingLevel) : undefined;

		return {
			name,
			description,
			model: typeof fm.model === "string" && fm.model.trim() ? fm.model.trim() : undefined,
			thinkingLevel,
			body: parsed.body.trim(),
			filePath,
		};
	} catch {
		return undefined;
	}
}

export function discoverAgents(cwd: string): AgentDefinition[] {
	const byName = new Map<string, AgentDefinition>();
	for (const dir of getAgentSearchDirs(cwd)) {
		if (!fs.existsSync(dir)) continue;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
			const agent = parseAgentFile(path.join(dir, entry.name));
			if (!agent || byName.has(agent.name)) continue;
			byName.set(agent.name, agent);
		}
	}
	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function formatAgentsForPrompt(agents: AgentDefinition[]): string {
	if (agents.length === 0) return "";
	const escapeXml = (value: string) =>
		value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

	const lines = [
		"",
		"The following sub-agents are available for focused delegation.",
		"You may delegate focused, self-contained work to a sub-agent when one of the available agent descriptions is a strong match.",
		"Do not delegate simple file reads, narrow searches, or tasks you can complete directly with available tools.",
		"A sub-agent starts with isolated context, so provide a complete task prompt. If several independent subtasks would benefit from delegation, you may run multiple sub-agent tasks in parallel.",
		"",
		"<available_agents>",
	];

	for (const agent of agents) {
		lines.push("  <agent>");
		lines.push(`    <name>${escapeXml(agent.name)}</name>`);
		lines.push(`    <description>${escapeXml(agent.description)}</description>`);
		lines.push(`    <location>${escapeXml(agent.filePath)}</location>`);
		lines.push("  </agent>");
	}
	lines.push("</available_agents>");
	return lines.join("\n");
}
