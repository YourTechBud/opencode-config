import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { ActiveRun, TraceEvent } from "./types.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Event whitelist for HTML rendering. JSONL keeps everything; HTML is the human
// view. Whitelisted events are the ones that carry information not already
// shown by another event (e.g. tool_execution_start/end are redundant with the
// assistant `toolCall` content part + the paired `toolResult` message).
// ─────────────────────────────────────────────────────────────────────────────
const HTML_RENDERED_EVENT_TYPES: ReadonlySet<TraceEvent["type"]> = new Set([
	"system_prompt_snapshot",
	"agent_registered",
	"input_received",
	"ipc_envelope_received",
	"ipc_envelope_sent",
	"message_end",
	"busy_rejected",
	"error",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Escaping & JSON pretty-printing
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function escapeAttr(value: unknown): string {
	return escapeHtml(value);
}

function tintJsonString(jsonText: string): string {
	// Escape first, then wrap recognized JSON tokens with role spans.
	const escaped = jsonText
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	return escaped.replace(
		/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
		(match) => {
			let cls = "j-num";
			if (/^"/.test(match)) cls = /:$/.test(match) ? "j-key" : "j-str";
			else if (match === "true" || match === "false") cls = "j-bool";
			else if (match === "null") cls = "j-null";
			return `<span class="${cls}">${match}</span>`;
		},
	);
}

function prettyJson(value: unknown): string {
	try {
		return tintJsonString(JSON.stringify(value, null, 2));
	} catch {
		return escapeHtml(String(value));
	}
}

/**
 * Render a value that might be JSON-as-string, a plain string, or a structured
 * object. Returns HTML for a `<pre>` body. The caller wraps in `<pre>`.
 */
function renderMaybeJson(value: unknown): string {
	if (value === null || value === undefined) return `<span class="muted">—</span>`;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				const parsed = JSON.parse(trimmed);
				return tintJsonString(JSON.stringify(parsed, null, 2));
			} catch {
				/* fall through to plain text */
			}
		}
		return escapeHtml(value);
	}
	if (typeof value === "object") return prettyJson(value);
	return escapeHtml(String(value));
}

// ─────────────────────────────────────────────────────────────────────────────
// JSONL reading
// ─────────────────────────────────────────────────────────────────────────────
function readJsonl(path: string): TraceEvent[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line) as TraceEvent;
			} catch {
				return { type: "error", timestamp: new Date().toISOString(), runId: "", agentId: "", data: { parseError: true, raw: line } } as TraceEvent;
			}
		});
}

