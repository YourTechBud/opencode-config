import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
	ActiveRun,
	AgentRegistryEntry,
	AgentRequestEnvelope,
	AgentResponseEnvelope,
	AgentResponseStatus,
	ChildAgentConfig,
	ChildAgentResponse,
	SendAgentMessagesParams,
} from "./types.ts";
import { appendTraceEvent } from "./trace.ts";

const FANOUT_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_MS = 500;
const HEARTBEAT_STALE_MS = 2 * 60 * 1000;

export function makeId(prefix: string): string {
	return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function ensureParent(path: string): void {
	mkdirSync(dirname(path), { recursive: true });
}

export function readJsonl<T = any>(path: string): T[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as T];
			} catch {
				return [];
			}
		});
}

export function appendJsonl(path: string, value: unknown): void {
	ensureParent(path);
	appendFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

export function inboxPath(run: ActiveRun, agentId: string): string {
	return join(run.paths.inboxDir, `${agentId}.jsonl`);
}

export function orchestratorResponsePath(run: ActiveRun): string {
	return join(run.paths.responseDir, "orchestrator.jsonl");
}

export function registryPath(run: ActiveRun, agentId: string): string {
	return join(run.paths.registryDir, `${agentId}.json`);
}

export function writeRegistry(run: ActiveRun, entry: AgentRegistryEntry): void {
	mkdirSync(run.paths.registryDir, { recursive: true });
	writeFileSync(registryPath(run, entry.agentId), `${JSON.stringify(entry, null, "\t")}\n`, "utf8");
	appendTraceEvent(run, entry.agentId, "agent_registered", { registry: entry });
}

export function updateRegistryStatus(run: ActiveRun, agentId: string, status: AgentRegistryEntry["status"]): void {
	const path = registryPath(run, agentId);
	if (!existsSync(path)) return;
	try {
		const entry = JSON.parse(readFileSync(path, "utf8")) as AgentRegistryEntry;
		entry.status = status;
		entry.lastHeartbeatAt = new Date().toISOString();
		writeFileSync(path, `${JSON.stringify(entry, null, "\t")}\n`, "utf8");
	} catch {}
}

export function readRegistry(run: ActiveRun): AgentRegistryEntry[] {
	if (!existsSync(run.paths.registryDir)) return [];
	return readdirSync(run.paths.registryDir)
		.filter((name) => name.endsWith(".json"))
		.flatMap((name) => {
			try {
				return [JSON.parse(readFileSync(join(run.paths.registryDir, name), "utf8")) as AgentRegistryEntry];
			} catch {
				return [];
			}
		});
}

export function readHealthyRegistry(run: ActiveRun): AgentRegistryEntry[] {
	const now = Date.now();
	return readRegistry(run).filter((entry) => now - Date.parse(entry.lastHeartbeatAt) <= HEARTBEAT_STALE_MS);
}

export function createRequestEnvelope(
	run: ActiveRun,
	toAgentId: string,
	params: SendAgentMessagesParams,
	toolCallId?: string,
	broadcastId = makeId("broadcast"),
): AgentRequestEnvelope {
	const addendum = params.perRecipientAddenda?.[toAgentId]?.trim();
	const message = addendum
		? `${params.message}\n\n## Recipient-specific addendum\n\n${addendum}`
		: params.message;
	return {
		type: "agent_request",
		envelopeId: makeId("env"),
		runId: run.taskId,
		fromAgentId: "orchestrator",
		toAgentId,
		sentAt: new Date().toISOString(),
		message,
		metadata: { toolCallId, broadcastId, perRecipientAddendum: addendum },
	};
}

export function sendEnvelope(run: ActiveRun, envelope: AgentRequestEnvelope): void {
	appendJsonl(inboxPath(run, envelope.toAgentId), envelope);
	appendTraceEvent(run, "orchestrator", "ipc_envelope_sent", { envelope }, `ipc-${envelope.envelopeId}`);
}

export function writeResponse(run: ActiveRun, response: AgentResponseEnvelope): void {
	appendJsonl(orchestratorResponsePath(run), response);
	appendTraceEvent(run, response.fromAgentId, "ipc_envelope_sent", { envelope: response }, `ipc-response-${response.envelopeId}`);
}

export async function waitForResponses(
	run: ActiveRun,
	envelopes: AgentRequestEnvelope[],
	onProgress?: (message: string) => void,
	signal?: AbortSignal,
): Promise<AgentResponseEnvelope[]> {
	const wanted = new Set(envelopes.map((envelope) => envelope.envelopeId));
	const started = Date.now();
	const seen = new Map<string, AgentResponseEnvelope>();
	while (seen.size < wanted.size) {
		if (signal?.aborted) break;
		for (const response of readJsonl<AgentResponseEnvelope>(orchestratorResponsePath(run))) {
			if (wanted.has(response.envelopeId) && !seen.has(response.envelopeId)) {
				seen.set(response.envelopeId, response);
				onProgress?.(`${response.fromAgentId}: ${response.status}`);
			}
		}
		if (seen.size >= wanted.size) break;
		if (Date.now() - started > FANOUT_TIMEOUT_MS) break;
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}

	const completedAt = new Date().toISOString();
	return envelopes.map((envelope) => {
		const existing = seen.get(envelope.envelopeId);
		if (existing) return existing;
		return {
			type: "agent_response",
			envelopeId: envelope.envelopeId,
			runId: run.taskId,
			fromAgentId: envelope.toAgentId,
			toAgentId: "orchestrator",
			status: "expired" as AgentResponseStatus,
			completedAt,
			error: "Timed out waiting for child response.",
			trace: {
				htmlPath: join(run.paths.traceHtmlDir, `${envelope.toAgentId}.html`),
				anchor: `#ipc-${envelope.envelopeId}`,
			},
		};
	});
}

export function toChildAgentResponses(run: ActiveRun, responses: AgentResponseEnvelope[], childAgents: ChildAgentConfig[]): ChildAgentResponse[] {
	return responses.map((response) => {
		const config = childAgents.find((agent) => agent.id === response.fromAgentId);
		return {
			agentId: response.fromAgentId,
			displayName: config?.displayName ?? response.fromAgentId,
			status: response.status,
			response: response.finalAssistantText ?? response.error ?? "",
			envelopeId: response.envelopeId,
			error: response.error,
			trace: response.trace,
		};
	});
}
