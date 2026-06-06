import * as path from "node:path";
import type { Asset, Frontmatter, TargetConfig } from "../schema.ts";
import { mergeFrontmatter, orderedFrontmatter, renderMarkdown, requireDescription } from "../frontmatter.ts";
import { transformBody } from "../transforms.ts";

function common(asset: Asset, target: TargetConfig): { frontmatter: Frontmatter; body: string } {
  const base = asset.kind === "command" ? { "disable-model-invocation": true } : undefined;
  const frontmatter = mergeFrontmatter(base, asset.config.frontmatter, target.frontmatter);
  const body = transformBody(asset.body, asset, "claude");
  return { frontmatter, body };
}

export function renderClaude(asset: Asset, target: TargetConfig): Array<{ path: string; content: string; extrasDir?: string }> {
  const { frontmatter, body } = common(asset, target);
  requireDescription(frontmatter, `${asset.kind}:${asset.id}:claude`);

  if (asset.kind === "skill" || asset.kind === "command") {
    const rendered = orderedFrontmatter({ ...frontmatter, name: asset.id }, ["name", "description", "disable-model-invocation", "user-invocable", "argument-hint"]);
    return [{ path: path.join("claude", "skills", asset.id, "SKILL.md"), content: renderMarkdown(rendered, body), extrasDir: path.join("claude", "skills", asset.id) }];
  }

  const rendered = orderedFrontmatter({ ...frontmatter, name: asset.id }, ["name", "description", "model", "effort", "tools", "disallowedTools"]);
  return [{ path: path.join("claude", "agents", `${asset.id}.md`), content: renderMarkdown(rendered, body) }];
}
