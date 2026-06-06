import * as path from "node:path";
import type { Asset, Frontmatter, TargetConfig } from "../schema.ts";
import { mergeFrontmatter, orderedFrontmatter, renderMarkdown, requireDescription } from "../frontmatter.ts";
import { transformBody } from "../transforms.ts";

function common(asset: Asset, target: TargetConfig): { frontmatter: Frontmatter; body: string } {
  const frontmatter = mergeFrontmatter(asset.config.frontmatter, target.frontmatter);
  const body = transformBody(asset.body, asset, "opencode");
  return { frontmatter, body };
}

export function renderOpenCode(asset: Asset, target: TargetConfig): Array<{ path: string; content: string; extrasDir?: string }> {
  const { frontmatter, body } = common(asset, target);
  requireDescription(frontmatter, `${asset.kind}:${asset.id}:opencode`);

  if (asset.kind === "skill") {
    const rendered = orderedFrontmatter({ ...frontmatter, name: asset.id }, ["name", "description"]);
    return [{ path: path.join("opencode", "skills", asset.id, "SKILL.md"), content: renderMarkdown(rendered, body), extrasDir: path.join("opencode", "skills", asset.id) }];
  }

  if (asset.kind === "command") {
    return [{ path: path.join("opencode", "commands", `${asset.id}.md`), content: renderMarkdown(orderedFrontmatter(frontmatter, ["description"]), body) }];
  }

  return [{ path: path.join("opencode", "agents", `${asset.id}.md`), content: renderMarkdown(orderedFrontmatter(frontmatter, ["description", "mode", "model"]), body) }];
}
