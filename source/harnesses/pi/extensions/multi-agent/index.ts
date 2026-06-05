import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { findChildAgent, findDriverAgent, loadMultiAgentConfig } from "./config.ts";
import { inboxPath, readHealthyRegistry, readJsonl, updateRegistryStatus, writeRegistry, writeResponse } from "./ipc.ts";
import { createRunPaths, createUniqueTaskId, getRunJsonPath, hasExistingRuntimeRun } from "./paths.ts";
import { applySkillCommandPrefix, buildChildSystemPrompt, buildDeliberateKickoffPrompt, buildOrchestratorSystemPrompt } from "./prompts.ts";
import { appendTraceEvent, renderIndex } from "./trace.ts";
import {
	ORCHESTRATOR_BASE_TOOLS,
	ORCHESTRATOR_TOOL_NAMES,
	type ActiveChild,
	type ActiveRun,
	type AgentRegistryEntry,
	type AgentRequestEnvelope,
	type OrchestratorToolName,
	type ThinkingLevel,
} from "./types.ts";
import { deactivateOrchestratorTools, registerMultiAgentTools } from "./tools.ts";

function withoutOrchestratorTools(tools: string[]): string[] {
	return tools.filter((tool) => !ORCHESTRATOR_TOOL_NAMES.includes(tool as OrchestratorToolName));
}

function unique(values: readonly string[]): string[] {
	return Array.from(new Set(values));
}

function activateOrchestratorTools(pi: ExtensionAPI, previousActiveTools: string[]): void {
	const available = new Set(pi.getAllTools().map((tool) => tool.name));
	const next = unique([...previousActiveTools, ...ORCHESTRATOR_BASE_TOOLS, ...ORCHESTRATOR_TOOL_NAMES]).filter((tool) =>
		available.has(tool),
	);
	pi.setActiveTools(next);
}

function textFromMessage(message: any): string {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
}

function lastAssistant(messages: any[] | undefined): any | undefined {
	for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
		const message = messages?.[i];
		if (message?.role === "assistant") return message;
	}
	return undefined;
}

function messageAnchor(message: any): string | undefined {
	if (!message) return undefined;
	if (message.toolCallId) return `msg-${message.toolCallId}`;
	if (message.timestamp) return `msg-${message.role ?? "message"}-${message.timestamp}`;
	return undefined;
}

function parseModelSpec(spec: string): { provider: string; id: string } | undefined {
	const [provider, ...rest] = spec.split("/");
	const id = rest.join("/");
	if (!provider || !id) return undefined;
	return { provider, id };
}

function loadRun(cwd: string): ActiveRun | undefined {
	const runJsonPath = getRunJsonPath(cwd);
	if (!existsSync(runJsonPath)) return undefined;
	const config = loadMultiAgentConfig(cwd);
	try {
		const parsed = JSON.parse(readFileSync(runJsonPath, "utf8"));
		const taskId = typeof parsed.taskId === "string" ? parsed.taskId : "multi-agent-run";
		const task = typeof parsed.task === "string" ? parsed.task : taskId;
		const paths = createRunPaths(cwd, taskId);
		return { taskId, task, cwd, paths, config, previousActiveTools: [] };
	} catch {
		return undefined;
	}
}

function loadActiveRun(cwd: string): ActiveRun | undefined {
	return loadRun(cwd);
}

async function waitForInitialChildRegistration(run: ActiveRun, timeoutMs = 3000): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const activeChildren = readHealthyRegistry(run).filter((entry) => entry.role === "child");
		if (activeChildren.length > 0) return;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
}

function makeRegistry(run: ActiveRun, agentId: string, role: "orchestrator" | "child", extra: Partial<AgentRegistryEntry> = {}): AgentRegistryEntry {
	const now = new Date().toISOString();
	return {
		agentId,
		displayName: agentId,
		role,
		runId: run.taskId,
		pid: process.pid,
		cwd: run.cwd,
		registeredAt: now,
		lastHeartbeatAt: now,
		status: "idle",
		...extra,
	};
}

