import YAML from "yaml";
import type { Frontmatter } from "./schema.ts";

const PROTECTED_FIELDS = new Set(["name"]);

export function assertNoProtectedFrontmatter(frontmatter: Frontmatter | undefined, context: string): void {
  if (!frontmatter) return;
  for (const field of PROTECTED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, field)) {
      throw new Error(`${context}: frontmatter field \"${field}\" is generator-controlled and cannot be set in asset.yaml`);
    }
  }
}

export function mergeFrontmatter(...parts: Array<Frontmatter | undefined>): Frontmatter {
  return Object.assign({}, ...parts.filter(Boolean));
}

export function requireDescription(frontmatter: Frontmatter, context: string): string {
  const description = frontmatter.description;
  if (typeof description !== "string" || description.trim().length === 0) {
    throw new Error(`${context}: frontmatter.description is required`);
  }
  return description;
}

export function orderedFrontmatter(fields: Frontmatter, order: string[]): Frontmatter {
  const result: Frontmatter = {};
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) result[key] = fields[key];
  }
  for (const [key, value] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = value;
  }
  return result;
}

export function renderMarkdown(frontmatter: Frontmatter, body: string): string {
  const yaml = YAML.stringify(frontmatter, {
    lineWidth: 0,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  }).trimEnd();
  const separator = body.startsWith("\n") ? "\n" : "\n\n";
  return `---\n${yaml}\n---${separator}${body}`;
}
