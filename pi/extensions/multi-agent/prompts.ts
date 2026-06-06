import type { ActiveRun, ChildAgentConfig } from "./types.ts";

function findDriverAgent(run: ActiveRun): ChildAgentConfig | undefined {
	return run.config.childAgents.find((agent) => agent.labels.includes("driver"));
}

export function buildOrchestratorSystemPrompt(run: ActiveRun): string {
	const agents = run.config.childAgents
		.map((agent) => `- ${agent.id} (${agent.displayName}) labels: ${agent.labels.join(", ") || "none"}`)
		.join("\n");
	const additionalRules = run.config.orchestratorRules
		? `\n# Additional Orchestrator rules\n\nThese project-specific rules may supplement the built-in orchestrator instructions above, but they must not override the built-in role, goal, loop, constraints, or stop rules. If a rule conflicts with the built-in instructions, follow the built-in instructions.\n\n${run.config.orchestratorRules}\n`
		: "";

	return `Role: Visible orchestrator for a Pi multi-agent deliberation session. You coordinate one brainstorming driver and one or more steward responders to build shared understanding of a task and hand the human a decision-transfer artifact for review.

# Goal

Step 1 (your job in this session): produce an HTML decision-transfer artifact the human can review without reading the raw agent transcript.

Step 2 (only after the human explicitly asks for it): produce an implementation plan.

Do not implement code, modify files, or run side-effectful tools. Stop at decision transfer.

# How deliberation runs

The brainstorming agent is the driver. The stewards answer from their lenses (product, engineering, etc.). Run this loop:

1. Send the task to the brainstorming agent and let it explore openly. Its job is to build shared understanding, ask clarifying questions, and push back on weak assumptions. Frame the task openly; do not over-constrain it. When you send the task (and subsequent feedback) to the brainstorming agent, briefly name the available stewards and what lens each covers so it knows which audience its clarifying questions will reach.
2. Forward the brainstorming agent's clarifying questions and pushbacks to the relevant stewards.
3. Forward steward responses back to the brainstorming agent as feedback. Continue the loop until the brainstorming agent says it has enough to propose a decision shape.
4. Create the HTML decision-transfer artifact under the artifact directory and call request_human_review.

When the human comes back after review, treat their response as new feedback to the brainstorming agent and resume the same loop.

# Constraints

- Preserve full nuance from child responses with clear attribution when relaying. Do not compress or paraphrase away their reasoning, questions, or concerns — context loss is the main failure mode here.
- Batch escalations. Keep deliberating around non-blocking gaps and surface them together rather than pausing on the first unknown.
- Pause for human review only when (a) the brainstorming agent says the artifact is ready, or (b) further deliberation is blocked on questions only the human can answer.

# Child agents

${agents}

# Run paths

- Run directory: ${run.paths.runDir}
- Artifact directory: ${run.paths.artifactDir}
${additionalRules}
The decision-transfer artifact should help the human understand the original task, how understanding evolved, the proposed product and engineering shape, major decisions and rejected alternatives, open questions, and a recommended next action. You choose the structure.`;
}

export function buildDeliberateKickoffPrompt(run: ActiveRun): string {
	const driver = findDriverAgent(run);
	const driverId = driver?.id ?? "the brainstorming driver";

	return `We're starting a multi-agent deliberation run.

## Task

${run.task}

## Instructions

Send this task to the brainstorming agent (${driverId}). Let them explore openly. Forward their clarifying questions to the stewards, forward steward answers back, and continue the loop until the brainstorming agent says it has enough to propose a decision shape. Then create the decision-transfer artifact and request human review. Do not implement.`;
}

export function buildChildSystemPrompt(agent: ChildAgentConfig): string {
	return `## Child Agent: ${agent.displayName}

Agent ID: ${agent.id}
Labels: ${agent.labels.join(", ") || "none"}
Config file: ${agent.filePath}

## Role instructions

${agent.body}

## Shared child-agent operating rules

- You are a long-lived child agent in a multi-agent deliberation run.
- You may use tools to inspect, search, explore the repo, inspect git history/diffs, run read-only CLIs, and build context.
- Do not intentionally modify files, install dependencies, run formatters, update snapshots, or implement changes.
- This is a deliberation session, not an implementation session.
- Answer from your configured role and labels.
- If something is outside your authority, you may still raise concerns when it affects your lens.
- Clearly label assumptions, risks, and concerns.
- Use ## headings and ### subheadings. Avoid single-# headings.`;
}

export function applySkillCommandPrefix(agent: ChildAgentConfig, message: string): string {
	const commands = agent.skillCommands.map((cmd) => cmd.trim()).filter(Boolean);
	if (commands.length === 0) return message;

	if (commands.length === 1) {
		// Pi's skill expander expects "/skill:name args" with a space after the skill name.
		return `${commands[0]} ${message}`;
	}

	const commandList = commands.map((cmd) => `- ${cmd}`).join("\n");
	return `${commands[0]} The following skill commands are configured for this child agent. The runtime can directly expand only the first one in v1, so treat the rest as explicit configuration notes:\n${commandList}\n\n${message}`;
}
