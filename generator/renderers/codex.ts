import * as path from "node:path";
import YAML from "yaml";
import type { Asset, Frontmatter, TargetConfig } from "../schema.ts";
import { mergeFrontmatter, orderedFrontmatter, renderMarkdown, requireDescription } from "../frontmatter.ts";
import { transformBody } from "../transforms.ts";

const NAMESPACE = "yourtechbud";

function common(asset: Asset, target: TargetConfig): { frontmatter: Frontmatter; policy: Frontmatter; body: string } {
  const frontmatter = mergeFrontmatter(asset.config.frontmatter, target.frontmatter);
  const policy = mergeFrontmatter(target.policy);
  const body = transformBody(asset.body, asset, "codex");
  return { frontmatter, policy, body };
}

function codexAgentName(assetId: string): string {
  return `${NAMESPACE}_${assetId.replaceAll("-", "_")}`;
}

function tomlString(value: unknown): string {
  if (typeof value !== "string") throw new Error(`Codex agent field must be a string, got ${typeof value}`);
  return JSON.stringify(value);
}

function renderAgentToml(asset: Asset, frontmatter: Frontmatter, body: string): string {
  const description = requireDescription(frontmatter, `${asset.kind}:${asset.id}:codex`);
  const fields: Record<string, string> = {
    name: codexAgentName(asset.id),
    description,
    developer_instructions: body.trimStart(),
  };

  for (const key of ["model", "model_reasoning_effort", "sandbox_mode"] as const) {
    if (frontmatter[key] !== undefined) fields[key] = tomlString(frontmatter[key]).slice(1, -1);
  }

  return Object.entries(fields)
    .map(([key, value]) => `${key} = ${tomlString(value)}`)
    .join("\n") + "\n";
}

function implicitInvocationDisabled(policy: Frontmatter): boolean {
  return policy.allow_implicit_invocation === false;
}

function openAiYaml(policy: Frontmatter): string {
  return YAML.stringify({ policy });
}

export function renderCodex(asset: Asset, target: TargetConfig): Array<{ path: string; content: string; extrasDir?: string }> {
  const { frontmatter, policy, body } = common(asset, target);
  requireDescription(frontmatter, `${asset.kind}:${asset.id}:codex`);

  if (asset.kind === "skill" || asset.kind === "command") {
    const skillPolicy = asset.kind === "command" ? { ...policy, allow_implicit_invocation: false } : policy;
    const rendered = orderedFrontmatter({ ...frontmatter, name: asset.id }, ["name", "description"]);
    const skillDir = path.join("codex", "skills", asset.id);
    const files: Array<{ path: string; content: string; extrasDir?: string }> = [
      { path: path.join(skillDir, "SKILL.md"), content: renderMarkdown(rendered, body), extrasDir: skillDir },
    ];

    if (Object.keys(skillPolicy).length > 0 || implicitInvocationDisabled(skillPolicy)) {
      files.push({ path: path.join(skillDir, "agents", "openai.yaml"), content: openAiYaml(skillPolicy) });
    }

    return files;
  }

  return [{ path: path.join("codex", "agents", `${NAMESPACE}-${asset.id}.toml`), content: renderAgentToml(asset, frontmatter, body) }];
}
