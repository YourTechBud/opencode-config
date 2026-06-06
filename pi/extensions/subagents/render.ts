import type { AgentToolResult, Theme, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { Container, type Component } from "@earendil-works/pi-tui";
import type { TaskToolDetails, TaskToolResultDetails } from "./runner.ts";
import type { SubagentTask } from "./state.ts";
import type { TaskParams } from "./tool-schema.ts";

type TaskArgs = TaskParams;

function stripAnsi(input: string): string {
	return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function truncate(input: string, max: number): string {
	const plain = stripAnsi(input);
	return plain.length > max ? `${plain.slice(0, Math.max(0, max - 1))}…` : plain;
}

export function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const rest = seconds % 60;
	return `${minutes}m ${rest.toString().padStart(2, "0")}s`;
}

function statusIcon(status: SubagentTask["status"]): string {
	switch (status) {
		case "running":
			return "⏳";
		case "completed":
			return "✓";
		case "aborted":
			return "■";
		case "interrupted":
			return "!";
		case "failed":
			return "✕";
	}
}

function statusColor(status: SubagentTask["status"]): string {
	switch (status) {
		case "running":
			return "accent";
		case "completed":
			return "success";
		case "failed":
			return "error";
		case "aborted":
		case "interrupted":
			return "warning";
	}
}

function modelLabel(task: SubagentTask | undefined): string | undefined {
	if (!task?.model && !task?.thinkingLevel) return undefined;
	if (task.model && task.thinkingLevel) return `${task.model}:${task.thinkingLevel}`;
	return task.model ?? task.thinkingLevel;
}

export class TaskCard implements Component {
	constructor(
		private task: SubagentTask | undefined,
		private args: TaskArgs | undefined,
		private theme: Theme,
		private options: { expanded?: boolean; partial?: boolean } = {},
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		const theme = this.theme;
		const lines: string[] = [];
		const task = this.task;
		const agent = task?.agent ?? this.args?.agent ?? "agent";
		const description = task?.description ?? this.args?.description ?? "sub-agent task";
		const status = task?.status ?? "running";
		const elapsed = task ? formatDuration((task.completedAt ?? Date.now()) - task.startedAt) : "";
		const model = modelLabel(task);
		const metadata = model ? ` · ${model}` : "";
		const fixedWidth = 8 + agent.length + metadata.length + elapsed.length;

		const head = `${theme.fg(statusColor(status) as any, statusIcon(status))} ${theme.fg("accent" as any, agent)}${theme.fg("dim" as any, metadata)} ${theme.fg("dim" as any, "·")} ${truncate(description, Math.max(24, width - fixedWidth))}${elapsed ? theme.fg("dim" as any, ` · ${elapsed}`) : ""}`;
		lines.push(head);

		if (!task) {
			lines.push(theme.fg("dim" as any, "  waiting to start…"));
			return lines;
		}

		const recent = task.activities.slice(-3);
		for (const item of recent) {
			const prefix = item.type === "thinking" ? "  ◦ " : item.type === "info" ? "  · " : "  → ";
			const detail = item.detail ? theme.fg("dim" as any, ` ${truncate(item.detail, Math.max(20, width - 18))}`) : "";
			lines.push(`${theme.fg("dim" as any, prefix)}${truncate(item.label, 32)}${detail}`);
		}

		if (task.status === "completed" && task.response) {
			const firstLine = task.response.split(/\r?\n/).find((line) => line.trim()) ?? "response available";
			lines.push(theme.fg("dim" as any, `  ${truncate(firstLine, Math.max(24, width - 6))}`));
			lines.push(theme.fg("dim" as any, "  Full response available via /subagents"));
		} else if (task.status !== "running" && task.error) {
			lines.push(theme.fg("warning" as any, `  ${truncate(task.error, Math.max(24, width - 6))}`));
		}

		if (this.options.expanded && task.response) {
			lines.push("");
			for (const line of task.response.split(/\r?\n/).slice(0, 40)) {
				lines.push(`  ${truncate(line, Math.max(20, width - 4))}`);
			}
		}

		return lines;
	}
}

export function renderTaskCall(_args: TaskArgs, _theme: Theme): Component {
	return new Container();
}

export function renderTaskResult(
	result: AgentToolResult<TaskToolDetails | TaskToolResultDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
): Component {
	return new TaskCard(result.details?.task, undefined, theme, { expanded: options.expanded, partial: options.isPartial });
}
