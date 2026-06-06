import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createRequestEnvelope, readHealthyRegistry, sendEnvelope, toChildAgentResponses, waitForResponses } from "./ipc.ts";
import type { ActiveRun } from "./types.ts";
import { ORCHESTRATOR_TOOL_NAMES } from "./types.ts";
import { appendTraceEvent } from "./trace.ts";

function requireRun(getActiveRun: () => ActiveRun | undefined): ActiveRun {
	const run = getActiveRun();
	if (!run) throw new Error("No active multi-agent deliberation run. Start one with /deliberate <task>.");
	return run;
}

function content(text: string, details: Record<string, unknown> = {}) {
	return { content: [{ type: "text" as const, text }], details };
}

function resolveArtifactPath(run: ActiveRun, artifactPath: string): string {
	if (isAbsolute(artifactPath)) return artifactPath;
	const fromRun = resolve(run.paths.runDir, artifactPath);
	if (existsSync(fromRun)) return fromRun;
	const fromArtifacts = resolve(run.paths.artifactDir, artifactPath);
	if (existsSync(fromArtifacts)) return fromArtifacts;
	return resolve(run.cwd, artifactPath);
}

export function registerMultiAgentTools(pi: ExtensionAPI, getActiveRun: () => ActiveRun | undefined): void {
	pi.registerTool({
		name: "send_agent_messages",
		label: "Send Agent Messages",
		description: "Send one message to one or more active child Pi agents over the filesystem mailbox and return their full responses. Blocks until every child responds or the 30-minute timeout expires.",
		promptSnippet: "Send messages to active child agents and get their responses",
		promptGuidelines: [
			"Use send_agent_messages to communicate with active child agents; preserve full child-agent responses when relaying them.",
			"send_agent_messages supports broadcast via the recipients array and optional perRecipientAddenda for role-specific nuance.",
		],
		parameters: Type.Object({
			taskId: Type.Optional(Type.String({ description: "Optional task ID. Defaults to the active run task ID." })),
			recipients: Type.Array(Type.String(), { description: "Child agent IDs to send to." }),
			message: Type.String({ description: "Full message to send to the child agents." }),
			perRecipientAddenda: Type.Optional(
				Type.Record(Type.String(), Type.String(), {
					description: "Optional recipient-specific addenda keyed by child agent ID.",
				}),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, _ctx: ExtensionContext) {
			const run = requireRun(getActiveRun);
			const active = readHealthyRegistry(run).filter((entry) => entry.role === "child");
			const requested = [...new Set(params.recipients.map((recipient) => recipient.trim()).filter(Boolean))];
			if (requested.length === 0) throw new Error("send_agent_messages requires at least one recipient.");

			const missing = requested.filter((id) => !active.some((entry) => entry.agentId === id));
			if (missing.length > 0) {
				return content(`No active child agent(s): ${missing.join(", ")}\n\nStart them with /child-agent <agent-id> and try again.`, {
					missing,
					active,
				});
			}

			const broadcastId = randomUUID();
			const envelopes = requested.map((recipient) => createRequestEnvelope(run, recipient, params, toolCallId, broadcastId));
			for (const envelope of envelopes) sendEnvelope(run, envelope);
			onUpdate?.({ content: [{ type: "text", text: `Sent to ${requested.join(", ")}. Waiting for responses...` }] });

			const responses = await waitForResponses(
				run,
				envelopes,
				(message) => onUpdate?.({ content: [{ type: "text", text: message }] }),
				signal,
			);
			const childResponses = toChildAgentResponses(run, responses, run.config.childAgents);
			const responseText = childResponses
				.map((response) => {
					const traceLink = response.trace ? `\n\nTrace: ${response.trace.htmlPath}${response.trace.anchor}` : "";
					return `## ${response.displayName} (${response.agentId}) — ${response.status}\n\n${response.response || response.error || "(no response)"}${traceLink}`;
				})
				.join("\n\n---\n\n");
			appendTraceEvent(run, "orchestrator", "tool_execution_end", { toolName: "send_agent_messages", result: childResponses });
			return content(responseText || "No responses.", { responses: childResponses });
		},
	});

	pi.registerTool({
		name: "request_human_review",
		label: "Request Human Review",
		description: "Request blocking human review of an artifact. Call only after creating a sufficient review artifact and when you intend to end the turn.",
		promptSnippet: "Pause deliberation for human review of an artifact",
		promptGuidelines: [
			"Use request_human_review only when you intend to stop and wait for human input.",
			"Before calling request_human_review, create an HTML artifact under the active run artifact directory that contains enough context for the human to answer without reading the raw transcript.",
		],
		parameters: Type.Object({
			reviewType: Type.Union([
				Type.Literal("escalation"),
				Type.Literal("decision-transfer"),
				Type.Literal("implementation-plan"),
				Type.Literal("other"),
			]),
			artifactPath: Type.String({ description: "Path to the artifact the human should open. Relative paths are resolved from the run directory/artifact directory first." }),
			summary: Type.String({ description: "Short summary of what the human should review." }),
			questionsForHuman: Type.Array(Type.String(), { description: "Specific questions or decisions for the human." }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const run = requireRun(getActiveRun);
			const absolutePath = resolveArtifactPath(run, params.artifactPath);
			if (!existsSync(absolutePath)) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Artifact not found: ${absolutePath}\n\nCreate the review artifact first, then call request_human_review again.`,
						},
					],
					details: { absolutePath },
					isError: true,
				} as any;
			}
			const fileUrl = pathToFileURL(absolutePath).href;
			const questions = params.questionsForHuman.map((q, i) => `${i + 1}. ${q}`).join("\n");
			const text = `Human review requested.\n\nArtifact: ${absolutePath}\nURL: ${fileUrl}\n\nSummary:\n${params.summary}\n\nQuestions for human:\n${questions || "- Review the artifact and provide guidance."}\n\nIMPORTANT: End your turn now. Wait for the human to respond in the normal chat before continuing.`;
			appendTraceEvent(run, "orchestrator", "ipc_envelope_sent", { reviewType: params.reviewType, summary: params.summary, absolutePath, fileUrl });
			ctx.ui.notify(`Human review requested: ${absolutePath}`, "info");
			return content(text, { absolutePath, fileUrl, reviewType: params.reviewType });
		},
	});
}

export function deactivateOrchestratorTools(pi: ExtensionAPI): void {
	const active = pi.getActiveTools();
	const filtered = active.filter((tool) => !ORCHESTRATOR_TOOL_NAMES.includes(tool as any));
	if (filtered.length !== active.length) pi.setActiveTools(filtered);
}
