import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

function expandTilde(p: string): string {
	if (p === "~") return os.homedir();
	if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
	return p;
}

function resolvePath(p: string, cwd: string): string {
	const expanded = expandTilde(p);
	return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
}

function readAgentsSetting(settingsPath: string, cwd: string): string[] {
	if (!fs.existsSync(settingsPath)) return [];
	try {
		const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as { agents?: unknown };
		if (!Array.isArray(parsed.agents)) return [];
		return parsed.agents.filter((item): item is string => typeof item === "string").map((item) => resolvePath(item, cwd));
	} catch {
		return [];
	}
}

export function getAgentSearchDirs(cwd: string): string[] {
	const agentDir = getAgentDir();
	const defaults = [path.resolve(cwd, ".pi", "agents"), path.join(agentDir, "agents")];
	const globalSettings = readAgentsSetting(path.join(agentDir, "settings.json"), cwd);
	const projectSettings = readAgentsSetting(path.resolve(cwd, ".pi", "settings.json"), cwd);

	return [...new Set([...defaults, ...globalSettings, ...projectSettings])];
}
