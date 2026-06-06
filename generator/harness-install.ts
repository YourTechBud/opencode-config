import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import { pathExists } from "./fs.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_MANIFEST_RELATIVE_PATH = path.join(".managed", "coding-harness-config", "manifest.json");

const HARNESSES = ["codex", "opencode", "pi", "claude"] as const;
type HarnessName = (typeof HARNESSES)[number];
type Command = "install" | "clear";
type SettingsMode = "setIfMissing" | "appendIfMissing";

type JsonObject = Record<string, unknown>;

interface InstallMapping {
	sourcePrefix: string;
	destPrefix: string;
}

interface SettingsOperationFile {
	source: string;
}

interface SettingsOperation {
	dest: string;
	path: string[];
	mode: SettingsMode;
	value: unknown;
	match?: {
		key?: string;
	};
}

interface HarnessConfig {
	displayName: string;
	generatedDir: string;
	home(): string;
	mappings: InstallMapping[];
	settings?: SettingsOperationFile[];
}

const HARNESS_CONFIG: Record<HarnessName, HarnessConfig> = {
	codex: {
		displayName: "Codex",
		generatedDir: "codex",
		home: () => path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex")),
		mappings: [
			{ sourcePrefix: "skills", destPrefix: "skills" },
			{ sourcePrefix: "agents", destPrefix: "agents" },
		],
	},
	opencode: {
		displayName: "OpenCode",
		generatedDir: "opencode",
		home: () => path.resolve(process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), ".config", "opencode")),
		mappings: [
			{ sourcePrefix: "skills", destPrefix: "skills" },
			{ sourcePrefix: "commands", destPrefix: "commands" },
			{ sourcePrefix: "agents", destPrefix: "agents" },
		],
		settings: [{ source: "settings.operations.json" }],
	},
	pi: {
		displayName: "Pi",
		generatedDir: "pi",
		home: () => path.resolve(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent")),
		mappings: [
			{ sourcePrefix: "skills", destPrefix: "skills" },
			{ sourcePrefix: "prompts", destPrefix: "prompts" },
			{ sourcePrefix: "agents", destPrefix: "agents" },
			{ sourcePrefix: "extensions", destPrefix: "extensions" },
		],
		settings: [{ source: "settings.operations.json" }],
	},
	claude: {
		displayName: "Claude Code",
		generatedDir: "claude",
		home: () => path.resolve(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude")),
		mappings: [
			{ sourcePrefix: "skills", destPrefix: "skills" },
			{ sourcePrefix: "agents", destPrefix: "agents" },
		],
	},
};

function toPortablePath(file: string): string {
	return file.split(path.sep).join("/");
}

function fromPortablePath(file: string): string {
	return file.split("/").join(path.sep);
}

function isPlainObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(object: JsonObject, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(object, key);
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((item, index) => deepEqual(item, b[index]));
	}
	if (isPlainObject(a) || isPlainObject(b)) {
		if (!isPlainObject(a) || !isPlainObject(b)) return false;
		const aKeys = Object.keys(a).sort();
		const bKeys = Object.keys(b).sort();
		return deepEqual(aKeys, bKeys) && aKeys.every((key) => deepEqual(a[key], b[key]));
	}
	return false;
}

function formatSettingsPath(segments: string[]): string {
	return `/${segments.join("/")}`;
}

function validateSettingsOperation(value: unknown, context: string): SettingsOperation {
	if (!isPlainObject(value)) throw new Error(`${context}: operation must be an object`);
	if (typeof value.dest !== "string" || value.dest.trim().length === 0) throw new Error(`${context}: dest must be a non-empty string`);
	if (!Array.isArray(value.path) || value.path.length === 0 || !value.path.every((segment) => typeof segment === "string" && segment.length > 0)) {
		throw new Error(`${context}: path must be a non-empty string array`);
	}
	if (value.mode !== "setIfMissing" && value.mode !== "appendIfMissing") throw new Error(`${context}: mode must be setIfMissing or appendIfMissing`);
	if (!hasOwn(value, "value")) throw new Error(`${context}: value is required`);
	if (value.match !== undefined) {
		if (!isPlainObject(value.match)) throw new Error(`${context}: match must be an object`);
		if (value.match.key !== undefined && typeof value.match.key !== "string") throw new Error(`${context}: match.key must be a string`);
	}
	const matchKey = isPlainObject(value.match) && typeof value.match.key === "string" ? value.match.key : undefined;
	if (value.mode === "appendIfMissing" && matchKey !== undefined) {
		if (!isPlainObject(value.value) || !hasOwn(value.value, matchKey)) {
			throw new Error(`${context}: appendIfMissing with match.key requires value.${matchKey}`);
		}
	}
	return value as unknown as SettingsOperation;
}

