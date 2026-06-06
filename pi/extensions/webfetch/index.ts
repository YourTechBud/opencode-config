import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	type ExtensionAPI,
	type TruncationResult,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Parser } from "htmlparser2";
import TurndownService from "turndown";
import { Type } from "typebox";

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;
const MAX_REDIRECTS = 5;

const WEBFETCH_PARAMS = Type.Object({
	url: Type.String({ description: "URL to fetch" }),
	format: Type.Optional(
		StringEnum(["markdown", "text", "html"] as const, {
			description: "Output format. Defaults to markdown; use text or html only when specifically needed.",
		}),
	),
	timeout: Type.Optional(Type.Number({ description: "Timeout in seconds, capped at 120" })),
});

type WebFetchFormat = "markdown" | "text" | "html";

interface WebFetchDetails {
	url: string;
	finalUrl: string;
	format: WebFetchFormat;
	contentType: string;
	bytes: number;
	truncation?: TruncationResult;
	fullOutputPath?: string;
}

export default function webfetchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "webfetch",
		label: "Web Fetch",
		description:
			"Fetch a URL and return readable content. Defaults to Markdown; request plain text or raw HTML only when specifically needed. HTTPS is allowed for all URLs; HTTP is allowed only for localhost and literal private IPs.",
		promptSnippet: "Fetch an HTTPS URL, or an HTTP localhost/private-IP URL, and return readable content as Markdown by default",
		promptGuidelines: [
			"Use webfetch when the user provides a URL or asks for content from a specific web page; prefer the default markdown format unless plain text or raw HTML is specifically needed.",
		],
		parameters: WEBFETCH_PARAMS,

		async execute(_toolCallId, params, signal) {
			const format = params.format ?? "markdown";
			const timeoutSeconds = Math.max(1, Math.min(params.timeout ?? DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS));
			const initialUrl = validateUrl(params.url);
			const { response, finalUrl } = await fetchWithRedirects(initialUrl, format, timeoutSeconds, signal);

			if (!response.ok) {
				throw new Error(`Request failed: ${response.status} ${response.statusText}`);
			}

			const contentLength = response.headers.get("content-length");
			if (contentLength && Number(contentLength) > MAX_RESPONSE_SIZE) {
				throw new Error(`Response too large: exceeds ${formatSize(MAX_RESPONSE_SIZE)} limit`);
			}

			const bytes = await readResponseBytes(response, MAX_RESPONSE_SIZE);
			const contentType = response.headers.get("content-type") ?? "";
			const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";

			if (!isTextualMime(mime)) {
				throw new Error(`Unsupported content type for webfetch v1: ${contentType || "unknown"}`);
			}

			const raw = new TextDecoder().decode(bytes);
			const output = convertContent(raw, contentType, format);
			const { content, details } = await truncateOutput(output, {
				url: params.url,
				finalUrl: finalUrl.toString(),
				format,
				contentType,
				bytes: bytes.byteLength,
			});

			return {
				content: [{ type: "text" as const, text: content }],
				details,
			};
		},
	});
}

function validateUrl(input: string): URL {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new Error("Invalid URL");
	}

	if (!isAllowedUrl(url)) {
		throw new Error(
			"URL policy rejected this URL. HTTPS is allowed for all hosts; HTTP is allowed only for localhost and literal private IPs.",
		);
	}

	return url;
}

function isAllowedUrl(url: URL): boolean {
	if (url.protocol === "https:") return true;
	if (url.protocol !== "http:") return false;
	return isLocalhost(url.hostname) || isPrivateIPv4(url.hostname) || isAllowedPrivateIPv6(url.hostname);
}

function isLocalhost(hostname: string): boolean {
	return hostname.toLowerCase() === "localhost";
}

