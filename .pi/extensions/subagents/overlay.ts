import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable, TUI } from "@earendil-works/pi-tui";
import { matchesKey, visibleWidth } from "@earendil-works/pi-tui";
import { formatDuration } from "./render.ts";
import type { SubagentState, SubagentTask } from "./state.ts";

function truncate(input: string, max: number): string {
	return input.length > max ? `${input.slice(0, Math.max(0, max - 1))}…` : input;
}

function pad(input: string, width: number): string {
	return input + " ".repeat(Math.max(0, width - visibleWidth(input)));
}

function wrap(input: string, width: number): string[] {
	const lines: string[] = [];
	for (const raw of input.split(/\r?\n/)) {
		let line = raw;
		if (!line) {
			lines.push("");
			continue;
		}
		while (visibleWidth(line) > width) {
			lines.push(line.slice(0, width));
			line = line.slice(width);
		}
		lines.push(line);
	}
	return lines;
}

function statusIcon(status: SubagentTask["status"]): string {
	return status === "running" ? "⏳" : status === "completed" ? "✓" : status === "failed" ? "✕" : status === "aborted" ? "■" : "!";
}

function statusColor(status: SubagentTask["status"]): string {
	return status === "running" ? "accent" : status === "completed" ? "success" : status === "failed" ? "error" : "warning";
}

function modelLabel(task: SubagentTask): string {
	if (task.model && task.thinkingLevel) return `${task.model}:${task.thinkingLevel}`;
	return task.model ?? task.thinkingLevel ?? "model unknown";
}

