import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export const TASK_ENTRY_TYPE = "pi-subagents.task";

export type TaskStatus = "running" | "completed" | "failed" | "aborted" | "interrupted";

export interface ActivityItem {
	id: string;
	timestamp: number;
	type: "thinking" | "tool" | "info";
	label: string;
	detail?: string;
}

export interface SubagentTask {
	id: string;
	agent: string;
	description: string;
	prompt: string;
	status: TaskStatus;
	startedAt: number;
	updatedAt: number;
	completedAt?: number;
	childSessionFile?: string;
	model?: string;
	thinkingLevel?: string;
	response?: string;
	error?: string;
	activities: ActivityItem[];
}

export type PersistedTaskEvent =
	| { kind: "start"; task: Omit<SubagentTask, "activities">; timestamp: number }
	| { kind: "activity"; taskId: string; activity: ActivityItem; timestamp: number }
	| {
			kind: "finish";
			taskId: string;
			status: TaskStatus;
			response?: string;
			error?: string;
			completedAt: number;
			timestamp: number;
	  };

type Listener = () => void;

export class SubagentState {
	private tasks = new Map<string, SubagentTask>();
	private listeners = new Set<Listener>();

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	notify(): void {
		for (const listener of this.listeners) listener();
	}

	clear(): void {
		this.tasks.clear();
		this.notify();
	}

	upsert(task: SubagentTask): void {
		this.tasks.set(task.id, task);
		this.notify();
	}

	get(id: string): SubagentTask | undefined {
		return this.tasks.get(id);
	}

	list(): SubagentTask[] {
		return [...this.tasks.values()].sort((a, b) => b.startedAt - a.startedAt);
	}

	addActivity(taskId: string, activity: ActivityItem): void {
		const task = this.tasks.get(taskId);
		if (!task) return;
		task.activities.push(activity);
		task.updatedAt = activity.timestamp;
		this.notify();
	}

	finish(taskId: string, status: TaskStatus, response?: string, error?: string): void {
		const task = this.tasks.get(taskId);
		if (!task) return;
		const now = Date.now();
		task.status = status;
		task.response = response;
		task.error = error;
		task.completedAt = now;
		task.updatedAt = now;
		this.notify();
	}

	restoreFromEntries(entries: SessionEntry[]): SubagentTask[] {
		this.tasks.clear();
		for (const entry of entries) {
			if (entry.type !== "custom" || entry.customType !== TASK_ENTRY_TYPE) continue;
			const event = entry.data as PersistedTaskEvent | undefined;
			if (!event || typeof event !== "object") continue;
			this.applyPersistedEvent(event);
		}

		const interrupted: SubagentTask[] = [];
		for (const task of this.tasks.values()) {
			if (task.status === "running") {
				task.status = "interrupted";
				task.completedAt = Date.now();
				task.updatedAt = task.completedAt;
				task.error = "Pi stopped before this sub-agent returned a final result.";
				interrupted.push(task);
			}
		}
		this.notify();
		return interrupted;
	}

	private applyPersistedEvent(event: PersistedTaskEvent): void {
		if (event.kind === "start") {
			this.tasks.set(event.task.id, { ...event.task, activities: [] });
			return;
		}

		const task = this.tasks.get(event.taskId);
		if (!task) return;

		if (event.kind === "activity") {
			task.activities.push(event.activity);
			task.updatedAt = event.timestamp;
			return;
		}

		if (event.kind === "finish") {
			task.status = event.status;
			task.response = event.response;
			task.error = event.error;
			task.completedAt = event.completedAt;
			task.updatedAt = event.timestamp;
		}
	}
}

export function createTask(input: {
	agent: string;
	description: string;
	prompt: string;
	childSessionFile?: string;
	model?: string;
	thinkingLevel?: string;
}): SubagentTask {
	const now = Date.now();
	const id = `subagent-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	return {
		id,
		agent: input.agent,
		description: input.description,
		prompt: input.prompt,
		status: "running",
		startedAt: now,
		updatedAt: now,
		childSessionFile: input.childSessionFile,
		model: input.model,
		thinkingLevel: input.thinkingLevel,
		activities: [],
	};
}

export function makeActivity(type: ActivityItem["type"], label: string, detail?: string): ActivityItem {
	return {
		id: `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
		timestamp: Date.now(),
		type,
		label,
		detail,
	};
}
