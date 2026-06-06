import * as path from "node:path";
import type { Asset, Frontmatter, TargetConfig } from "../schema.ts";
import { mergeFrontmatter, orderedFrontmatter, renderMarkdown, requireDescription } from "../frontmatter.ts";
import { transformBody } from "../transforms.ts";

function common(asset: Asset, target: TargetConfig): { frontmatter: Frontmatter; body: string } {
  const frontmatter = mergeFrontmatter(asset.config.frontmatter, target.frontmatter);
  const body = transformBody(asset.body, asset, "pi");
  return { frontmatter, body };
}

export function renderPi(asset: Asset, target: TargetConfig): Array<{ path: string; content: string; extrasDir?: string }> {
  const { frontmatter, body } = common(asset, target);
  requireDescription(frontmatter, `${asset.kind}:${asset.id}:pi`);

  if (asset.kind === "skill") {
    const rendered = orderedFrontmatter({ ...frontmatter, name: asset.id }, ["name", "description"]);
    return [{ path: path.join("pi", "skills", asset.id, "SKILL.md"), content: renderMarkdown(rendered, body), extrasDir: path.join("pi", "skills", asset.id) }];
  }

  if (asset.kind === "command") {
    return [{ path: path.join("pi", "prompts", `${asset.id}.md`), content: renderMarkdown(orderedFrontmatter(frontmatter, ["description", "argument-hint"]), body) }];
  }

  const rendered = orderedFrontmatter({ ...frontmatter, name: asset.id }, ["name", "description", "model", "thinkingLevel"]);
  return [{ path: path.join("pi", "agents", `${asset.id}.md`), content: renderMarkdown(rendered, body) }];
}
