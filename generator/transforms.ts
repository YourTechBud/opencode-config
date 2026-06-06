import type { Asset, TargetName } from "./schema.ts";

export function transformBody(body: string, asset: Asset, target: TargetName): string {
  if (target === "codex" && asset.kind === "command") {
    return body.replaceAll("$ARGUMENTS", "[Arguments supplied by the user]");
  }

  // Keep this phase so future harness-specific token or body transforms can be
  // added without changing the renderer pipeline.
  return body;
}
