import type { AgentToolResult, ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { discoverAgents, formatAgentsForPrompt } from "./agents.ts";
import { openSubagentsOverlay } from "./overlay.ts";
import { renderTaskCall, renderTaskResult } from "./render.ts";
import { runSubagentTask, type TaskToolDetails, type TaskToolResultDetails } from "./runner.ts";
import { makeActivity, SubagentState, TASK_ENTRY_TYPE, type PersistedTaskEvent } from "./state.ts";
import { taskParameters } from "./tool-schema.ts";

const state = new SubagentState();

function persistInterrupted(pi: ExtensionAPI, taskId: string, error: string): void {
	const now = Date.now();
	const event: PersistedTaskEvent = {
		kind: "finish",
		taskId,
		status: "interrupted",
		response: "",
		error,
		completedAt: now,
		timestamp: now,
	};
	try {
		pi.appendEntry(TASK_ENTRY_TYPE, event);
	} catch {}
}

export default function subagentsExtension(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		// Child sub-agent sessions load normal extensions too. Do not let the child
		// runtime clear or rewrite the parent overlay state.
		if (ctx.sessionManager.getHeader()?.parentSession) return;
		const interrupted = state.restoreFromEntries(ctx.sessionManager.getEntries());
		for (const task of interrupted) {
			const activity = makeActivity("info", "interrupted", task.error);
			state.addActivity(task.id, activity);
			try {
				pi.appendEntry(TASK_ENTRY_TYPE, { kind: "activity", taskId: task.id, activity, timestamp: activity.timestamp } satisfies PersistedTaskEvent);
			} catch {}
			persistInterrupted(pi, task.id, task.error ?? "Pi stopped before this sub-agent returned a final result.");
		}
	});

	pi.on("before_agent_start", (event, ctx) => {
		if (ctx.sessionManager.getHeader()?.parentSession) return;
		const agents = discoverAgents(ctx.cwd);
		const section = formatAgentsForPrompt(agents);
		if (!section) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${section}` };
	});

	pi.registerCommand("subagents", {
		description: "Inspect sub-agent tasks for this session",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			await openSubagentsOverlay(ctx, state);
		},
	});

	pi.registerTool<typeof taskParameters, TaskToolResultDetails | TaskToolDetails>({
		name: "task",
		label: "Sub-agent task",
		description:
			"Delegate a focused, self-contained task to one of the configured sub-agents. Use only when an available agent description is a strong match.",
		promptSnippet: "Delegate focused work to a configured sub-agent",
		promptGuidelines: [
			"Use the task tool only when a configured sub-agent is a strong match for a focused, self-contained subtask",
			"Do not use sub-agents for simple file reads, narrow searches, or tasks you can complete directly",
			"When delegating, provide a complete prompt because the sub-agent starts with isolated context",
		],
		parameters: taskParameters,
		renderShell: "self",
		executionMode: "parallel",
		execute: async (
			_toolCallId: string,
			params,
			signal: AbortSignal | undefined,
			onUpdate: ((partial: AgentToolResult<TaskToolDetails>) => void) | undefined,
			ctx: ExtensionContext,
		) => {
			const agents = discoverAgents(ctx.cwd);
			const agent = agents.find((item) => item.name === params.agent);
			if (!agent) {
				const available = agents.map((item) => item.name).join(", ") || "none";
				throw new Error(`Unknown sub-agent: ${params.agent}. Available agents: ${available}`);
			}
			return runSubagentTask({
				pi,
				ctx,
				state,
				agent,
				description: params.description,
				prompt: params.prompt,
				signal,
				onUpdate,
			});
		},
		renderCall: (args, theme) => renderTaskCall(args, theme),
		renderResult: (result, options, theme) => renderTaskResult(result, options, theme),
	});
}
