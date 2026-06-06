import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import type { ChildAgentConfig, MultiAgentConfig, MultiAgentSettings, ThinkingLevel } from "./types.ts";
import { getMultiAgentBaseDir, toKebabCase } from "./paths.ts";

const DEFAULT_SETTINGS: MultiAgentSettings = {
	defaults: {
		model: "openai-codex/gpt-5.5",
		thinkingLevel: "high",
		tools: ["read", "bash"],
	},
	childAgents: {
		cwd: "inherit",
	},
};

const DEFAULT_BRAINSTORMING = `---
id: brainstorming
displayName: Brainstorming Agent
labels: [driver, brainstorming]
skillCommands:
  - /skill:brainstorming
tools: [read, bash]
thinkingLevel: high
---

You are the exploration driver for multi-agent deliberation.

Use tools to inspect and understand the repo, git state, docs, history, and relevant context.
Do not intentionally modify files or implement changes.

Ask clarifying questions. Push back on weak assumptions. Help the system reach shared understanding before implementation planning.
`;

const DEFAULT_PRODUCT = `---
id: product
displayName: Product Steward
labels: [steward, product, ux]
skillCommands:
  - /skill:brainstorming
tools: [read, bash]
thinkingLevel: high
---

You answer from the product, UX, and end-user perspective.

Own product-shape, user workflow, acceptance-criteria, and experience-quality questions. You may propose product answers when they are useful, but clearly label assumptions and concerns.

The user's mental model is bounded by what the rendered UI actually surfaces. Do not assume the user knows about internal concepts, abstractions, code paths, config keys, or error states unless those are visibly exposed in the product. Docs and code describe how the system is built; only the rendered UI describes what the user is exposed to. When weighing decisions, optimize for reducing the user's burden — make the product easy to understand, predict, and use without needing to read docs or code.

You may comment on technical decisions when they affect UX or product behavior.
Do not intentionally modify files or implement changes.
`;

const DEFAULT_ENGINEERING = `---
id: engineering
displayName: Engineering Steward
labels: [steward, engineering]
skillCommands:
  - /skill:brainstorming
tools: [read, bash]
thinkingLevel: high
---

You answer from the software engineering perspective — architecture, design, security, implementation, and delivery.

Own technical shape, codebase fit, system boundaries, security posture, risk, sequencing, validation, and maintainability questions. You may propose engineering answers when they are useful, but clearly label assumptions and concerns.

Ground proposals in the actual codebase — its existing patterns, idioms, dependencies, and real constraints — rather than generic best practices. Inspect the repo before prescribing shape. When integration with what's already there is the binding constraint, lead with that instead of proposing greenfield designs.

You may comment on product decisions when they materially affect engineering or delivery risk.
Do not intentionally modify files or implement changes.
`;

export function ensureDefaultConfig(cwd: string): void {
	const baseDir = getMultiAgentBaseDir(cwd);
	const childDir = join(baseDir, "child-agents");
	mkdirSync(childDir, { recursive: true });

	const settingsPath = join(baseDir, "settings.json");
	if (!existsSync(settingsPath)) {
		writeFileSync(settingsPath, `${JSON.stringify(DEFAULT_SETTINGS, null, "\t")}\n`, "utf8");
	}

	const defaults: Array<[string, string]> = [
		[join(childDir, "brainstorming.md"), DEFAULT_BRAINSTORMING],
		[join(childDir, "product.md"), DEFAULT_PRODUCT],
		[join(childDir, "engineering.md"), DEFAULT_ENGINEERING],
	];

	for (const [path, content] of defaults) {
		if (!existsSync(path)) writeFileSync(path, content, "utf8");
	}
}

function asStringArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).filter(Boolean);
	if (typeof value === "string" && value.trim()) return [value.trim()];
	return [];
}

function asThinkingLevel(value: unknown): ThinkingLevel | undefined {
	const levels = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
	return typeof value === "string" && levels.has(value) ? (value as ThinkingLevel) : undefined;
}

function readSettings(baseDir: string): MultiAgentSettings {
	const path = join(baseDir, "settings.json");
	if (!existsSync(path)) return DEFAULT_SETTINGS;
	const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<MultiAgentSettings>;
	return {
		defaults: {
			...DEFAULT_SETTINGS.defaults,
			...(parsed.defaults ?? {}),
			thinkingLevel: asThinkingLevel(parsed.defaults?.thinkingLevel) ?? DEFAULT_SETTINGS.defaults.thinkingLevel,
			tools: parsed.defaults?.tools ?? DEFAULT_SETTINGS.defaults.tools,
		},
		childAgents: {
			...DEFAULT_SETTINGS.childAgents,
			...(parsed.childAgents ?? {}),
		},
	};
}

function readChildAgent(filePath: string, settings: MultiAgentSettings): ChildAgentConfig {
	const raw = readFileSync(filePath, "utf8");
	const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(raw);
	const id = typeof frontmatter.id === "string" ? frontmatter.id : toKebabCase(basename(filePath, ".md"));
	return {
		id,
		displayName: typeof frontmatter.displayName === "string" ? frontmatter.displayName : id,
		labels: asStringArray(frontmatter.labels),
		skillCommands: asStringArray(frontmatter.skillCommands),
		tools: asStringArray(frontmatter.tools).length > 0 ? asStringArray(frontmatter.tools) : settings.defaults.tools,
		model: typeof frontmatter.model === "string" ? frontmatter.model : settings.defaults.model,
		thinkingLevel: asThinkingLevel(frontmatter.thinkingLevel) ?? settings.defaults.thinkingLevel,
		filePath,
		body,
	};
}

function readOrchestratorRules(baseDir: string): string | undefined {
	const path = join(baseDir, "orchestrator-rules.md");
	if (!existsSync(path)) return undefined;
	const raw = readFileSync(path, "utf8");
	const { body } = parseFrontmatter<Record<string, unknown>>(raw);
	const rules = body.trim();
	return rules || undefined;
}

export function loadMultiAgentConfig(cwd: string): MultiAgentConfig {
	ensureDefaultConfig(cwd);
	const baseDir = getMultiAgentBaseDir(cwd);
	const settings = readSettings(baseDir);
	const childDir = join(baseDir, "child-agents");

	const childAgents = readdirSync(childDir)
		.filter((name) => name.endsWith(".md"))
		.sort()
		.map((name) => readChildAgent(join(childDir, name), settings));

	const orchestratorRules = readOrchestratorRules(baseDir);

	return { settings, childAgents, orchestratorRules };
}

export function findChildAgent(config: MultiAgentConfig, id: string): ChildAgentConfig | undefined {
	return config.childAgents.find((agent) => agent.id === id);
}

export function findDriverAgent(config: MultiAgentConfig): ChildAgentConfig | undefined {
	return config.childAgents.find((agent) => agent.labels.includes("driver"));
}
