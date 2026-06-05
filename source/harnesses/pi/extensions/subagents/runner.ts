import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
	SettingsManager,
	type ExtensionAPI,
	type ExtensionContext,
	type AgentToolResult,
} from "@earendil-works/pi-coding-agent";
import type { AgentDefinition, ThinkingLevel } from "./agents.ts";
import { createTask, makeActivity, TASK_ENTRY_TYPE, type PersistedTaskEvent, type SubagentState, type SubagentTask, type TaskStatus } from "./state.ts";

export interface TaskToolDetails {
	task: SubagentTask;
}

export interface TaskToolResultDetails extends TaskToolDetails {
	status: TaskStatus;
	response: string;
}

function cloneTask(task: SubagentTask): SubagentTask {
	return { ...task, activities: [...task.activities] };
}

function resultFor(task: SubagentTask, content: string): AgentToolResult<TaskToolDetails> {
	return { content: [{ type: "text", text: content }], details: { task: cloneTask(task) } };
}

function appendTaskEvent(pi: ExtensionAPI, event: PersistedTaskEvent): void {
	try {
		pi.appendEntry(TASK_ENTRY_TYPE, event);
	} catch {
		// Persistence should never break the tool execution path.
	}
}

function resolveModel(ctx: ExtensionContext, modelRef: string | undefined) {
	if (!modelRef) return ctx.model;
	const slash = modelRef.indexOf("/");
	if (slash > 0) {
		const provider = modelRef.slice(0, slash);
		const modelId = modelRef.slice(slash + 1);
		return ctx.modelRegistry.find(provider, modelId) ?? ctx.model;
	}
	return ctx.modelRegistry.getAll().find((m) => m.id === modelRef || m.name === modelRef) ?? ctx.model;
}

function formatModelId(model: ReturnType<typeof resolveModel>, fallback: string | undefined): string | undefined {
	if (model) return `${model.provider}/${model.id}`;
	return fallback;
}

function getFinalAssistantText(messages: any[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		const parts = message.content.filter((part: any) => part?.type === "text" && typeof part.text === "string");
		if (parts.length > 0) return parts.map((part: any) => part.text).join("\n").trim();
	}
	return "";
}

function summarizeArgs(args: unknown): string | undefined {
	if (!args || typeof args !== "object") return undefined;
	const input = args as Record<string, unknown>;
	const picked: Record<string, unknown> = {};
	for (const key of ["path", "file_path", "pattern", "command", "query", "description"]) {
		if (input[key] !== undefined) picked[key] = input[key];
	}
	const value = Object.keys(picked).length > 0 ? picked : input;
	let json = "";
	try {
		json = JSON.stringify(value);
	} catch {
		return undefined;
	}
	return json.length > 160 ? `${json.slice(0, 157)}...` : json;
}

function childInstructions(agent: AgentDefinition): string {
	return [
		"<subagent_instructions>",
		`You are running as the \`${agent.name}\` sub-agent.`,
		"Work only on the delegated task. Use the available tools to investigate or act as needed.",
		"Do not attempt to delegate to another sub-agent; recursive sub-agent delegation is disabled.",
		"Return one complete final response for the primary agent.",
		"",
		agent.body,
		"</subagent_instructions>",
	]
		.filter(Boolean)
		.join("\n");
}