async function applyChildRuntimeConfig(pi: ExtensionAPI, ctx: ExtensionCommandContext, child: ActiveChild): Promise<void> {
	deactivateOrchestratorTools(pi);
	if (child.agent.tools?.length) {
		const available = new Set(pi.getAllTools().map((tool) => tool.name));
		pi.setActiveTools(child.agent.tools.filter((tool) => available.has(tool)));
	}
	const modelSpec = child.agent.model ?? child.config.settings.defaults.model;
	if (modelSpec && modelSpec !== "inherit") {
		const parsed = parseModelSpec(modelSpec);
		const model = parsed ? ctx.modelRegistry.find(parsed.provider, parsed.id) : undefined;
		if (model) await pi.setModel(model);
	}
	const thinking = child.agent.thinkingLevel ?? child.config.settings.defaults.thinkingLevel;
	if (thinking) pi.setThinkingLevel(thinking as ThinkingLevel);
}

function getEnvelopePrompt(child: ActiveChild, envelope: AgentRequestEnvelope): string {
	return child.acceptedEnvelopeCount === 0 ? applySkillCommandPrefix(child.agent, envelope.message) : envelope.message;
}

export default function multiAgentExtension(pi: ExtensionAPI): void {
	let activeRun: ActiveRun | undefined;
	let activeChild: ActiveChild | undefined;
	let heartbeatTimer: NodeJS.Timeout | undefined;

	const getActiveRun = () => activeRun;

	registerMultiAgentTools(pi, getActiveRun);

	function stopHeartbeat(): void {
		if (heartbeatTimer) clearInterval(heartbeatTimer);
		heartbeatTimer = undefined;
	}

	function resetSessionState(): void {
		stopHeartbeat();
		if (activeChild?.pollTimer) clearInterval(activeChild.pollTimer);
		if (activeChild?.heartbeatTimer) clearInterval(activeChild.heartbeatTimer);
		if (activeChild?.waitingForRunTimer) clearInterval(activeChild.waitingForRunTimer);
		activeRun = undefined;
		activeChild = undefined;
	}

	function startOrchestratorHeartbeat(run: ActiveRun): void {
		stopHeartbeat();
		heartbeatTimer = setInterval(() => updateRegistryStatus(run, "orchestrator", "idle"), 5000);
	}

	function startChildHeartbeat(child: ActiveChild): void {
		if (child.heartbeatTimer) clearInterval(child.heartbeatTimer);
		child.heartbeatTimer = setInterval(() => {
			if (child.run) updateRegistryStatus(child.run, child.agentId, child.processingEnvelopeId ? "running" : "idle");
		}, 5000);
	}

	async function attachChildToRun(child: ActiveChild, run: ActiveRun, ctx: ExtensionCommandContext): Promise<void> {
		child.run = run;
		activeRun = run;
		await applyChildRuntimeConfig(pi, ctx, child);
		const registry = makeRegistry(run, child.agentId, "child", {
			displayName: child.agent.displayName,
			configPath: child.agent.filePath,
			labels: child.agent.labels,
			status: "idle",
		});
		writeRegistry(run, registry);
		startChildHeartbeat(child);
		startInboxPolling(child, ctx);
		ctx.ui.setStatus("multi-agent-child", ctx.ui.theme.fg("accent", `child: ${child.agentId}`));
		ctx.ui.setWidget("multi-agent-child", [
			`Child agent: ${child.agent.displayName}`,
			`Run: ${run.taskId}`,
			`Trace: ${join(run.paths.traceHtmlDir, `${child.agentId}.html`)}`,
			"Observe-only: direct user input is disabled.",
		]);
		ctx.ui.notify(`Child agent ${child.agentId} attached to run ${run.taskId}.`, "info");
	}

	function startWaitingForRun(child: ActiveChild, ctx: ExtensionCommandContext): void {
		if (child.waitingForRunTimer) clearInterval(child.waitingForRunTimer);
		child.waitingForRunTimer = setInterval(() => {
			const run = loadActiveRun(ctx.cwd);
			if (!run) return;
			if (child.waitingForRunTimer) clearInterval(child.waitingForRunTimer);
			child.waitingForRunTimer = undefined;
			void attachChildToRun(child, run, ctx);
		}, 1000);
	}

	function startInboxPolling(child: ActiveChild, ctx: ExtensionCommandContext): void {
		if (child.pollTimer) clearInterval(child.pollTimer);
		child.pollTimer = setInterval(() => {
			void pollChildInbox(child, ctx);
		}, 750);
	}

	async function pollChildInbox(child: ActiveChild, ctx: ExtensionCommandContext): Promise<void> {
		const run = child.run;
		if (!run) return;
		const envelopes = readJsonl<AgentRequestEnvelope>(inboxPath(run, child.agentId));
		for (const envelope of envelopes) {
			if (child.processedEnvelopeIds.has(envelope.envelopeId)) continue;
			if (envelope.type !== "agent_request" || envelope.toAgentId !== child.agentId) continue;
			if (child.processingEnvelopeId || !ctx.isIdle()) {
				child.processedEnvelopeIds.add(envelope.envelopeId);
				appendTraceEvent(run, child.agentId, "busy_rejected", { envelope }, `ipc-${envelope.envelopeId}`);
				writeResponse(run, {
					type: "agent_response",
					envelopeId: envelope.envelopeId,
					runId: run.taskId,
					fromAgentId: child.agentId,
					toAgentId: "orchestrator",
					status: "busy",
					completedAt: new Date().toISOString(),
					error: "Child agent is busy.",
					trace: { htmlPath: join(run.paths.traceHtmlDir, `${child.agentId}.html`), anchor: `#ipc-${envelope.envelopeId}` },
				});
				continue;
			}
			await handleChildEnvelope(child, ctx, envelope);
		}
	}

	async function handleChildEnvelope(child: ActiveChild, ctx: ExtensionCommandContext, envelope: AgentRequestEnvelope): Promise<void> {
		const run = child.run;
		if (!run) return;
		child.processingEnvelopeId = envelope.envelopeId;
		child.processedEnvelopeIds.add(envelope.envelopeId);
		child.lastAgentEndMessages = undefined;
		updateRegistryStatus(run, child.agentId, "running");
		appendTraceEvent(run, child.agentId, "ipc_envelope_received", { envelope }, `ipc-${envelope.envelopeId}`);
		const startedAt = new Date().toISOString();
		const prompt = getEnvelopePrompt(child, envelope);
		child.acceptedEnvelopeCount += 1;
		appendTraceEvent(run, child.agentId, "input_received", { source: "ipc", injectedUserMessage: prompt, envelopeId: envelope.envelopeId });
		try {
			const waitForEnd = new Promise<void>((resolve) => {
				child.resolveAgentEnd = resolve;
			});
			pi.sendUserMessage(prompt);
			await Promise.race([
				waitForEnd,
				new Promise<void>((resolve) => setTimeout(resolve, 30 * 60 * 1000)),
			]);
			const assistant = lastAssistant(child.lastAgentEndMessages);
			const status = assistant?.stopReason === "error" || assistant?.stopReason === "aborted" ? "failed" : "completed";
			writeResponse(run, {
				type: "agent_response",
				envelopeId: envelope.envelopeId,
				runId: run.taskId,
				fromAgentId: child.agentId,
				toAgentId: "orchestrator",
				status,
				startedAt,
				completedAt: new Date().toISOString(),
				finalAssistantText: textFromMessage(assistant),
				finalAssistantMessage: assistant,
				error: status === "failed" ? assistant?.errorMessage ?? "Child agent failed." : null,
				trace: { htmlPath: join(run.paths.traceHtmlDir, `${child.agentId}.html`), anchor: `#ipc-${envelope.envelopeId}` },
			});
		} catch (error) {
			writeResponse(run, {
				type: "agent_response",
				envelopeId: envelope.envelopeId,
				runId: run.taskId,
				fromAgentId: child.agentId,
				toAgentId: "orchestrator",
				status: "failed",
				startedAt,
				completedAt: new Date().toISOString(),
				error: error instanceof Error ? error.message : String(error),
				trace: { htmlPath: join(run.paths.traceHtmlDir, `${child.agentId}.html`), anchor: `#ipc-${envelope.envelopeId}` },
			});
		} finally {
			child.processingEnvelopeId = undefined;
			child.resolveAgentEnd = undefined;
			updateRegistryStatus(run, child.agentId, "idle");
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		resetSessionState();
		deactivateOrchestratorTools(pi);
		ctx.ui.setStatus("multi-agent", undefined);
		ctx.ui.setStatus("multi-agent-child", undefined);
		ctx.ui.setWidget("multi-agent", undefined);
		ctx.ui.setWidget("multi-agent-child", undefined);
	});

	pi.on("session_shutdown", async () => {
		if (activeRun) {
			const agentId = activeChild?.agentId ?? "orchestrator";
			updateRegistryStatus(activeRun, agentId, "stopped");
		}
		resetSessionState();
	});

	pi.on("input", async (event, ctx) => {
		if (activeChild && event.source === "interactive") {
			ctx.ui.notify("This Pi instance is in child-agent observe-only mode. Talk to the orchestrator instead.", "info");
			return { action: "handled" as const };
		}
		if (activeRun && !activeChild && event.source === "interactive" && !ctx.isIdle()) {
			ctx.ui.notify("The orchestrator is busy. Wait for the current turn to finish before sending another message.", "info");
			return { action: "handled" as const };
		}
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", async (event) => {
		if (activeChild?.run) {
			const systemPrompt = `${event.systemPrompt}\n\n${buildChildSystemPrompt(activeChild.agent)}`;
			appendTraceEvent(activeChild.run, activeChild.agentId, "before_agent_start", { prompt: event.prompt, systemPrompt });
			appendTraceEvent(activeChild.run, activeChild.agentId, "system_prompt_snapshot", { systemPrompt });
			return { systemPrompt };
		}
		if (!activeRun) return;
		const systemPrompt = `${event.systemPrompt}\n\n${buildOrchestratorSystemPrompt(activeRun)}`;
		appendTraceEvent(activeRun, "orchestrator", "before_agent_start", { prompt: event.prompt, systemPrompt });
		appendTraceEvent(activeRun, "orchestrator", "system_prompt_snapshot", { systemPrompt });
		return { systemPrompt };
	});

	pi.on("before_provider_request", (event) => {
		if (activeChild?.run) appendTraceEvent(activeChild.run, activeChild.agentId, "provider_request_snapshot", { payload: event.payload });
		else if (activeRun) appendTraceEvent(activeRun, "orchestrator", "provider_request_snapshot", { payload: event.payload });
	});

	pi.on("message_start", (event) => {
		const run = activeChild?.run ?? activeRun;
		const agentId = activeChild?.agentId ?? (activeRun ? "orchestrator" : undefined);
		if (run && agentId) appendTraceEvent(run, agentId, "message_start", { message: event.message });
	});

	pi.on("message_end", (event) => {
		const run = activeChild?.run ?? activeRun;
		const agentId = activeChild?.agentId ?? (activeRun ? "orchestrator" : undefined);
		if (run && agentId) appendTraceEvent(run, agentId, "message_end", { message: event.message }, messageAnchor(event.message));
	});

	pi.on("tool_execution_start", (event) => {
		const run = activeChild?.run ?? activeRun;
		const agentId = activeChild?.agentId ?? (activeRun ? "orchestrator" : undefined);
		if (run && agentId) appendTraceEvent(run, agentId, "tool_execution_start", event, `tool-${event.toolCallId}`);
	});

	pi.on("tool_execution_end", (event) => {
		const run = activeChild?.run ?? activeRun;
		const agentId = activeChild?.agentId ?? (activeRun ? "orchestrator" : undefined);
		if (run && agentId) appendTraceEvent(run, agentId, "tool_execution_end", event, `tool-${event.toolCallId}-end`);
	});

	pi.on("turn_end", (event) => {
		const run = activeChild?.run ?? activeRun;
		const agentId = activeChild?.agentId ?? (activeRun ? "orchestrator" : undefined);
		if (run && agentId) appendTraceEvent(run, agentId, "turn_end", event);
	});

	pi.on("agent_end", (event) => {
		const run = activeChild?.run ?? activeRun;
		const agentId = activeChild?.agentId ?? (activeRun ? "orchestrator" : undefined);
		if (run && agentId) appendTraceEvent(run, agentId, "agent_end", { messages: event.messages });
		if (activeChild?.processingEnvelopeId) {
			activeChild.lastAgentEndMessages = event.messages;
			activeChild.resolveAgentEnd?.();
		}
	});

	pi.registerCommand("child-agent", {
		description: "Register this Pi session as an observe-only child agent: /child-agent <agent-id>",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const [agentId] = args.trim().split(/\s+/).filter(Boolean);
			if (!agentId) {
				ctx.ui.notify("Usage: /child-agent <agent-id>", "error");
				return;
			}
			await ctx.waitForIdle();
			resetSessionState();
			const config = loadMultiAgentConfig(ctx.cwd);
			const agent = findChildAgent(config, agentId);
			if (!agent) {
				ctx.ui.notify(`Unknown child agent: ${agentId}`, "error");
				return;
			}
			const child: ActiveChild = { agentId, cwd: ctx.cwd, config, agent, processedEnvelopeIds: new Set(), acceptedEnvelopeCount: 0 };
			activeChild = child;
			pi.setSessionName(`child: ${agentId}`);
			ctx.ui.setStatus("multi-agent-child", ctx.ui.theme.fg("accent", `child: ${agentId} waiting`));
			ctx.ui.setWidget("multi-agent-child", [
				`Child agent: ${agent.displayName}`,
				"Waiting for an active multi-agent run...",
				"Observe-only: direct user input is disabled.",
			]);
			const run = loadActiveRun(ctx.cwd);
			if (run) await attachChildToRun(child, run, ctx);
			else startWaitingForRun(child, ctx);
		},
	});

	pi.registerCommand("deliberate", {
		description: "Start a multi-agent deliberation run: /deliberate <task>",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const task = args.trim();
			if (!task) {
				ctx.ui.notify("Usage: /deliberate <task>", "error");
				return;
			}

			await ctx.waitForIdle();
			if (hasExistingRuntimeRun(ctx.cwd)) {
				ctx.ui.notify(`A multi-agent run already exists at ${getRunJsonPath(ctx.cwd)}. Delete scratch/multi-agent-run before starting a new run.`, "error");
				return;
			}
			resetSessionState();

			const config = loadMultiAgentConfig(ctx.cwd);
			const driver = findDriverAgent(config);
			if (!driver) {
				ctx.ui.notify("No child agent with label 'driver' found under .pi/multi-agent/child-agents/", "error");
				return;
			}

			const taskId = createUniqueTaskId(ctx.cwd, task);
			const paths = createRunPaths(ctx.cwd, taskId);
			writeFileSync(join(paths.runDir, "task.md"), `# Task\n\n${task}\n`, "utf8");
			writeFileSync(join(paths.runDir, "run.json"), `${JSON.stringify({ taskId, task, createdAt: new Date().toISOString() }, null, "\t")}\n`, "utf8");
			writeFileSync(paths.messageLogPath, "", "utf8");

			const previousActiveTools = withoutOrchestratorTools(pi.getActiveTools());
			const run: ActiveRun = { taskId, task, cwd: ctx.cwd, paths, config, previousActiveTools };
			activeRun = run;

			writeRegistry(run, makeRegistry(run, "orchestrator", "orchestrator", { displayName: "Orchestrator", status: "idle" }));
			renderIndex(run);
			startOrchestratorHeartbeat(run);
			activateOrchestratorTools(pi, previousActiveTools);
			pi.setSessionName(`deliberate: ${taskId}`);
			ctx.ui.setStatus("multi-agent", ctx.ui.theme.fg("accent", `multi-agent: ${taskId}`));
			ctx.ui.setWidget("multi-agent", [
				`Multi-agent run: ${taskId}`,
				`Run dir: ${paths.runDir}`,
				`Trace: ${join(paths.traceHtmlDir, "index.html")}`,
			]);

			ctx.ui.notify(`Started multi-agent deliberation: ${taskId}`, "info");
			await waitForInitialChildRegistration(run);
			pi.sendUserMessage(buildDeliberateKickoffPrompt(run));
		},
	});
}
