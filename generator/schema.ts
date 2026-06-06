export type TargetName = "opencode" | "pi" | "claude" | "codex";
export type AssetKind = "skill" | "command" | "agent";

export type Frontmatter = Record<string, unknown>;

export interface TargetConfig {
  frontmatter?: Frontmatter;
  as?: string;
}

export interface AssetConfig {
  kind: AssetKind;
  frontmatter?: Frontmatter;
  targets: Partial<Record<TargetName, TargetConfig | null>>;
}

export interface Asset {
  id: string;
  kind: AssetKind;
  dir: string;
  bodyPath: string;
  body: string;
  config: AssetConfig;
  extras: string[];
}

export const TARGETS: TargetName[] = ["opencode", "pi", "claude", "codex"];
export const KINDS: AssetKind[] = ["skill", "command", "agent"];