class SubagentsOverlay implements Component, Focusable {
	focused = false;
	private mode: "list" | "detail" = "list";
	private selected = 0;
	private scroll = 0;
	private followTail = false;
	private pendingG = false;
	private unsubscribe: (() => void) | undefined;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private state: SubagentState,
		private done: () => void,
	) {
		this.unsubscribe = state.subscribe(() => {
			this.invalidate();
			this.tui.requestRender();
		});
	}

	dispose(): void {
		this.unsubscribe?.();
	}

	invalidate(): void {}

	handleInput(data: string): void {
		const tasks = this.state.list();
		if (matchesKey(data, "escape")) {
			if (this.mode === "detail") {
				this.mode = "list";
				this.scroll = 0;
				this.followTail = false;
				this.pendingG = false;
			} else {
				this.done();
			}
			this.tui.requestRender();
			return;
		}
		if (data === "q" || data === "Q") {
			this.done();
			return;
		}
		if (this.mode === "list") {
			if (matchesKey(data, "up")) this.selected = Math.max(0, this.selected - 1);
			else if (matchesKey(data, "down")) this.selected = Math.min(Math.max(0, tasks.length - 1), this.selected + 1);
			else if (matchesKey(data, "return") && tasks[this.selected]) {
				this.mode = "detail";
				this.pendingG = false;
				this.followTail = tasks[this.selected]?.status === "running";
				this.scroll = this.followTail ? Number.MAX_SAFE_INTEGER : 0;
			}
		} else {
			if (data === "g") {
				if (this.pendingG) {
					this.scroll = 0;
					this.followTail = false;
					this.pendingG = false;
				} else {
					this.pendingG = true;
				}
			} else if (data === "G") {
				this.scroll = Number.MAX_SAFE_INTEGER;
				this.followTail = true;
				this.pendingG = false;
			} else if (matchesKey(data, "up") || data === "k") {
				this.scroll = Math.max(0, this.scroll - 1);
				this.followTail = false;
				this.pendingG = false;
			} else if (matchesKey(data, "down") || data === "j") {
				this.scroll += 1;
				this.pendingG = false;
			} else {
				this.pendingG = false;
			}
		}
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const w = Math.max(48, Math.min(96, width));
		return this.mode === "detail" ? this.renderDetail(w) : this.renderList(w);
	}

	private shell(title: string, body: string[], footer: string, width: number): string[] {
		const th = this.theme;
		const inner = width - 2;
		const lines: string[] = [];
		lines.push(th.fg("border" as any, `╭─ ${title} ${"─".repeat(Math.max(0, inner - visibleWidth(title) - 3))}╮`));
		for (const line of body) lines.push(th.fg("border" as any, "│") + pad(line, inner) + th.fg("border" as any, "│"));
		lines.push(th.fg("border" as any, "│") + pad(th.fg("dim" as any, footer), inner) + th.fg("border" as any, "│"));
		lines.push(th.fg("border" as any, `╰${"─".repeat(inner)}╯`));
		return lines;
	}

	private renderList(width: number): string[] {
		const th = this.theme;
		const tasks = this.state.list();
		const body: string[] = [th.fg("dim" as any, " Recent first"), ""];
		if (tasks.length === 0) {
			body.push(th.fg("dim" as any, " No sub-agent tasks in this session."));
		} else {
			this.selected = Math.min(this.selected, tasks.length - 1);
			for (let i = 0; i < tasks.length; i++) {
				const task = tasks[i]!;
				const selected = i === this.selected;
				const pointer = selected ? th.fg("accent" as any, "▶") : " ";
				const icon = th.fg(statusColor(task.status) as any, statusIcon(task.status));
				const agent = pad(truncate(task.agent, 10), 10);
				const elapsed = formatDuration((task.completedAt ?? Date.now()) - task.startedAt);
				const descWidth = Math.max(12, width - 31);
				body.push(`${pointer} ${icon} ${th.fg("accent" as any, agent)} ${pad(truncate(task.description, descWidth), descWidth)} ${th.fg("dim" as any, elapsed)}`);
				body.push(`    ${th.fg("dim" as any, truncate(modelLabel(task), Math.max(12, width - 8)))}`);
			}
		}
		body.push("");
		return this.shell("Sub-agents", body, " Enter inspect • Esc/q close", width);
	}

	private renderDetail(width: number): string[] {
		const th = this.theme;
		const task = this.state.list()[this.selected];
		if (!task) return this.renderList(width);
		const contentWidth = width - 6;
		const body: string[] = [];
		body.push(` ${th.fg("accent" as any, task.agent)} ${th.fg(statusColor(task.status) as any, `· ${task.status}`)}`);
		body.push(` Model: ${truncate(task.model ?? "unknown", contentWidth - 8)}`);
		body.push(` Thinking: ${task.thinkingLevel ?? "unknown"}`);
		body.push(` Task: ${truncate(task.description, contentWidth)}`);
		body.push(` Duration: ${formatDuration((task.completedAt ?? Date.now()) - task.startedAt)}`);
		if (task.childSessionFile) body.push(` Session: ${truncate(task.childSessionFile, contentWidth - 9)}`);
		body.push("");
		body.push(th.fg("dim" as any, " Activity"));
		for (const item of task.activities) {
			const detail = item.detail ? ` ${item.detail}` : "";
			body.push(`   ${item.type === "thinking" ? "◦" : item.type === "info" ? "·" : "→"} ${truncate(item.label + detail, contentWidth - 5)}`);
		}
		body.push("");
		body.push(th.fg("dim" as any, " Final response"));
		if (task.response) {
			for (const line of wrap(task.response, contentWidth)) body.push(`   ${line}`);
		} else if (task.error) {
			body.push(th.fg("warning" as any, `   ${task.error}`));
		} else {
			body.push(th.fg("dim" as any, "   Not available yet."));
		}

		const maxBody = 28;
		const maxScroll = Math.max(0, body.length - maxBody);
		if (this.followTail) {
			this.scroll = maxScroll;
		} else {
			this.scroll = Math.min(Math.max(0, this.scroll), maxScroll);
			if (this.scroll >= maxScroll && task.status === "running") this.followTail = true;
		}
		const scrolled = body.slice(this.scroll, this.scroll + maxBody);
		return this.shell(`${task.agent} · ${task.status}`, scrolled, " j/k scroll • G bottom • gg top • Esc back • q close", width);
	}
}

export async function openSubagentsOverlay(ctx: ExtensionCommandContext, state: SubagentState): Promise<void> {
	await ctx.ui.custom<void>((tui, theme, _keybindings, done) => new SubagentsOverlay(tui, theme, state, done), {
		overlay: true,
		overlayOptions: { width: "80%", maxHeight: "80%", anchor: "center", minWidth: 56 },
	});
}