export async function runSubagentTask(input: {
	pi: ExtensionAPI;
	ctx: ExtensionContext;
	state: SubagentState;
	agent: AgentDefinition;
	description: string;
	prompt: string;
	signal?: AbortSignal;
	onUpdate?: (result: AgentToolResult<TaskToolDetails>) => void;
}): Promise<AgentToolResult<TaskToolResultDetails>> {
	const { pi, ctx, state, agent, description, prompt, signal, onUpdate } = input;
	const settingsManager = SettingsManager.create(ctx.cwd, getAgentDir());
	const childSessionManager = SessionManager.create(ctx.cwd, settingsManager.getSessionDir(), {
		parentSession: ctx.sessionManager.getSessionFile(),
	});
	const effectiveModel = resolveModel(ctx, agent.model);
	const effectiveThinkingLevel = agent.thinkingLevel ?? pi.getThinkingLevel();
	const task = createTask({
		agent: agent.name,
		description,
		prompt,
		childSessionFile: childSessionManager.getSessionFile(),
		model: formatModelId(effectiveModel, agent.model),
		thinkingLevel: effectiveThinkingLevel,
	});
	state.upsert(task);
	const { activities: _activities, ...persistedTask } = task;
	appendTaskEvent(pi, { kind: "start", task: persistedTask, timestamp: task.startedAt });
	onUpdate?.(resultFor(task, `Sub-agent ${agent.name} is running.`));

	const persistActivity = (label: string, detail?: string, type: "thinking" | "tool" | "info" = "tool") => {
		const activity = makeActivity(type, label, detail);
		state.addActivity(task.id, activity);
		appendTaskEvent(pi, { kind: "activity", taskId: task.id, activity, timestamp: activity.timestamp });
		onUpdate?.(resultFor(state.get(task.id) ?? task, `Sub-agent ${agent.name} is running.`));
	};

	persistActivity("session", childSessionManager.getSessionFile(), "info");

	let child: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
	let removeAbortListener: (() => void) | undefined;
	try {
		const resourceLoader = new DefaultResourceLoader({
			cwd: ctx.cwd,
			agentDir: getAgentDir(),
			settingsManager,
			appendSystemPrompt: [childInstructions(agent)],
		});
		await resourceLoader.reload();

		const activeTools = pi.getActiveTools().filter((name) => name !== "task");
		const result = await createAgentSession({
			cwd: ctx.cwd,
			agentDir: getAgentDir(),
			modelRegistry: ctx.modelRegistry,
			settingsManager,
			resourceLoader,
			sessionManager: childSessionManager,
			model: effectiveModel,
			thinkingLevel: effectiveThinkingLevel as ThinkingLevel | undefined,
			tools: activeTools,
			sessionStartEvent: { type: "session_start", reason: "new", previousSessionFile: ctx.sessionManager.getSessionFile() },
		});
		child = result.session;

		const unsubscribe = child.subscribe((event) => {
			if (event.type === "turn_start") {
				persistActivity("thinking…", undefined, "thinking");
			} else if (event.type === "tool_execution_start") {
				persistActivity(event.toolName, summarizeArgs(event.args));
			}
		});

		const abort = () => void child?.abort();
		if (signal) {
			if (signal.aborted) abort();
			signal.addEventListener("abort", abort, { once: true });
			removeAbortListener = () => signal.removeEventListener("abort", abort);
		}

		await child.prompt(prompt, { source: "extension" });
		unsubscribe();

		const response = getFinalAssistantText(child.messages) || "(sub-agent completed without a text response)";
		const finalTask = state.get(task.id) ?? task;
		state.finish(task.id, "completed", response);
		appendTaskEvent(pi, {
			kind: "finish",
			taskId: task.id,
			status: "completed",
			response,
			completedAt: Date.now(),
			timestamp: Date.now(),
		});
		const completed = state.get(task.id) ?? finalTask;
		return {
			content: [{ type: "text", text: `status: completed\n\n${response}` }],
			details: { task: cloneTask(completed), status: "completed", response },
		};
	} catch (error) {
		const aborted = signal?.aborted;
		const status: TaskStatus = aborted ? "aborted" : "failed";
		const message = error instanceof Error ? error.message : String(error);
		state.finish(task.id, status, "", message);
		appendTaskEvent(pi, {
			kind: "finish",
			taskId: task.id,
			status,
			response: "",
			error: message,
			completedAt: Date.now(),
			timestamp: Date.now(),
		});
		const failed = state.get(task.id) ?? task;
		return {
			content: [{ type: "text", text: `status: ${status}\n\n${message}` }],
			details: { task: cloneTask(failed), status, response: message },
		};
	} finally {
		removeAbortListener?.();
		child?.dispose();
	}
}
