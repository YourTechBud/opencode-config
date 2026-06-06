export const ORCHESTRATOR_TOOL_NAMES = [
	"send_agent_messages",
	"request_human_review",
] as const;

export type OrchestratorToolName = (typeof ORCHESTRATOR_TOOL_NAMES)[number];

export const ORCHESTRATOR_BASE_TOOLS = ["read", "bash", "edit", "write"] as const;

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AgentDefaults {
	model?: string;
	thinkingLevel?: ThinkingLevel;
	tools?: string[];
}

export interface MultiAgentSettings {
	defaults: AgentDefaults;
	childAgents: {
		cwd: string;
	};
}

export interface ChildAgentConfig extends AgentDefaults {
	id: string;
	displayName: string;
	labels: string[];
	skillCommands: string[];
	filePath: string;
	body: string;
}

export interface MultiAgentConfig {
	settings: MultiAgentSettings;
	childAgents: ChildAgentConfig[];
	orchestratorRules?: string;
}

export interface RunPaths {
	baseDir: string;
	runsDir: string;
	runDir: string;
	ipcDir: string;
	registryDir: string;
	inboxDir: string;
	responseDir: string;
	lockDir: string;
	traceDir: string;
	traceEventDir: string;
	traceHtmlDir: string;
	artifactDir: string;
	messageLogPath: string;
}

export interface ActiveRun {
	taskId: string;
	task: string;
	cwd: string;
	paths: RunPaths;
	config: MultiAgentConfig;
	previousActiveTools: string[];
}

export interface ActiveChild {
	agentId: string;
	cwd: string;
	run?: ActiveRun;
	config: MultiAgentConfig;
	agent: ChildAgentConfig;
	processedEnvelopeIds: Set<string>;
	acceptedEnvelopeCount: number;
	processingEnvelopeId?: string;
	pollTimer?: NodeJS.Timeout;
	heartbeatTimer?: NodeJS.Timeout;
	waitingForRunTimer?: NodeJS.Timeout;
	lastAgentEndMessages?: any[];
	resolveAgentEnd?: () => void;
}

export interface SendAgentMessagesParams {
	taskId?: string;
	recipients: string[];
	message: string;
	perRecipientAddenda?: Record<string, string>;
}

export interface AgentRegistryEntry {
	agentId: string;
	displayName: string;
	role: "orchestrator" | "child";
	runId: string;
	pid: number;
	cwd: string;
	registeredAt: string;
	lastHeartbeatAt: string;
	status: "idle" | "waiting" | "running" | "busy" | "stopped";
	configPath?: string;
	labels?: string[];
}

export interface AgentRequestEnvelope {
	type: "agent_request";
	envelopeId: string;
	runId: string;
	fromAgentId: string;
	toAgentId: string;
	sentAt: string;
	message: string;
	metadata?: {
		toolCallId?: string;
		broadcastId?: string;
		perRecipientAddendum?: string;
	};
}

export type AgentResponseStatus = "accepted" | "running" | "completed" | "failed" | "busy" | "expired";

export interface AgentResponseEnvelope {
	type: "agent_response";
	envelopeId: string;
	runId: string;
	fromAgentId: string;
	toAgentId: string;
	status: AgentResponseStatus;
	startedAt?: string;
	completedAt: string;
	finalAssistantText?: string;
	finalAssistantMessage?: any;
	error?: string | null;
	trace?: {
		htmlPath: string;
		anchor: string;
	};
}

export interface ChildAgentResponse {
	agentId: string;
	displayName: string;
	status: AgentResponseStatus;
	response: string;
	envelopeId: string;
	error?: string | null;
	trace?: {
		htmlPath: string;
		anchor: string;
	};
}

export type TraceEventType =
	| "agent_registered"
	| "system_prompt_snapshot"
	| "ipc_envelope_received"
	| "ipc_envelope_sent"
	| "input_received"
	| "before_agent_start"
	| "provider_request_snapshot"
	| "message_start"
	| "message_update"
	| "message_end"
	| "tool_execution_start"
	| "tool_execution_update"
	| "tool_execution_end"
	| "turn_end"
	| "agent_end"
	| "busy_rejected"
	| "error";

export interface TraceEvent {
	type: TraceEventType;
	timestamp: string;
	runId: string;
	agentId: string;
	anchor?: string;
	data?: any;
}