// ─────────────────────────────────────────────────────────────────────────────
// Time formatting
// ─────────────────────────────────────────────────────────────────────────────
function formatTime(iso?: string): string {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	const ss = String(date.getSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Role & event-class mapping
// ─────────────────────────────────────────────────────────────────────────────
type EventClass =
	| "system"
	| "meta"
	| "ipc-in"
	| "ipc-out"
	| "user"
	| "assistant"
	| "tool-result"
	| "error"
	| "busy";

interface RenderedEvent {
	html: string;
	tocItems: TocItem[];
}

interface TocItem {
	id: string;
	label: string;
	cls: EventClass | "tool";
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-event renderers
// ─────────────────────────────────────────────────────────────────────────────
function eventHeader(role: string, time: string, anchor: string, cls: EventClass): string {
	return `<div class="t-meta">
		<span class="t-role">${escapeHtml(role)}</span>
		<span class="t-time">${escapeHtml(time)}</span>
		<a class="t-anchor" href="#${escapeAttr(anchor)}" aria-label="anchor">#</a>
	</div>`;
}

function rawDetails(event: TraceEvent): string {
	return `<details class="raw"><summary>raw event</summary><pre>${prettyJson(event)}</pre></details>`;
}

function renderSystemPromptEvent(event: TraceEvent, anchor: string): RenderedEvent {
	const data = event.data ?? {};
	const prompt: string =
		data.systemPrompt ??
		data.orchestratorSystemPrompt ??
		data.childSystemPrompt ??
		data.prompt ??
		"";
	const time = formatTime(event.timestamp);
	const html = `<div class="t-event system" id="${escapeAttr(anchor)}">
		${eventHeader("System prompt", time, anchor, "system")}
		<div class="t-body">
			<pre>${escapeHtml(prompt)}</pre>
			${data.configPath ? `<div class="caption">from <code>${escapeHtml(data.configPath)}</code></div>` : ""}
		</div>
	</div>`;
	return { html, tocItems: [{ id: anchor, label: "System prompt", cls: "system" }] };
}

function renderAgentRegistered(event: TraceEvent, anchor: string): RenderedEvent {
	const reg = event.data?.registry ?? {};
	const time = formatTime(event.timestamp);
	const labels = Array.isArray(reg.labels) ? reg.labels.join(", ") : "—";
	const html = `<div class="t-event meta" id="${escapeAttr(anchor)}">
		${eventHeader("Agent registered", time, anchor, "meta")}
		<div class="t-body">
			<div class="meta-row">
				<div><span class="k">id</span><span class="v">${escapeHtml(reg.agentId ?? event.agentId)}</span></div>
				<div><span class="k">role</span><span class="v">${escapeHtml(reg.role ?? "—")}</span></div>
				<div><span class="k">labels</span><span class="v">${escapeHtml(labels || "—")}</span></div>
				${reg.pid !== undefined ? `<div><span class="k">pid</span><span class="v">${escapeHtml(reg.pid)}</span></div>` : ""}
			</div>
		</div>
	</div>`;
	return { html, tocItems: [{ id: anchor, label: "Agent registered", cls: "meta" }] };
}

function renderInputReceived(event: TraceEvent, anchor: string): RenderedEvent {
	const data = event.data ?? {};
	const time = formatTime(event.timestamp);
	const source = data.source === "ipc" ? "IPC" : data.source ?? "input";
	const html = `<div class="t-event user" id="${escapeAttr(anchor)}">
		${eventHeader("Input received", time, anchor, "user")}
		<div class="t-body">
			<div class="caption">via ${escapeHtml(source)}${data.envelopeId ? ` · envelope <code>${escapeHtml(data.envelopeId)}</code>` : ""}</div>
			<div class="text-block">${escapeHtml(data.injectedUserMessage ?? "")}</div>
		</div>
	</div>`;
	return { html, tocItems: [{ id: anchor, label: "Input received", cls: "user" }] };
}

function renderIpcEnvelope(event: TraceEvent, anchor: string, direction: "in" | "out"): RenderedEvent {
	const env = event.data?.envelope ?? {};
	const time = formatTime(event.timestamp);
	const cls: EventClass = direction === "in" ? "ipc-in" : "ipc-out";
	const role = direction === "in" ? "Received" : "Sent";
	const from = env.fromAgentId ?? "?";
	const to = env.toAgentId ?? "?";
	const isResponse = env.type === "agent_response";
	const message = env.message ?? env.finalAssistantText ?? env.error ?? "";
	const status = env.status;

	const metaItems: string[] = [];
	if (env.envelopeId) metaItems.push(`<div class="ipc-meta-item"><span class="k">envelope</span> <span class="v">${escapeHtml(env.envelopeId)}</span></div>`);
	if (status) {
		const statusColor = status === "completed" ? "var(--green)" : status === "failed" ? "var(--red)" : "var(--subtext0)";
		metaItems.push(`<div class="ipc-meta-item"><span class="k">status</span> <span class="v" style="color: ${statusColor};">${escapeHtml(status)}</span></div>`);
	}
	if (env.metadata?.toolCallId) metaItems.push(`<div class="ipc-meta-item"><span class="k">toolCallId</span> <span class="v">${escapeHtml(env.metadata.toolCallId)}</span></div>`);
	if (env.startedAt && env.completedAt) {
		const dur = (new Date(env.completedAt).getTime() - new Date(env.startedAt).getTime()) / 1000;
		if (Number.isFinite(dur) && dur >= 0) metaItems.push(`<div class="ipc-meta-item"><span class="k">duration</span> <span class="v">${dur.toFixed(1)}s</span></div>`);
	}

	const messageBlock = message
		? `<div class="text-block">${escapeHtml(message)}</div>`
		: "";

	const html = `<div class="t-event ${cls}" id="${escapeAttr(anchor)}">
		${eventHeader(role, time, anchor, cls)}
		<div class="t-body">
			<div class="ipc-route">
				<span class="agent from">${escapeHtml(from)}</span>
				<span class="arrow">→</span>
				<span class="agent to">${escapeHtml(to)}</span>${isResponse ? ` <span class="caption">response</span>` : ""}
			</div>
			${messageBlock}
			${metaItems.length ? `<div class="ipc-meta">${metaItems.join("")}</div>` : ""}
			${rawDetails(event)}
		</div>
	</div>`;
	const label = direction === "in" ? `From ${from}` : `To ${to}`;
	return { html, tocItems: [{ id: anchor, label, cls }] };
}

function renderBusyRejected(event: TraceEvent, anchor: string): RenderedEvent {
	const env = event.data?.envelope ?? {};
	const time = formatTime(event.timestamp);
	const html = `<div class="t-event error" id="${escapeAttr(anchor)}">
		${eventHeader("Busy — rejected", time, anchor, "error")}
		<div class="t-body">
			<div class="text-block">Inbox message rejected because the agent was busy.</div>
			<div class="ipc-meta">
				${env.envelopeId ? `<div class="ipc-meta-item"><span class="k">envelope</span> <span class="v">${escapeHtml(env.envelopeId)}</span></div>` : ""}
				${env.fromAgentId ? `<div class="ipc-meta-item"><span class="k">from</span> <span class="v">${escapeHtml(env.fromAgentId)}</span></div>` : ""}
			</div>
			${rawDetails(event)}
		</div>
	</div>`;
	return { html, tocItems: [{ id: anchor, label: "Busy — rejected", cls: "error" }] };
}

function renderError(event: TraceEvent, anchor: string): RenderedEvent {
	const time = formatTime(event.timestamp);
	const data = event.data ?? {};
	const message = typeof data === "string" ? data : data.message ?? data.error ?? "Error";
	const html = `<div class="t-event error" id="${escapeAttr(anchor)}">
		${eventHeader("Error", time, anchor, "error")}
		<div class="t-body">
			<div class="text-block">${escapeHtml(message)}</div>
			${rawDetails(event)}
		</div>
	</div>`;
	return { html, tocItems: [{ id: anchor, label: "Error", cls: "error" }] };
}

// ─── message_end renderers ───────────────────────────────────────────────────
function renderTextPart(text: string): string {
	return `<div class="text-block">${escapeHtml(text)}</div>`;
}

function renderThinkingPart(thinking: string): string {
	return `<section class="thinking">
		<div class="thinking-label">Thinking</div>
		<div class="thinking-body">${escapeHtml(thinking)}</div>
	</section>`;
}

function renderToolCallPart(part: any, tocOut: TocItem[]): string {
	const id = part.id ?? "";
	const name = part.name ?? "tool";
	const anchor = id ? `tool-${id}` : "";
	tocOut.push({ id: anchor, label: name, cls: "tool" });
	return `<section class="tool-call" ${anchor ? `id="${escapeAttr(anchor)}"` : ""}>
		<header class="tool-call-header">
			<span class="arrow">→</span>
			<span class="label">tool</span>
			<code>${escapeHtml(name)}</code>
			${id ? `<span class="id">${escapeHtml(id)}</span>` : ""}
		</header>
		<div class="tool-section">
			<div class="tool-section-label">Arguments</div>
			<pre>${renderMaybeJson(part.arguments)}</pre>
		</div>
	</section>`;
}

function renderAssistantOrUserMessage(message: any, anchor: string, role: "user" | "assistant"): RenderedEvent {
	const tocItems: TocItem[] = [];
	const time = formatTime(message?.timestamp);
	const parts = Array.isArray(message?.content)
		? message.content
		: typeof message?.content === "string"
			? [{ type: "text", text: message.content }]
			: [];
	const partHtml: string[] = [];
	for (const part of parts) {
		if (!part || typeof part !== "object") {
			partHtml.push(`<pre>${prettyJson(part)}</pre>`);
			continue;
		}
		if (part.type === "text" && typeof part.text === "string") partHtml.push(renderTextPart(part.text));
		else if (part.type === "thinking" && typeof part.thinking === "string") partHtml.push(renderThinkingPart(part.thinking));
		else if (part.type === "toolCall") partHtml.push(renderToolCallPart(part, tocItems));
		else partHtml.push(`<pre>${prettyJson(part)}</pre>`);
	}
	const roleLabel = role === "user" ? "User" : "Assistant";
	const html = `<div class="t-event ${role}" id="${escapeAttr(anchor)}">
		${eventHeader(roleLabel, time, anchor, role)}
		<div class="t-body">${partHtml.join("\n")}</div>
	</div>`;
	tocItems.unshift({ id: anchor, label: roleLabel, cls: role });
	return { html, tocItems };
}

function renderToolResultMessage(message: any, anchor: string): RenderedEvent {
	const time = formatTime(message?.timestamp);
	const isError = Boolean(message?.isError);
	const cls: EventClass = "tool-result";
	const errorClass = isError ? " error" : "";
	const toolName = message?.toolName ?? "tool";
	const toolCallId = message?.toolCallId ?? "";

	// Tool result content can be: a string, an array of {type:"text",text} parts, or an object.
	let bodyHtml: string;
	let rawString: string | undefined;
	let hasContent = true;
	const content = message?.content;
	if (typeof content === "string") {
		rawString = content;
		bodyHtml = `<pre>${renderMaybeJson(content)}</pre>`;
	} else if (Array.isArray(content)) {
		const textParts = content
			.map((part: any) => {
				if (part?.type === "text" && typeof part.text === "string") return part.text;
				return null;
			})
			.filter((value: any): value is string => value !== null);
		if (textParts.length > 0) {
			rawString = textParts.join("\n");
			bodyHtml = `<pre>${renderMaybeJson(rawString)}</pre>`;
		} else {
			rawString = JSON.stringify(content, null, 2);
			bodyHtml = `<pre>${prettyJson(content)}</pre>`;
		}
	} else if (content !== undefined) {
		try {
			rawString = JSON.stringify(content, null, 2);
		} catch {
			rawString = String(content);
		}
		bodyHtml = `<pre>${prettyJson(content)}</pre>`;
	} else {
		hasContent = false;
		bodyHtml = `<div class="caption">no result content</div>`;
	}

	// Collapse the result body by default to save vertical space. Auto-expand on error.
	let wrappedBody: string;
	if (!hasContent) {
		wrappedBody = bodyHtml;
	} else {
		const lineCount = rawString ? rawString.split("\n").length : 0;
		const sizeLabel = lineCount === 1 ? "1 line" : `${lineCount} lines`;
		wrappedBody = `<details class="result-body"${isError ? " open" : ""}>
			<summary><span class="chev">›</span><span class="result-label">Result</span><span class="result-meta">${escapeHtml(sizeLabel)}</span></summary>
			${bodyHtml}
		</details>`;
	}

	const html = `<div class="t-event ${cls}${errorClass}" id="${escapeAttr(anchor)}">
		${eventHeader(isError ? "Tool result — error" : "Tool result", time, anchor, cls)}
		<div class="t-body">
			<div class="tool-result-meta">
				<span class="k">tool</span><span class="tool-name">${escapeHtml(toolName)}</span>
				${toolCallId ? `<span class="tool-id">${escapeHtml(toolCallId)}</span>` : ""}
				${isError ? `<span class="badge-error">error</span>` : ""}
			</div>
			${wrappedBody}
		</div>
	</div>`;
	return { html, tocItems: [{ id: anchor, label: isError ? "Tool result (error)" : "Tool result", cls }] };
}

function renderMessageEnd(event: TraceEvent, anchor: string): RenderedEvent {
	const message = event.data?.message;
	if (!message) {
		return { html: `<div class="t-event meta" id="${escapeAttr(anchor)}">${eventHeader("Message", formatTime(event.timestamp), anchor, "meta")}<div class="t-body">${rawDetails(event)}</div></div>`, tocItems: [] };
	}
	const role = message.role;
	if (role === "user") return renderAssistantOrUserMessage(message, anchor, "user");
	if (role === "assistant") return renderAssistantOrUserMessage(message, anchor, "assistant");
	if (role === "toolResult") return renderToolResultMessage(message, anchor);
	// Fallback for unknown roles.
	return {
		html: `<div class="t-event meta" id="${escapeAttr(anchor)}">${eventHeader(String(role ?? "message"), formatTime(message?.timestamp), anchor, "meta")}<div class="t-body"><pre>${prettyJson(message)}</pre></div></div>`,
		tocItems: [{ id: anchor, label: String(role ?? "message"), cls: "meta" }],
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Build per-agent page
// ─────────────────────────────────────────────────────────────────────────────
function ensureAnchor(event: TraceEvent, fallbackIndex: number): string {
	if (event.anchor) return event.anchor;
	return `event-${fallbackIndex}`;
}

interface RenderedSection {
	html: string;
	tocItems: TocItem[];
}

function renderEvent(event: TraceEvent, anchor: string): RenderedEvent | undefined {
	switch (event.type) {
		case "system_prompt_snapshot":
			return renderSystemPromptEvent(event, anchor);
		case "agent_registered":
			return renderAgentRegistered(event, anchor);
		case "input_received":
			return renderInputReceived(event, anchor);
		case "ipc_envelope_received":
			return renderIpcEnvelope(event, anchor, "in");
		case "ipc_envelope_sent":
			return renderIpcEnvelope(event, anchor, "out");
		case "message_end":
			return renderMessageEnd(event, anchor);
		case "busy_rejected":
			return renderBusyRejected(event, anchor);
		case "error":
			return renderError(event, anchor);
		default:
			return undefined;
	}
}

/**
 * Walk events in order. Skip events not in the HTML whitelist. Dedupe
 * consecutive identical system prompts (the orchestrator/child loop logs the
 * same prompt on every `before_agent_start`).
 */
function buildSections(events: TraceEvent[]): RenderedSection {
	const sections: { html: string; tocItems: TocItem[]; isTurnBoundary: boolean; turnLabel?: string }[] = [];
	let lastSystemPrompt: string | undefined;
	let turnIndex = 0;
	let setupDone = false;

	events.forEach((event, idx) => {
		if (!HTML_RENDERED_EVENT_TYPES.has(event.type)) return;

		// Dedupe identical consecutive system prompts.
		if (event.type === "system_prompt_snapshot") {
			const data = event.data ?? {};
			const prompt: string = data.systemPrompt ?? data.orchestratorSystemPrompt ?? data.childSystemPrompt ?? data.prompt ?? "";
			if (prompt && prompt === lastSystemPrompt) return;
			lastSystemPrompt = prompt;
		}

		const anchor = ensureAnchor(event, idx);
		const rendered = renderEvent(event, anchor);
		if (!rendered) return;

		// Mark turn boundaries: every input_received or ipc_envelope_received
		// kicks off a new turn for TOC grouping. Setup events (before the
		// first such event) are grouped under "Setup".
		const isBoundary = event.type === "input_received" || event.type === "ipc_envelope_received";
		if (isBoundary) {
			turnIndex += 1;
			setupDone = true;
		}
		sections.push({
			html: rendered.html,
			tocItems: rendered.tocItems,
			isTurnBoundary: isBoundary,
			turnLabel: setupDone ? `Turn ${turnIndex}` : "Setup",
		});
	});

	if (sections.length === 0) {
		return {
			html: `<div class="empty">No rendered events yet. The JSONL log holds the full trace.</div>`,
			tocItems: [],
		};
	}

	const html = sections.map((section) => section.html).join("\n");
	const tocItems = sections.flatMap((section) => section.tocItems);
	return { html, tocItems, ...{} } as RenderedSection;
}

function buildToc(events: TraceEvent[]): { html: string; tocItems: TocItem[] } {
	const groups: { label: string; items: TocItem[] }[] = [{ label: "Setup", items: [] }];
	let turnIndex = 0;
	let lastSystemPrompt: string | undefined;
	let setupDone = false;

	events.forEach((event, idx) => {
		if (!HTML_RENDERED_EVENT_TYPES.has(event.type)) return;
		if (event.type === "system_prompt_snapshot") {
			const data = event.data ?? {};
			const prompt: string = data.systemPrompt ?? data.orchestratorSystemPrompt ?? data.childSystemPrompt ?? data.prompt ?? "";
			if (prompt && prompt === lastSystemPrompt) return;
			lastSystemPrompt = prompt;
		}
		const anchor = ensureAnchor(event, idx);
		const rendered = renderEvent(event, anchor);
		if (!rendered) return;

		const isBoundary = event.type === "input_received" || event.type === "ipc_envelope_received";
		if (isBoundary) {
			turnIndex += 1;
			setupDone = true;
			groups.push({ label: `Turn ${turnIndex}`, items: [] });
		}
		const target = setupDone ? groups[groups.length - 1] : groups[0];
		for (const item of rendered.tocItems) target.items.push(item);
	});

	const html = groups
		.filter((group) => group.items.length > 0)
		.map((group) => {
			const lis = group.items
				.map(
					(item) =>
						`<li><a class="toc-link" href="#${escapeAttr(item.id)}"><span class="dot ${item.cls}"></span>${escapeHtml(item.label)}</a></li>`,
				)
				.join("\n");
			return `<div class="toc-section">
				<div class="toc-section-label">${escapeHtml(group.label)}</div>
				<ul>${lis}</ul>
			</div>`;
		})
		.join("\n");

	return { html, tocItems: groups.flatMap((g) => g.items) };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS — Catppuccin Mocha + Apple-inspired layout
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_STYLES = `
:root {
	--base: #1e1e2e;
	--mantle: #181825;
	--crust: #11111b;
	--surface0: #313244;
	--surface1: #45475a;
	--surface2: #585b70;
	--overlay0: #6c7086;
	--overlay1: #7f849c;
	--overlay2: #9399b2;
	--subtext0: #a6adc8;
	--subtext1: #bac2de;
	--text: #cdd6f4;
	--blue: #89b4fa;
	--lavender: #b4befe;
	--sapphire: #74c7ec;
	--sky: #89dceb;
	--teal: #94e2d5;
	--green: #a6e3a1;
	--yellow: #f9e2af;
	--peach: #fab387;
	--maroon: #eba0ac;
	--red: #f38ba8;
	--mauve: #cba6f7;
}
* { box-sizing: border-box; }
html, body {
	margin: 0; padding: 0;
	background: var(--base);
	color: var(--text);
	font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", system-ui, sans-serif;
	font-size: 15px;
	line-height: 1.65;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}
a { color: var(--blue); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre, kbd, samp {
	font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
	font-size: 13px;
}
pre {
	background: var(--mantle);
	border: none;
	border-radius: 10px;
	padding: 16px 18px;
	margin: 0;
	overflow-x: auto;
	color: var(--subtext1);
	white-space: pre-wrap;
	word-break: break-word;
	line-height: 1.6;
}
:not(pre) > code {
	background: var(--mantle);
	color: var(--subtext1);
	padding: 1px 6px;
	border-radius: 4px;
	font-size: 12.5px;
}
.muted, .caption { color: var(--overlay1); font-size: 12.5px; }

.layout {
	display: grid;
	grid-template-columns: 260px 1fr;
	min-height: 100vh;
}

/* TOC */
.toc {
	position: sticky; top: 0;
	height: 100vh;
	overflow-y: auto;
	background: var(--mantle);
	border-right: 1px solid rgba(205, 214, 244, 0.06);
	padding: 32px 16px 32px 24px;
}
.toc-back {
	display: inline-flex; align-items: center; gap: 6px;
	color: var(--subtext0); font-size: 13px;
	margin-bottom: 32px;
}
.toc-back:hover { color: var(--text); text-decoration: none; }
.toc-section { margin-bottom: 28px; }
.toc-section-label {
	font-size: 11.5px; font-weight: 600;
	color: var(--overlay1);
	margin: 0 0 10px 8px;
	letter-spacing: 0.01em;
}
.toc ul { list-style: none; padding: 0; margin: 0; }
.toc a.toc-link {
	display: flex; align-items: center; gap: 10px;
	padding: 6px 8px; border-radius: 6px;
	color: var(--subtext0);
	font-size: 13.5px; line-height: 1.4;
	transition: background 0.12s ease, color 0.12s ease;
}
.toc a.toc-link:hover { background: rgba(205, 214, 244, 0.04); text-decoration: none; color: var(--text); }
.toc .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.dot.user { background: var(--blue); }
.dot.assistant { background: var(--green); }
.dot.tool { background: var(--peach); }
.dot.tool-result { background: var(--teal); }
.dot.ipc-in { background: var(--sapphire); }
.dot.ipc-out { background: var(--yellow); }
.dot.system { background: var(--lavender); }
.dot.error { background: var(--red); }
.dot.busy { background: var(--maroon); }
.dot.meta { background: var(--overlay1); }

/* Content */
.content { padding: 56px 72px 96px; max-width: 880px; }
.page-header { margin-bottom: 56px; }
.page-header h1 {
	font-size: 28px; line-height: 1.2;
	font-weight: 600; letter-spacing: -0.01em;
	margin: 0 0 8px;
	color: var(--text);
}
.page-header .meta { color: var(--subtext0); font-size: 14px; }
.page-header .meta a { color: var(--lavender); }
.page-header .meta .sep { color: var(--overlay0); margin: 0 8px; }
.section-rule {
	border: none;
	border-top: 1px solid rgba(205, 214, 244, 0.06);
	margin: 0 0 36px;
}

/* Timeline */
.timeline { position: relative; padding-left: 24px; }
.timeline::before {
	content: "";
	position: absolute; left: 3px; top: 8px; bottom: 8px;
	width: 1px;
	background: rgba(205, 214, 244, 0.08);
}
.t-event { position: relative; padding-bottom: 44px; }
.t-event:last-child { padding-bottom: 0; }
.t-event::before {
	content: "";
	position: absolute; left: -25px; top: 10px;
	width: 7px; height: 7px;
	border-radius: 50%;
	background: var(--overlay1);
}
.t-event.user::before { background: var(--blue); }
.t-event.assistant::before { background: var(--green); }
.t-event.tool-result::before { background: var(--teal); }
.t-event.tool-result.error::before { background: var(--red); }
.t-event.ipc-in::before { background: var(--sapphire); }
.t-event.ipc-out::before { background: var(--yellow); }
.t-event.system::before { background: var(--lavender); }
.t-event.meta::before { background: var(--overlay1); }
.t-event.error::before { background: var(--red); }

.t-meta { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
.t-role { font-size: 14px; font-weight: 600; letter-spacing: -0.005em; }
.t-event.user .t-role { color: var(--blue); }
.t-event.assistant .t-role { color: var(--green); }
.t-event.tool-result .t-role { color: var(--teal); }
.t-event.tool-result.error .t-role { color: var(--red); }
.t-event.ipc-in .t-role { color: var(--sapphire); }
.t-event.ipc-out .t-role { color: var(--yellow); }
.t-event.system .t-role { color: var(--lavender); }
.t-event.meta .t-role { color: var(--subtext0); }
.t-event.error .t-role { color: var(--red); }
.t-time { color: var(--overlay1); font-size: 12.5px; font-family: "SF Mono", "JetBrains Mono", Menlo, monospace; }
.t-anchor { margin-left: auto; color: var(--overlay0); opacity: 0; font-size: 13px; transition: opacity 0.15s; }
.t-event:hover .t-anchor { opacity: 1; }

.t-body { color: var(--text); }
.text-block { white-space: pre-wrap; color: var(--text); }
.t-body > * + * { margin-top: 14px; }

/* Thinking */
.thinking {
	background: rgba(203, 166, 247, 0.06);
	border-radius: 10px;
	padding: 14px 18px;
}
.thinking-label {
	font-size: 12px; font-weight: 600;
	color: var(--mauve);
	margin-bottom: 6px;
	display: flex; align-items: center; gap: 6px;
}
.thinking-label::before { content: ""; width: 4px; height: 4px; border-radius: 50%; background: var(--mauve); }
.thinking-body {
	color: var(--subtext1);
	font-style: italic;
	white-space: pre-wrap;
	max-height: 600px;
	overflow-y: auto;
	line-height: 1.7;
}

/* Tool call (inside assistant message) */
.tool-call {
	background: rgba(250, 179, 135, 0.04);
	border-radius: 10px;
	padding: 14px 16px;
}
.tool-call-header {
	display: flex; align-items: center; gap: 8px;
	margin-bottom: 12px; font-size: 13.5px;
}
.tool-call-header .arrow { color: var(--peach); }
.tool-call-header .label { color: var(--subtext0); }
.tool-call-header code { color: var(--peach); background: transparent; padding: 0; font-weight: 600; }
.tool-call-header .id { color: var(--overlay0); margin-left: auto; font-size: 12px; }
.tool-section + .tool-section { margin-top: 12px; }
.tool-section-label { font-size: 11.5px; font-weight: 500; color: var(--overlay1); margin-bottom: 6px; padding-left: 2px; }
.tool-section.tool-result-section .tool-section-label { color: var(--teal); }
.tool-section pre { background: rgba(0, 0, 0, 0.18); }

/* IPC */
.ipc-route {
	display: flex; align-items: center; gap: 10px;
	font-size: 14px;
	font-family: "SF Mono", "JetBrains Mono", monospace;
	margin-bottom: 6px;
}
.ipc-route .agent.from { color: var(--sapphire); }
.ipc-route .agent.to { color: var(--yellow); }
.ipc-route .arrow { color: var(--overlay0); }
.ipc-meta {
	display: flex; gap: 18px; flex-wrap: wrap;
	font-size: 12.5px; color: var(--overlay1);
	margin-top: 6px;
}
.ipc-meta-item .k { color: var(--overlay0); margin-right: 6px; }
.ipc-meta-item .v { color: var(--subtext0); font-family: "SF Mono", "JetBrains Mono", monospace; font-size: 12px; }

/* Tool result body */
.tool-result-meta {
	display: flex; gap: 12px; flex-wrap: wrap; align-items: baseline;
	font-size: 13px; margin-bottom: 8px;
}
.tool-result-meta .k { color: var(--overlay0); }
.tool-result-meta .tool-name { color: var(--teal); font-family: "SF Mono", "JetBrains Mono", monospace; }
.tool-result-meta .tool-id { color: var(--overlay1); font-family: "SF Mono", "JetBrains Mono", monospace; font-size: 12px; }
.badge-error {
	background: rgba(243, 139, 168, 0.12);
	color: var(--red);
	font-size: 11.5px;
	padding: 1px 8px;
	border-radius: 4px;
	font-weight: 600;
}

/* Meta row (agent registered) */
.meta-row { display: flex; gap: 24px; flex-wrap: wrap; font-size: 13.5px; color: var(--subtext0); }
.meta-row .k { color: var(--overlay1); margin-right: 8px; font-size: 12.5px; }
.meta-row .v { font-family: "SF Mono", "JetBrains Mono", monospace; font-size: 12.5px; color: var(--subtext1); }

/* Raw details */
details.raw { margin-top: 10px; }
details.raw > summary {
	cursor: pointer;
	color: var(--overlay1);
	font-size: 12.5px;
	user-select: none;
	padding: 4px 0;
	list-style: none;
	display: inline-flex; align-items: center; gap: 6px;
}
details.raw > summary::-webkit-details-marker { display: none; }
details.raw > summary::before {
	content: "›";
	display: inline-block;
	transition: transform 0.15s;
	font-size: 14px;
}
details.raw[open] > summary::before { transform: rotate(90deg); }
details.raw > summary:hover { color: var(--subtext0); }
details.raw[open] > summary { margin-bottom: 8px; }

/* Collapsible tool result body */
details.result-body { margin-top: 4px; }
details.result-body > summary {
	cursor: pointer;
	user-select: none;
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 4px 0;
	font-size: 13px;
	color: var(--subtext0);
	list-style: none;
}
details.result-body > summary::-webkit-details-marker { display: none; }
details.result-body > summary .chev {
	display: inline-block;
	transition: transform 0.15s;
	font-size: 14px;
	color: var(--overlay1);
}
details.result-body[open] > summary .chev { transform: rotate(90deg); }
details.result-body > summary:hover { color: var(--text); }
details.result-body > summary .result-label { font-weight: 500; }
details.result-body > summary .result-meta { color: var(--overlay1); font-size: 12px; }
details.result-body[open] > summary { margin-bottom: 8px; }

/* JSON tinting */
.j-key { color: var(--mauve); }
.j-str { color: var(--green); }
.j-num { color: var(--peach); }
.j-bool { color: var(--red); }
.j-null { color: var(--overlay1); }

.empty { color: var(--overlay1); padding: 32px 0; text-align: center; }

@media (max-width: 1000px) {
	.layout { grid-template-columns: 1fr; }
	.toc { position: static; height: auto; border-right: none; border-bottom: 1px solid rgba(205, 214, 244, 0.06); }
	.content { padding: 32px 28px 64px; }
}
`;

const INDEX_STYLES = `
${PAGE_STYLES}
.index-content { padding: 56px 72px 96px; max-width: 880px; margin: 0 auto; }
.index-header h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 8px; }
.index-header .meta { color: var(--subtext0); font-size: 14px; margin-bottom: 8px; }
.index-header .task { color: var(--text); font-size: 15px; margin-bottom: 32px; }
.index-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.index-list a {
	display: flex; align-items: center; gap: 12px;
	padding: 14px 18px;
	background: var(--mantle);
	border-radius: 10px;
	color: var(--text);
	transition: background 0.12s ease;
}
.index-list a:hover { background: var(--surface0); text-decoration: none; }
.index-list .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
.index-list .agent-name { font-weight: 600; }
.index-list .agent-arrow { margin-left: auto; color: var(--overlay1); }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Page assembly
// ─────────────────────────────────────────────────────────────────────────────
function page(agentId: string, run: ActiveRun, events: TraceEvent[]): string {
	const sections = buildSections(events);
	const toc = buildToc(events);
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(agentId)} · ${escapeHtml(run.taskId)}</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
<div class="layout">
	<aside class="toc">
		<a href="index.html" class="toc-back">← Run index</a>
		${toc.html || `<div class="caption">No events yet.</div>`}
	</aside>
	<main class="content">
		<header class="page-header">
			<h1>${escapeHtml(agentId)}</h1>
			<div class="meta">
				<a href="index.html">${escapeHtml(run.taskId)}</a>
				<span class="sep">·</span>
				${escapeHtml(run.task)}
			</div>
		</header>
		<hr class="section-rule" />
		<div class="timeline">
			${sections.html}
		</div>
	</main>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — appendTraceEvent / renderAgentTrace / renderIndex (signatures
// preserved for callers in index.ts, ipc.ts, tools.ts).
// ─────────────────────────────────────────────────────────────────────────────
export function appendTraceEvent(run: ActiveRun, agentId: string, type: TraceEvent["type"], data?: any, anchor?: string): void {
	mkdirSync(run.paths.traceEventDir, { recursive: true });
	mkdirSync(run.paths.traceHtmlDir, { recursive: true });
	const event: TraceEvent = { type, timestamp: new Date().toISOString(), runId: run.taskId, agentId, anchor, data };
	appendFileSync(join(run.paths.traceEventDir, `${agentId}.jsonl`), `${JSON.stringify(event)}\n`, "utf8");
	renderAgentTrace(run, agentId);
	renderIndex(run);
}

export function renderAgentTrace(run: ActiveRun, agentId: string): void {
	const eventPath = join(run.paths.traceEventDir, `${agentId}.jsonl`);
	const events = readJsonl(eventPath);
	writeFileSync(join(run.paths.traceHtmlDir, `${agentId}.html`), page(agentId, run, events), "utf8");
}

export function renderIndex(run: ActiveRun): void {
	mkdirSync(run.paths.traceHtmlDir, { recursive: true });
	const eventFiles = existsSync(run.paths.traceEventDir)
		? readdirSync(run.paths.traceEventDir).filter((name: string) => name.endsWith(".jsonl"))
		: [];
	const items = eventFiles
		.map((file: string) => basename(file, ".jsonl"))
		.sort()
		.map(
			(agentId: string) =>
				`<li><a href="${escapeAttr(`${agentId}.html`)}"><span class="dot"></span><span class="agent-name">${escapeHtml(agentId)}</span><span class="agent-arrow">→</span></a></li>`,
		)
		.join("\n");
	const runDirRel = relative(process.cwd(), run.paths.runDir) || run.paths.runDir;
	writeFileSync(
		join(run.paths.traceHtmlDir, "index.html"),
		`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(run.taskId)}</title>
<style>${INDEX_STYLES}</style>
</head>
<body>
<main class="index-content">
	<header class="index-header">
		<h1>${escapeHtml(run.taskId)}</h1>
		<div class="task">${escapeHtml(run.task)}</div>
		<div class="meta">Run dir <code>${escapeHtml(runDirRel)}</code></div>
	</header>
	<ul class="index-list">${items || `<li class="caption">No agents have written traces yet.</li>`}</ul>
</main>
</body>
</html>`,
		"utf8",
	);
}
