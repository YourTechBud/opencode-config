import * as fs from "node:fs";
import * as path from "node:path";
import { streamOpenAICodexResponses, streamSimpleOpenAICodexResponses, getModels, type Model, type SimpleStreamOptions, type Context } from "@earendil-works/pi-ai";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER = "openai-codex";
const FAST_API = "openai-codex-fast-responses";
const DEFAULT_FAST_MODELS: FastModelConfig[] = [
	{
		base: "gpt-5.5",
		alias: "gpt-5.5-fast",
		name: "GPT-5.5 Fast",
		serviceTier: "priority",
	},
];

type FastModelConfig = {
	base: string;
	alias: string;
	name?: string;
	serviceTier?: "priority";
};

type SettingsShape = {
	codexFastModels?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSettingsFile(filePath: string): SettingsShape {
	try {
		if (!fs.existsSync(filePath)) return {};
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function normalizeFastModelConfig(value: unknown): FastModelConfig | undefined {
	if (!isRecord(value)) return undefined;
	const base = typeof value.base === "string" ? value.base.trim() : "";
	const alias = typeof value.alias === "string" ? value.alias.trim() : "";
	if (!base || !alias) return undefined;
	return {
		base,
		alias,
		name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : undefined,
		serviceTier: "priority",
	};
}

function loadConfiguredFastModels(cwd: string): FastModelConfig[] {
	const globalSettings = readSettingsFile(path.join(getAgentDir(), "settings.json"));
	const projectSettings = readSettingsFile(path.join(cwd, ".pi", "settings.json"));
	const raw = projectSettings.codexFastModels ?? globalSettings.codexFastModels;
	if (!Array.isArray(raw)) return DEFAULT_FAST_MODELS;
	const configured = raw.map(normalizeFastModelConfig).filter((item): item is FastModelConfig => item !== undefined);
	return configured.length > 0 ? configured : DEFAULT_FAST_MODELS;
}

function fastCost(baseModel: Model, serviceTier: FastModelConfig["serviceTier"]): Model["cost"] {
	// Mirror Pi's current Codex provider service-tier pricing for model-picker metadata;
	// runtime usage cost is still calculated by Pi's core Codex provider.
	const multiplier = serviceTier === "priority" ? (baseModel.id === "gpt-5.5" ? 2.5 : 2) : 1;
	return {
		input: baseModel.cost.input * multiplier,
		output: baseModel.cost.output * multiplier,
		cacheRead: baseModel.cost.cacheRead * multiplier,
		cacheWrite: baseModel.cost.cacheWrite * multiplier,
	};
}

function buildOpenAICodexModels(configuredFastModels: FastModelConfig[]) {
	const builtIns = getModels(PROVIDER);
	const byId = new Map(builtIns.map((model) => [model.id, model]));
	const models = builtIns.map((model) => ({ ...model }));

	for (const fastModel of configuredFastModels) {
		const base = byId.get(fastModel.base);
		if (!base) continue;
		models.push({
			...base,
			id: fastModel.alias,
			name: fastModel.name ?? `${base.name} Fast`,
			api: FAST_API,
			cost: fastCost(base, fastModel.serviceTier),
		});
	}

	return models;
}

function toProviderModelConfig(model: Model) {
	return {
		id: model.id,
		name: model.name,
		api: model.api,
		baseUrl: model.baseUrl,
		reasoning: model.reasoning,
		thinkingLevelMap: model.thinkingLevelMap,
		input: model.input,
		cost: model.cost,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		compat: model.compat,
	};
}

function baseModelIdForAlias(configuredFastModels: FastModelConfig[], alias: string): string | undefined {
	return configuredFastModels.find((model) => model.alias === alias)?.base;
}

export default function codexFastModel(pi: ExtensionAPI): void {
	const configuredFastModels = loadConfiguredFastModels(process.cwd());
	const openAICodexModels = buildOpenAICodexModels(configuredFastModels);
	const baseUrl = openAICodexModels.find((model) => model.provider === PROVIDER)?.baseUrl ?? "https://chatgpt.com/backend-api";

	pi.registerProvider(PROVIDER, {
		baseUrl,
		apiKey: "$OPENAI_CODEX_API_KEY",
		api: FAST_API,
		streamSimple(model: Model, context: Context, options?: SimpleStreamOptions) {
			const baseId = baseModelIdForAlias(configuredFastModels, model.id);
			if (!baseId) {
				return streamSimpleOpenAICodexResponses(model as never, context, options);
			}

			const baseModel = getModels(PROVIDER).find((candidate) => candidate.id === baseId);
			if (!baseModel) {
				throw new Error(`Unknown Codex fast base model: ${baseId}`);
			}

			const reasoning = (options as { reasoning?: string } | undefined)?.reasoning;
			return streamOpenAICodexResponses(baseModel as never, context, {
				...options,
				serviceTier: "priority",
				reasoningEffort: reasoning === "off" ? undefined : (reasoning as never),
			} as never);
		},
		models: openAICodexModels.map(toProviderModelConfig),
	});
}
