/**
 * The scanner is PURE: it only reads a snapshot of paths and text it is given. It never clones,
 * installs, builds or executes anything from a repository.
 */
export interface TreeEntry {
  path: string;
  size: number;
}
export interface RepoSnapshot {
  /** Every path in the repository tree (blobs only). */
  tree: TreeEntry[];
  /** Text of the files that were fetched (a bounded subset of the tree). */
  contents: Record<string, string>;
  /** True when GitHub truncated the tree or limits stopped us fetching everything. */
  truncated: boolean;
  commitSha?: string;
  ref?: string;
}

/**
 * verified       - observed directly in the repository (a file exists / does not exist, a manifest says X)
 * static_warning - pattern-based heuristic over source text; may be a false positive
 * recommendation - unverified advice; nothing was observed that proves it is needed
 */
export type FindingKind = "verified" | "static_warning" | "recommendation";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Category =
  "build" | "tests" | "security" | "completeness" | "dependencies" | "docs" | "structure";
/** Abstract workspace area; the server maps it onto the project's own milestone keys. */
export type Area = "blocker" | "build" | "tests" | "completeness" | "hygiene";

export interface Evidence {
  path: string;
  line?: number;
  /** Short excerpt. Secrets are always redacted before they get here. */
  snippet?: string;
}

export interface Finding {
  ruleId: string;
  /** Stable identity across rescans so user decisions can be preserved. */
  fingerprint: string;
  kind: FindingKind;
  category: Category;
  severity: Severity;
  area: Area;
  title: string;
  detail: string;
  /** Recommended next action. */
  remedy: string;
  evidence: Evidence[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  dev: boolean;
}

export interface ProjectProfile {
  frameworks: string[];
  languages: string[];
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | "pip" | null;
  /** full = JS/TS/Python static analysis; limited = detected but only structural checks apply. */
  analysisLevel: "full" | "limited" | "none";
  dependencies: DependencyInfo[];
  scripts: Record<string, string>;
  stats: { files: number; contentFilesScanned: number; truncated: boolean };
}

export interface RecoveryTask {
  priority: number;
  fingerprint: string;
  title: string;
  action: string;
  kind: FindingKind;
  severity: Severity;
  area: Area;
}

export interface ScanReport {
  profile: ProjectProfile;
  findings: Finding[];
  tasks: RecoveryTask[];
  summary: {
    headline: string;
    byKind: Record<FindingKind, number>;
    bySeverity: Record<Severity, number>;
  };
  /** Honest limits of this scan, always shown with the report. */
  limits: string[];
}
