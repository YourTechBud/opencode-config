import { appendFileSync } from "node:fs";
import { DefaultResourceLoader, createAgentSession, getAgentDir, SessionManager } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ActiveRun, ChildAgentConfig, ChildAgentResponse, ChildRuntime, SendAgentMessagesParams } from "./types.ts";
import { findChildAgent } from "./config.ts";
import { applySkillCommandPrefix, buildChildSystemPrompt } from "./prompts.ts";
import type { ActivityPanelController } from "./ui.ts";

function textFromMessage(message: any): string {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
}

function lastAssistantText(session: { messages: any[] }): string {
	for (let i = session.messages.length - 1; i >= 0; i--) {
		const message = session.messages[i];
		if (message?.role === "assistant") return textFromMessage(message);
	}
	return "";
}

function parseModelSpec(spec: string): { provider: string; id: string } | undefined {
	const [provider, ...rest] = spec.split("/");
	const id = rest.join("/");
	if (!provider || !id) return undefined;
	return { provider, id };
}

function resolveModel(ctx: ExtensionContext, config: ChildAgentConfig, run: ActiveRun): Model<any> | undefined {
	const modelSpec = config.model ?? run.config.settings.defaults.model ?? "inherit";
	if (modelSpec === "inherit") return ctx.model;
	const parsed = parseModelSpec(modelSpec);
	if (!parsed) return ctx.model;
	const candidate = ctx.modelRegistry.find(parsed.provider, parsed.id);
	if (!candidate) return ctx.model;
	const hasAuth = (ctx.modelRegistry as any).hasConfiguredAuth?.(candidate);
	return hasAuth === false ? ctx.model : candidate;
}

function formatMessageForRecipient(base: string, addendum?: string): string {
	if (!addendum?.trim()) return base;
	return `${base}\n\n## Recipient-specific addendum\n\n${addendum.trim()}`;
}

export class ChildSessionManager {
	private runtimes = new Map<string, ChildRuntime>();

	constructor(
		private readonly run: ActiveRun,
		private readonly activity: ActivityPanelController,
	) {}

	listActiveAgentIds(): string[] {
		return Array.from(this.runtimes.keys()).map((key) => key.split("::")[1] ?? key);
	}

	dispose(): void {
		for (const runtime of this.runtimes.values()) {
			try {
				runtime.unsubscribe();
			} catch {}
			try {
				runtime.session.dispose();
			} catch {}
		}
		this.runtimes.clear();
	}

	async sendMessages(
		ctx: ExtensionContext,
		params: SendAgentMessagesParams,
		onProgress?: (message: string) => void,
	): Promise<ChildAgentResponse[]> {
		const taskId = params.taskId || this.run.taskId;
		const recipients = [...new Set(params.recipients.map((id) => id.trim()).filter(Boolean))];
		if (recipients.length === 0) throw new Error("send_agent_messages requires at least one recipient.");

		onProgress?.(`Sending message to ${recipients.join(", ")}...`);
		const responses = await Promise.all(
			recipients.map(async (agentId) => {
				const addendum = params.perRecipientAddenda?.[agentId];
				return this.sendOne(ctx, taskId, agentId, formatMessageForRecipient(params.message, addendum), onProgress);
			}),
		);

		this.logEnvelope(taskId, recipients, params.message, params.perRecipientAddenda, responses);
		return responses;
	}

	private runtimeKey(taskId: string, agentId: string): string {
		return `${taskId}::${agentId}`;
	}

	private async getOrCreateRuntime(ctx: ExtensionContext, taskId: string, agentId: string): Promise<{ runtime: ChildRuntime; created: boolean }> {
		const key = this.runtimeKey(taskId, agentId);
		const existing = this.runtimes.get(key);
		if (existing) return { runtime: existing, created: false };

		const config = findChildAgent(this.run.config, agentId);
		if (!config) throw new Error(`Unknown child agent: ${agentId}`);

		const cwd = this.run.config.settings.childAgents.cwd === "inherit" ? this.run.cwd : this.run.config.settings.childAgents.cwd;
		const loader = new DefaultResourceLoader({
			cwd,
			agentDir: getAgentDir(),
			noExtensions: true,
			appendSystemPromptOverride: (base) => [...base, buildChildSystemPrompt(config)],
		});
		await loader.reload();

		const model = resolveModel(ctx, config, this.run);
		const { session } = await createAgentSession({
			cwd,
			agentDir: getAgentDir(),
			model,
			thinkingLevel: config.thinkingLevel as any,
			tools: config.tools,
			modelRegistry: ctx.modelRegistry,
			resourceLoader: loader,
			sessionManager: SessionManager.inMemory(cwd),
		});

		const runtime: ChildRuntime = {
			agentId,
			session,
			config,
			unsubscribe: session.subscribe((event) => this.onSessionEvent(agentId, event)),
		};
		this.runtimes.set(key, runtime);
		this.activity.addEvent(agentId, "info", `Created child agent from ${config.filePath}`);
		if (config.skillCommands.length > 0) {
			this.activity.addEvent(agentId, "info", `Configured skill commands: ${config.skillCommands.join(", ")}`);
		}
		return { runtime, created: true };
	}

	private onSessionEvent(agentId: string, event: AgentSessionEvent): void {
		switch (event.type) {
			case "agent_start":
				this.activity.addEvent(agentId, "info", "Agent turn started");
				break;
			case "message_update": {
				const assistantEvent = (event as any).assistantMessageEvent;
				if (assistantEvent?.type === "text_delta" && typeof assistantEvent.delta === "string") {
					this.activity.appendAssistantDelta(agentId, assistantEvent.delta);
				}
				break;
			}
			case "tool_execution_start":
				this.activity.addEvent(agentId, "tool", `Started tool: ${(event as any).toolName}`);
				break;
			case "tool_execution_end":
				this.activity.addEvent(
					agentId,
					(event as any).isError ? "error" : "tool",
					`${(event as any).isError ? "Tool failed" : "Tool finished"}: ${(event as any).toolName}`,
				);
				break;
			case "agent_end":
				this.activity.addEvent(agentId, "info", "Agent turn ended");
				break;
		}
	}

	private async sendOne(
		ctx: ExtensionContext,
		taskId: string,
		agentId: string,
		message: string,
		onProgress?: (message: string) => void,
	): Promise<ChildAgentResponse> {
		const { runtime, created } = await this.getOrCreateRuntime(ctx, taskId, agentId);
		const prompt = created ? applySkillCommandPrefix(runtime.config, message) : message;
		this.activity.addEvent(agentId, "user", message);
		onProgress?.(`${created ? "Created and sent to" : "Sent to"} ${agentId}`);

		if (runtime.session.isStreaming) {
			await runtime.session.agent.waitForIdle();
		}
		await runtime.session.prompt(prompt, { source: "extension" });
		const response = lastAssistantText(runtime.session);
		return { agentId, displayName: runtime.config.displayName, response };
	}

	private logEnvelope(
		taskId: string,
		recipients: string[],
		message: string,
		perRecipientAddenda: Record<string, string> | undefined,
		responses: ChildAgentResponse[],
	): void {
		const entry = {
			timestamp: new Date().toISOString(),
			taskId,
			recipients,
			message,
			perRecipientAddenda: perRecipientAddenda ?? {},
			responses,
		};
		appendFileSync(this.run.paths.messageLogPath, `${JSON.stringify(entry)}\n`, "utf8");
	}
}
