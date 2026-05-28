import type { ExtensionAPI, SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, type AutocompleteItem } from "@earendil-works/pi-tui";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

interface SkillCommand {
	name: string;
	filePath: string;
	baseDir: string;
	description?: string;
}

interface StackableSkillReference {
	name: string;
	path: string;
}

interface StackableSkillsMetadata {
	v: 1;
	skills: StackableSkillReference[];
}

const SKILL_TOKEN_PATTERN = /(^|\s+)\/skill:([^\s]+)/g;
const SKILL_AUTOCOMPLETE_PATTERN = /(?:^|\s)(\/skill:([^\s]*))$/;
const STACKABLE_CONTEXT_PATTERN = /^\[stackable-skills-context\]:\s*#\s*"([^"]+)"\s*$/m;
const SKILLS_APPLIED_PATTERN = /^\*\*Skills applied:\*\*[^\n]*(?:\n\s*)?/;

function stripFrontmatter(content: string): string {
	const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	if (!normalized.startsWith("---")) return normalized;

	const endIndex = normalized.indexOf("\n---", 3);
	if (endIndex === -1) return normalized;

	return normalized.slice(endIndex + 4).trim();
}

function encodeBase64Url(value: string): string {
	return Buffer.from(value, "utf-8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	return Buffer.from(padded, "base64").toString("utf-8");
}

function encodeMetadata(metadata: StackableSkillsMetadata): string {
	return encodeBase64Url(JSON.stringify(metadata));
}

function decodeMetadata(encoded: string): StackableSkillsMetadata | null {
	try {
		const parsed = JSON.parse(decodeBase64Url(encoded));
		if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.skills)) return null;

		const skills = parsed.skills
			.map((skill: unknown) => {
				if (!skill || typeof skill !== "object") return null;
				const value = skill as { name?: unknown; path?: unknown };
				if (typeof value.name !== "string" || typeof value.path !== "string") return null;
				return { name: value.name, path: value.path };
			})
			.filter((skill): skill is StackableSkillReference => skill !== null);

		if (skills.length === 0) return null;
		return { v: 1, skills };
	} catch {
		return null;
	}
}

function escapeXmlAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function getSkillCommands(pi: ExtensionAPI): SkillCommand[] {
	return pi
		.getCommands()
		.filter((command): command is SlashCommandInfo & { name: `skill:${string}` } =>
			command.source === "skill" && command.name.startsWith("skill:"),
		)
		.map((command) => {
			const filePath = command.sourceInfo.path;
			return {
				name: command.name.slice("skill:".length),
				filePath,
				baseDir: command.sourceInfo.baseDir ?? dirname(filePath),
				description: command.description,
			};
		});
}

function parseSkillTokens(text: string): { names: string[]; remainingText: string } {
	const names: string[] = [];
	const seen = new Set<string>();

	const remainingText = text
		.replace(SKILL_TOKEN_PATTERN, (_fullMatch: string, leadingWhitespace: string, name: string) => {
			if (!seen.has(name)) {
				seen.add(name);
				names.push(name);
			}

			// Preserve one separating whitespace character when a token was between words.
			return leadingWhitespace.length > 0 ? " " : "";
		})
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n[ \t]+/g, "\n")
		.replace(/[ \t]{2,}/g, " ")
		.trim();

	return { names, remainingText };
}

function parseStackableSkillsContext(text: string): { metadata: StackableSkillsMetadata; userPrompt: string } | null {
	const match = text.match(STACKABLE_CONTEXT_PATTERN);
	if (!match) return null;

	const metadata = decodeMetadata(match[1] ?? "");
	if (!metadata) return null;

	const userPrompt = text
		.replace(match[0], "")
		.trimStart()
		.replace(SKILLS_APPLIED_PATTERN, "")
		.trimStart();

	return { metadata, userPrompt };
}

function buildVisibleMessage(skills: SkillCommand[], userPrompt: string): string {
	const metadata: StackableSkillsMetadata = {
		v: 1,
		skills: skills.map((skill) => ({ name: skill.name, path: skill.filePath })),
	};
	const marker = `[stackable-skills-context]: # "${encodeMetadata(metadata)}"`;
	const skillList = skills.map((skill) => `\`${skill.name}\``).join(", ");
	return `${marker}\n\n**Skills applied:** ${skillList}\n\n${userPrompt}`;
}

