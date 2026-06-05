import type { Asset, TargetName } from "./schema.ts";

export function transformBody(body: string, _asset: Asset, _target: TargetName): string {
  // Intentional no-op for v1. Keep this phase so future harness-specific token
  // or body transforms can be added without changing the renderer pipeline.
  return body;
}