async function readJsoncFile(file: string, context: string): Promise<unknown> {
	const errors: ParseError[] = [];
	const content = await fs.readFile(file, "utf8");
	const parsed = parseJsonc(content, errors, { allowTrailingComma: true, disallowComments: false });
	if (errors.length > 0) {
		const summary = errors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`).join(", ");
		throw new Error(`${context} contains malformed JSON: ${summary}`);
	}
	return parsed;
}

async function readDestinationSettings(file: string, displayName: string): Promise<JsonObject> {
	if (!(await pathExists(file))) return {};
	const parsed = await readJsoncFile(file, `${displayName} settings file ${file}`);
	if (!isPlainObject(parsed)) throw new Error(`${displayName} settings file ${file} must contain a JSON object`);
	return parsed;
}

async function readSettingsOperations(config: HarnessConfig): Promise<SettingsOperation[]> {
	const result: SettingsOperation[] = [];
	if (!config.settings) return result;
	const generatedRoot = path.join(REPO_ROOT, config.generatedDir);

	for (const settingsFile of config.settings) {
		const source = path.join(generatedRoot, settingsFile.source);
		if (!(await pathExists(source))) throw new Error(`Missing ${config.displayName} settings operations file: ${source}`);
		const parsed = await readJsoncFile(source, `${config.displayName} settings operations file ${source}`);
		if (!Array.isArray(parsed)) throw new Error(`${config.displayName} settings operations file ${source} must contain a JSON array`);
		parsed.forEach((operation, index) => result.push(validateSettingsOperation(operation, `${path.relative(REPO_ROOT, source)}[${index}]`)));
	}

	return result;
}

function getParent(root: JsonObject, segments: string[], create: boolean): { parent: JsonObject; key: string } | undefined {
	let current: JsonObject = root;
	for (let index = 0; index < segments.length - 1; index += 1) {
		const segment = segments[index];
		if (!hasOwn(current, segment)) {
			if (!create) return undefined;
			current[segment] = {};
		}
		const next = current[segment];
		if (!isPlainObject(next)) return undefined;
		current = next;
	}
	return { parent: current, key: segments[segments.length - 1] };
}

function getValue(root: JsonObject, segments: string[]): { exists: boolean; value?: unknown } {
	let current: unknown = root;
	for (const segment of segments) {
		if (!isPlainObject(current) || !hasOwn(current, segment)) return { exists: false };
		current = current[segment];
	}
	return { exists: true, value: current };
}

function deletePath(root: JsonObject, segments: string[]): boolean {
	const parent = getParent(root, segments, false);
	if (!parent || !hasOwn(parent.parent, parent.key)) return false;
	delete parent.parent[parent.key];
	pruneEmptyObjectParents(root, segments.slice(0, -1));
	return true;
}

function pruneEmptyObjectParents(root: JsonObject, parentPath: string[]): void {
	for (let length = parentPath.length; length > 0; length -= 1) {
		const currentPath = parentPath.slice(0, length);
		const current = getValue(root, currentPath);
		if (!isPlainObject(current.value) || Object.keys(current.value).length > 0) return;
		const parent = getParent(root, currentPath, false);
		if (!parent) return;
		delete parent.parent[parent.key];
	}
}

function findMatchingArrayItem(array: unknown[], operation: SettingsOperation): number {
	const matchKey = operation.match?.key;
	if (!matchKey) return array.findIndex((item) => deepEqual(item, operation.value));
	if (!isPlainObject(operation.value)) return -1;
	const matchValue = operation.value[matchKey];
	return array.findIndex((item) => isPlainObject(item) && deepEqual(item[matchKey], matchValue));
}

function applySetIfMissing(root: JsonObject, operation: SettingsOperation, displayName: string): boolean {
	const parent = getParent(root, operation.path, true);
	const formattedPath = formatSettingsPath(operation.path);
	if (!parent) {
		console.warn(`Skipped ${displayName} setting ${formattedPath}; parent path is not an object.`);
		return false;
	}
	if (!hasOwn(parent.parent, parent.key)) {
		parent.parent[parent.key] = operation.value;
		return true;
	}
	if (deepEqual(parent.parent[parent.key], operation.value)) return false;
	console.warn(`Skipped ${displayName} setting conflict at ${formattedPath}; existing value preserved.`);
	return false;
}

function applyAppendIfMissing(root: JsonObject, operation: SettingsOperation, displayName: string): boolean {
	const formattedPath = formatSettingsPath(operation.path);
	const current = getValue(root, operation.path);
	if (!current.exists) {
		const parent = getParent(root, operation.path, true);
		if (!parent) {
			console.warn(`Skipped ${displayName} setting ${formattedPath}; parent path is not an object.`);
			return false;
		}
		parent.parent[parent.key] = [operation.value];
		return true;
	}
	if (!Array.isArray(current.value)) {
		console.warn(`Skipped ${displayName} setting ${formattedPath}; existing value is not an array.`);
		return false;
	}
	const index = findMatchingArrayItem(current.value, operation);
	if (index === -1) {
		current.value.push(operation.value);
		return true;
	}
	if (deepEqual(current.value[index], operation.value)) return false;
	console.warn(`Skipped ${displayName} setting conflict at ${formattedPath}; existing array item preserved.`);
	return false;
}

function clearSetIfSame(root: JsonObject, operation: SettingsOperation): boolean {
	const current = getValue(root, operation.path);
	if (!current.exists || !deepEqual(current.value, operation.value)) return false;
	return deletePath(root, operation.path);
}

function clearArrayItemIfSame(root: JsonObject, operation: SettingsOperation): boolean {
	const current = getValue(root, operation.path);
	if (!Array.isArray(current.value)) return false;
	const index = findMatchingArrayItem(current.value, operation);
	if (index === -1 || !deepEqual(current.value[index], operation.value)) return false;
	current.value.splice(index, 1);
	return true;
}

function applySettingsOperation(root: JsonObject, operation: SettingsOperation, command: Command, displayName: string): boolean {
	if (command === "install") {
		if (operation.mode === "setIfMissing") return applySetIfMissing(root, operation, displayName);
		return applyAppendIfMissing(root, operation, displayName);
	}
	if (operation.mode === "setIfMissing") return clearSetIfSame(root, operation);
	return clearArrayItemIfSame(root, operation);
}

async function applySettingsOperations(config: HarnessConfig, command: Command): Promise<number> {
	const operations = await readSettingsOperations(config);
	if (operations.length === 0) return 0;

	let changed = 0;
	const operationsByDest = new Map<string, SettingsOperation[]>();
	for (const operation of operations) {
		const relativeDest = toPortablePath(operation.dest);
		operationsByDest.set(relativeDest, [...(operationsByDest.get(relativeDest) ?? []), operation]);
	}

	const home = config.home();
	for (const [relativeDest, destOperations] of operationsByDest) {
		const target = path.join(home, fromPortablePath(relativeDest));
		const settings = await readDestinationSettings(target, config.displayName);
		let fileChanged = false;
		for (const operation of destOperations) {
			if (applySettingsOperation(settings, operation, command, config.displayName)) {
				changed += 1;
				fileChanged = true;
			}
		}
		if (fileChanged) {
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.writeFile(target, `${JSON.stringify(settings, null, 2)}\n`);
		}
	}

	return changed;
}

async function listInstallFiles(dir: string): Promise<string[]> {
	if (!(await pathExists(dir))) return [];
	const result: string[] = [];

	async function walk(current: string): Promise<void> {
		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === ".DS_Store" || path.extname(entry.name) === ".log") continue;
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) await walk(full);
			else if (entry.isFile() || entry.isSymbolicLink()) result.push(full);
		}
	}

	await walk(dir);
	return result.sort();
}

async function desiredFiles(config: HarnessConfig): Promise<Array<{ source: string; relativeDest: string }>> {
	const result: Array<{ source: string; relativeDest: string }> = [];
	const generatedRoot = path.join(REPO_ROOT, config.generatedDir);

	for (const mapping of config.mappings) {
		const sourceRoot = path.join(generatedRoot, mapping.sourcePrefix);
		for (const source of await listInstallFiles(sourceRoot)) {
			const relative = path.relative(sourceRoot, source);
			result.push({ source, relativeDest: toPortablePath(path.join(mapping.destPrefix, relative)) });
		}
	}

	return result.sort((a, b) => a.relativeDest.localeCompare(b.relativeDest));
}

function stopDirsFor(home: string, config: HarnessConfig): Set<string> {
	return new Set([home, ...config.mappings.map((mapping) => path.join(home, fromPortablePath(mapping.destPrefix)))]);
}

async function pruneEmptyParents(home: string, config: HarnessConfig, relativeFile: string): Promise<void> {
	const stopDirs = stopDirsFor(home, config);
	let current = path.dirname(path.join(home, fromPortablePath(relativeFile)));
	while (!stopDirs.has(current) && current.startsWith(home)) {
		try {
			await fs.rmdir(current);
		} catch {
			return;
		}
		current = path.dirname(current);
	}
}

async function removeRelativeFile(home: string, config: HarnessConfig, relativeFile: string): Promise<boolean> {
	const target = path.join(home, fromPortablePath(relativeFile));
	if (!(await pathExists(target))) return false;
	await fs.rm(target, { force: true });
	await pruneEmptyParents(home, config, relativeFile);
	return true;
}

async function readLegacyManifestPaths(home: string): Promise<string[]> {
	const manifestPath = path.join(home, LEGACY_MANIFEST_RELATIVE_PATH);
	if (!(await pathExists(manifestPath))) return [];
	try {
		const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { files?: Array<{ path?: unknown }> };
		return Array.isArray(parsed.files)
			? parsed.files.map((entry) => entry.path).filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

async function removeLegacyManifestDir(home: string): Promise<void> {
	const legacyDir = path.join(home, ".managed", "coding-harness-config");
	await fs.rm(legacyDir, { recursive: true, force: true });
	try {
		await fs.rmdir(path.join(home, ".managed"));
	} catch {
		// Keep .managed if something else still uses it.
	}
}

async function cleanupLegacyInstall(home: string, config: HarnessConfig): Promise<number> {
	let removed = 0;
	for (const relativeFile of await readLegacyManifestPaths(home)) {
		if (await removeRelativeFile(home, config, relativeFile)) removed += 1;
	}
	await removeLegacyManifestDir(home);
	return removed;
}

async function installHarness(name: HarnessName): Promise<void> {
	const config = HARNESS_CONFIG[name];
	const home = config.home();
	const generatedDir = path.join(REPO_ROOT, config.generatedDir);
	if (!(await pathExists(generatedDir))) {
		throw new Error(`Missing generated ${config.displayName} directory: ${generatedDir}. Run pnpm run generate first.`);
	}

	await cleanupLegacyInstall(home, config);

	const desired = await desiredFiles(config);
	for (const file of desired) {
		const target = path.join(home, fromPortablePath(file.relativeDest));
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.copyFile(file.source, target);
	}
	const changedSettings = await applySettingsOperations(config, "install");

	console.log(`Installed ${desired.length} ${config.displayName} file(s) into ${home}${changedSettings ? ` and applied ${changedSettings} setting operation(s)` : ""}`);
}

async function clearHarness(name: HarnessName): Promise<void> {
	const config = HARNESS_CONFIG[name];
	const home = config.home();
	const generatedDir = path.join(REPO_ROOT, config.generatedDir);
	const generatedDirExists = await pathExists(generatedDir);
	const changedSettings = generatedDirExists ? await applySettingsOperations(config, "clear") : 0;
	const desired = generatedDirExists ? await desiredFiles(config) : [];
	const paths = new Set(desired.map((file) => file.relativeDest));
	for (const legacyPath of await readLegacyManifestPaths(home)) paths.add(legacyPath);

	let removed = 0;
	for (const relativeFile of [...paths].sort()) {
		if (await removeRelativeFile(home, config, relativeFile)) removed += 1;
	}
	await removeLegacyManifestDir(home);

	console.log(`Removed ${removed} ${config.displayName} file(s) from ${home}${changedSettings ? ` and reverted ${changedSettings} setting operation(s)` : ""}`);
}

function parseHarnesses(value: string | undefined): HarnessName[] {
	if (!value || value === "all") return [...HARNESSES];
	if (!HARNESSES.includes(value as HarnessName)) {
		throw new Error(`Unknown harness: ${value}. Expected one of: all, ${HARNESSES.join(", ")}`);
	}
	return [value as HarnessName];
}

async function main(): Promise<void> {
	const command = process.argv[2] as Command | undefined;
	const harnesses = parseHarnesses(process.argv[3]);
	if (command !== "install" && command !== "clear") {
		throw new Error(`Usage: tsx generator/harness-install.ts install|clear [all|${HARNESSES.join("|")}]`);
	}

	for (const harness of harnesses) {
		if (command === "install") await installHarness(harness);
		else await clearHarness(harness);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