async function readSkillBlock(skill: { name: string; filePath: string; baseDir: string }): Promise<string> {
	const content = await readFile(skill.filePath, "utf-8");
	const body = stripFrontmatter(content).trim();
	return `<skill name="${escapeXmlAttr(skill.name)}" location="${escapeXmlAttr(skill.filePath)}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

function missingSkillBlock(reference: StackableSkillReference): string {
	return `<missing-skill name="${escapeXmlAttr(reference.name)}" location="${escapeXmlAttr(reference.path)}">\nThis skill was referenced by this message but could not be loaded from its stored path or by its current name.\n</missing-skill>`;
}

async function expandSkillReference(reference: StackableSkillReference, skillsByName: Map<string, SkillCommand>): Promise<string> {
	try {
		return await readSkillBlock({ name: reference.name, filePath: reference.path, baseDir: dirname(reference.path) });
	} catch {
		const currentSkill = skillsByName.get(reference.name);
		if (!currentSkill) return missingSkillBlock(reference);

		try {
			return await readSkillBlock(currentSkill);
		} catch {
			return missingSkillBlock(reference);
		}
	}
}

async function expandStackableSkillsContext(text: string, skillsByName: Map<string, SkillCommand>): Promise<string | null> {
	const parsed = parseStackableSkillsContext(text);
	if (!parsed) return null;

	const skillBlocks = await Promise.all(parsed.metadata.skills.map((skill) => expandSkillReference(skill, skillsByName)));
	return `${skillBlocks.join("\n\n")}\n\n${parsed.userPrompt.trim()}`;
}

function restoreEditorText(
	ctx: {
		hasUI: boolean;
		ui: { setEditorText(text: string): void; notify(message: string, type?: "info" | "warning" | "error"): void };
	},
	text: string,
): void {
	if (!ctx.hasUI) return;
	ctx.ui.setEditorText(text);
}

export default function stackableSkillsExtension(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.addAutocompleteProvider((current) => ({
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const currentLine = lines[cursorLine] ?? "";
				const beforeCursor = currentLine.slice(0, cursorCol);
				const match = beforeCursor.match(SKILL_AUTOCOMPLETE_PATTERN);

				if (!match) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				const prefix = match[1] ?? "/skill:";
				const query = match[2] ?? "";
				const skills = getSkillCommands(pi).map((skill) => ({
					name: skill.name,
					value: `/skill:${skill.name}`,
					label: `/skill:${skill.name}`,
					description: skill.description,
				}));

				const filtered = fuzzyFilter(skills, query, (item) => item.name);
				if (filtered.length === 0) return null;

				return {
					prefix,
					items: filtered.map(({ value, label, description }) => ({
						value,
						label,
						...(description ? { description } : {}),
					})),
				};
			},

			applyCompletion(lines, cursorLine, cursorCol, item: AutocompleteItem, prefix) {
				if (!prefix.startsWith("/skill:")) {
					return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
				}

				const currentLine = lines[cursorLine] ?? "";
				const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
				const afterCursor = currentLine.slice(cursorCol);
				const needsSpace = afterCursor.length === 0 || !/^\s/.test(afterCursor);
				const newLine = `${beforePrefix}${item.value}${needsSpace ? " " : ""}${afterCursor}`;
				const newLines = [...lines];
				newLines[cursorLine] = newLine;

				return {
					lines: newLines,
					cursorLine,
					cursorCol: beforePrefix.length + item.value.length + (needsSpace ? 1 : 0),
				};
			},

			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		}));
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };

		const { names, remainingText } = parseSkillTokens(event.text);
		if (names.length === 0) return { action: "continue" };

		const skillsByName = new Map(getSkillCommands(pi).map((skill) => [skill.name, skill]));
		const unknown = names.filter((name) => !skillsByName.has(name));
		if (unknown.length > 0) {
			restoreEditorText(ctx, event.text);
			ctx.ui.notify(`Unknown skill${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`, "error");
			return { action: "handled" };
		}

		if (!remainingText) {
			restoreEditorText(ctx, event.text);
			ctx.ui.notify("Add a user prompt after the /skill:... token(s).", "error");
			return { action: "handled" };
		}

		const skills = names.map((name) => skillsByName.get(name)!);
		return {
			action: "transform",
			text: buildVisibleMessage(skills, remainingText),
		};
	});

	pi.on("context", async (event) => {
		const skillsByName = new Map(getSkillCommands(pi).map((skill) => [skill.name, skill]));
		let changed = false;
		const messages = [];

		for (const message of event.messages) {
			if (message.role !== "user") {
				messages.push(message);
				continue;
			}

			if (typeof message.content === "string") {
				const expanded = await expandStackableSkillsContext(message.content, skillsByName);
				if (expanded) {
					changed = true;
					messages.push({ ...message, content: expanded });
				} else {
					messages.push(message);
				}
				continue;
			}

			let replaced = false;
			const content = [];
			for (const part of message.content) {
				if (!replaced && part.type === "text") {
					const expanded = await expandStackableSkillsContext(part.text, skillsByName);
					if (expanded) {
						replaced = true;
						changed = true;
						content.push({ ...part, text: expanded });
						continue;
					}
				}
				content.push(part);
			}

			messages.push(replaced ? { ...message, content } : message);
		}

		return changed ? { messages } : undefined;
	});
}
