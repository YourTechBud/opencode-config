import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { ActivityEvent, ActivityKind, ActivityState } from "./types.ts";

const MAX_EVENTS = 1200;

export function createActivityState(): ActivityState {
	return { events: [], activeTab: "logs", tabs: ["logs"], scroll: {} };
}

function labelForKind(kind: ActivityKind): string {
	switch (kind) {
		case "user":
			return "→";
		case "assistant":
			return "←";
		case "tool":
			return "⚙";
		case "error":
			return "!";
		case "review":
			return "◆";
		case "info":
		default:
			return "•";
	}
}

function splitLines(text: string, width: number): string[] {
	const out: string[] = [];
	const paragraphs = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	for (const paragraph of paragraphs) {
		if (!paragraph) {
			out.push("");
			continue;
		}
		let current = paragraph;
		while (visibleWidth(current) > width) {
			let take = Math.max(1, width);
			while (take > 1 && visibleWidth(current.slice(0, take)) > width) take--;
			out.push(current.slice(0, take));
			current = current.slice(take);
		}
		out.push(current);
	}
	return out;
}

class ActivityPanelComponent {
	private theme: Theme;
	private onClose: () => void;

	constructor(
		private readonly state: ActivityState,
		theme: Theme,
		onClose: () => void,
	) {
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		const tabs = this.state.tabs;
		const currentIndex = Math.max(0, tabs.indexOf(this.state.activeTab));
		if (matchesKey(data, "escape")) {
			this.onClose();
			return;
		}
		if (matchesKey(data, "tab") || matchesKey(data, "right")) {
			this.state.activeTab = tabs[(currentIndex + 1) % tabs.length] ?? "logs";
			return;
		}
		if (matchesKey(data, "shift+tab") || matchesKey(data, "left")) {
			this.state.activeTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length] ?? "logs";
			return;
		}
		const key = this.state.activeTab;
		const current = this.state.scroll[key] ?? 0;
		if (matchesKey(data, "up")) this.state.scroll[key] = current + 1;
		if (matchesKey(data, "down")) this.state.scroll[key] = Math.max(0, current - 1);
	}

	render(width: number): string[] {
		const w = Math.max(30, width);
		const inner = Math.max(10, w - 2);
		const th = this.theme;
		const lines: string[] = [];
		const border = (s: string) => th.fg("border", s);
		const row = (content: string) => {
			const clipped = truncateToWidth(content, inner, "");
			const padding = " ".repeat(Math.max(0, inner - visibleWidth(clipped)));
			return `${border("│")}${clipped}${padding}${border("│")}`;
		};

		lines.push(border(`╭${"─".repeat(inner)}╮`));
		lines.push(row(` ${th.fg("accent", "Multi-agent activity")} ${th.fg("dim", "(Esc close)")}`));
		const tabText = this.state.tabs
			.map((tab) => (tab === this.state.activeTab ? th.fg("accent", `[${tab}]`) : th.fg("muted", ` ${tab} `)))
			.join(" ");
		lines.push(row(` ${tabText}`));
		lines.push(row(th.fg("dim", " ─".repeat(Math.max(1, Math.floor((inner - 1) / 2))))));

		const events = this.state.events.filter(
			(event) => this.state.activeTab === "logs" || event.agentId === this.state.activeTab,
		);
		const rendered: string[] = [];
		for (const event of events) {
			const time = new Date(event.timestamp).toLocaleTimeString();
			const prefix = `${labelForKind(event.kind)} ${time} ${event.agentId}: `;
			const bodyWidth = Math.max(12, inner - visibleWidth(prefix) - 2);
			const bodyLines = splitLines(event.text, bodyWidth);
			bodyLines.forEach((body, index) => {
				const linePrefix = index === 0 ? prefix : " ".repeat(visibleWidth(prefix));
				rendered.push(` ${linePrefix}${body}`);
			});
		}

		const availableRows = 24;
		const scroll = this.state.scroll[this.state.activeTab] ?? 0;
		const start = Math.max(0, rendered.length - availableRows - scroll);
		const visible = rendered.slice(start, start + availableRows);
		if (visible.length === 0) {
			lines.push(row(` ${th.fg("dim", "No activity yet.")}`));
		} else {
			for (const line of visible) lines.push(row(line));
		}
		lines.push(row(th.fg("dim", " ↑↓ scroll • Tab/←→ switch tabs")));
		lines.push(border(`╰${"─".repeat(inner)}╯`));
		return lines.map((line) => truncateToWidth(line, w, ""));
	}

	invalidate(): void {}
	dispose(): void {}
}

export class ActivityPanelController {
	private handle: any;

	constructor(private readonly state: ActivityState) {}

	reset(): void {
		this.state.events = [];
		this.state.activeTab = "logs";
		this.state.tabs = ["logs"];
		this.state.scroll = {};
		this.requestRender();
	}

	addEvent(agentId: string, kind: ActivityKind, text: string): void {
		if (!this.state.tabs.includes(agentId)) this.state.tabs.push(agentId);
		this.state.events.push({ agentId, kind, text, timestamp: Date.now() });
		if (this.state.events.length > MAX_EVENTS) {
			this.state.events.splice(0, this.state.events.length - MAX_EVENTS);
		}
		this.requestRender();
	}

	appendAssistantDelta(agentId: string, delta: string): void {
		if (!delta) return;
		if (!this.state.tabs.includes(agentId)) this.state.tabs.push(agentId);
		const last = this.state.events[this.state.events.length - 1];
		if (last && last.agentId === agentId && last.kind === "assistant") {
			last.text += delta;
			last.timestamp = Date.now();
		} else {
			this.state.events.push({ agentId, kind: "assistant", text: delta, timestamp: Date.now() });
		}
		this.requestRender();
	}

	show(ctx: ExtensionContext): void {
		if (!ctx.hasUI || this.handle) return;
		void ctx.ui.custom<void>(
			(tui, theme, _keybindings, done) => {
				const component = new ActivityPanelComponent(this.state, theme, () => {
					this.handle = undefined;
					done(undefined);
				});
				return {
					render: (width: number) => component.render(width),
					invalidate: () => component.invalidate(),
					handleInput: (data: string) => {
						component.handleInput(data);
						tui.requestRender();
					},
					dispose: () => component.dispose(),
				};
			},
			{
				overlay: true,
				overlayOptions: {
					width: "45%",
					minWidth: 44,
					maxHeight: "85%",
					anchor: "right-center",
					margin: 1,
					visible: (termWidth: number) => termWidth >= 100,
				},
				onHandle: (handle: any) => {
					this.handle = handle;
				},
			},
		).finally(() => {
			this.handle = undefined;
		});
	}

	close(): void {
		this.handle?.close?.();
		this.handle?.hide?.();
		this.handle = undefined;
	}

	requestRender(): void {
		this.handle?.requestRender?.();
	}
}