function isPrivateIPv4(hostname: string): boolean {
	const parts = hostname.split(".");
	if (parts.length !== 4) return false;

	const octets = parts.map((part) => {
		if (!/^\d+$/.test(part)) return NaN;
		const value = Number(part);
		return value >= 0 && value <= 255 ? value : NaN;
	});
	if (octets.some(Number.isNaN)) return false;

	const [a, b] = octets;
	return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isAllowedPrivateIPv6(hostname: string): boolean {
	const value = stripIpv6Brackets(hostname).toLowerCase();
	if (value === "::1" || value === "0:0:0:0:0:0:0:1") return true;

	const first = value.split(":")[0];
	if (!first || !/^[0-9a-f]{1,4}$/.test(first)) return false;
	const firstHextet = Number.parseInt(first, 16);
	return firstHextet >= 0xfc00 && firstHextet <= 0xfdff;
}

function stripIpv6Brackets(hostname: string): string {
	return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

async function fetchWithRedirects(
	initialUrl: URL,
	format: WebFetchFormat,
	timeoutSeconds: number,
	signal: AbortSignal | undefined,
) {
	const controller = new AbortController();
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutSeconds * 1000);

	const abort = () => controller.abort(signal?.reason);
	if (signal?.aborted) abort();
	else if (signal) signal.addEventListener("abort", abort, { once: true });

	try {
		let url = initialUrl;
		for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
			const response = await fetch(url, {
				method: "GET",
				redirect: "manual",
				signal: controller.signal,
				headers: requestHeaders(format),
			});

			if (!isRedirect(response.status)) return { response, finalUrl: url };

			const location = response.headers.get("location");
			if (!location) throw new Error(`Redirect response missing Location header: ${response.status}`);
			if (redirectCount === MAX_REDIRECTS) throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);

			url = validateUrl(new URL(location, url).toString());
		}

		throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
	} catch (error) {
		if (timedOut) throw new Error("Request timed out");
		throw error;
	} finally {
		clearTimeout(timeout);
		if (signal) signal.removeEventListener("abort", abort);
	}
}

function isRedirect(status: number): boolean {
	return status >= 300 && status < 400;
}

function requestHeaders(format: WebFetchFormat) {
	const accept = {
		markdown: "text/markdown;q=1.0, text/plain;q=0.9, text/html;q=0.8, application/json;q=0.7, */*;q=0.1",
		text: "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, application/json;q=0.7, */*;q=0.1",
		html: "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1",
	}[format];

	return {
		"User-Agent": "pi-webfetch",
		Accept: accept,
		"Accept-Language": "en-US,en;q=0.9",
	};
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
	if (!response.body) return new Uint8Array(await response.arrayBuffer());

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;

		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new Error(`Response too large: exceeds ${formatSize(maxBytes)} limit`);
		}
		chunks.push(value);
	}

	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

function isTextualMime(mime: string): boolean {
	if (!mime) return true;
	if (mime.startsWith("text/")) return true;
	return (
		mime === "application/json" ||
		mime === "application/ld+json" ||
		mime === "application/xml" ||
		mime === "application/xhtml+xml" ||
		mime === "application/javascript" ||
		mime === "application/x-javascript" ||
		mime.endsWith("+json") ||
		mime.endsWith("+xml")
	);
}

function convertContent(content: string, contentType: string, format: WebFetchFormat): string {
	const isHtml = contentType.toLowerCase().includes("text/html") || contentType.toLowerCase().includes("application/xhtml+xml");
	if (!isHtml) return content;

	switch (format) {
		case "markdown":
			return convertHTMLToMarkdown(content);
		case "text":
			return extractTextFromHTML(content);
		case "html":
			return content;
	}
}

function extractTextFromHTML(html: string): string {
	let text = "";
	let skipDepth = 0;

	const parser = new Parser({
		onopentag(name) {
			if (skipDepth > 0 || ["script", "style", "noscript", "iframe", "object", "embed"].includes(name)) {
				skipDepth++;
			}
		},
		ontext(input) {
			if (skipDepth === 0) text += input;
		},
		onclosetag() {
			if (skipDepth > 0) skipDepth--;
		},
	});

	parser.write(html);
	parser.end();

	return text.trim();
}

function convertHTMLToMarkdown(html: string): string {
	const turndown = new TurndownService({
		headingStyle: "atx",
		hr: "---",
		bulletListMarker: "-",
		codeBlockStyle: "fenced",
		emDelimiter: "*",
	});
	turndown.remove(["script", "style", "meta", "link"]);
	return turndown.turndown(html);
}

async function truncateOutput(output: string, details: WebFetchDetails): Promise<{ content: string; details: WebFetchDetails }> {
	const truncation = truncateHead(output, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	});

	if (!truncation.truncated) {
		return { content: truncation.content, details };
	}

	const tempDir = await mkdtemp(join(tmpdir(), "pi-webfetch-"));
	const extension = details.format === "markdown" ? "md" : details.format === "html" ? "html" : "txt";
	const fullOutputPath = join(tempDir, `output.${extension}`);
	await writeFile(fullOutputPath, output, "utf8");

	const nextDetails: WebFetchDetails = {
		...details,
		truncation,
		fullOutputPath,
	};

	const notice = [
		"",
		`[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`,
		`(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`,
		`Full converted content saved to: ${fullOutputPath}]`,
	].join(" ");

	return { content: `${truncation.content}\n${notice}`, details: nextDetails };
}
