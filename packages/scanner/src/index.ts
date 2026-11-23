import { buildProfile } from "./profile";
import { runRules } from "./rules";
import type {
  Finding,
  FindingKind,
  RecoveryTask,
  RepoSnapshot,
  ScanReport,
  Severity,
} from "./types";

export * from "./types";
export * from "./files";
export * from "./checks";
export * from "./readiness";
export { buildProfile, parsePackageJson } from "./profile";
export { redact } from "./rules";

const SEV: Severity[] = ["critical", "high", "medium", "low", "info"];
const KIND_ORDER: FindingKind[] = ["verified", "static_warning", "recommendation"];

function headline(profile: ReturnType<typeof buildProfile>, findings: Finding[]): string {
  const stack =
    profile.frameworks.length > 0
      ? profile.frameworks.slice(0, 3).join(" + ")
      : profile.languages.join(" + ") || "Unrecognised stack";
  const serious = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  if (findings.length === 0) return `${stack}: no problems detected by static analysis.`;
  const first = [...serious, ...findings][0]!;
  return `${stack}: ${findings.length} finding(s)${serious.length ? `, ${serious.length} serious` : ""}. Start with: ${first.title}.`;
}

/** Pure, deterministic scan of a snapshot. Never executes anything from the repository. */
export function scanSnapshot(snap: RepoSnapshot): ScanReport {
  const profile = buildProfile(snap);
  const findings = runRules(snap, profile).sort(
    (a, b) =>
      SEV.indexOf(a.severity) - SEV.indexOf(b.severity) ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.fingerprint.localeCompare(b.fingerprint),
  );
  const byKind: Record<FindingKind, number> = { verified: 0, static_warning: 0, recommendation: 0 };
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    byKind[f.kind]++;
    bySeverity[f.severity]++;
  }
  const tasks: RecoveryTask[] = findings.map((f, i) => ({
    priority: i + 1,
    fingerprint: f.fingerprint,
    title: f.title,
    action: f.remedy,
    kind: f.kind,
    severity: f.severity,
    area: f.area,
  }));
  const limits = [
    "Static analysis only: no repository code was executed, built or installed.",
    "'Verified' means observed directly in the repository. 'Static warning' is a pattern heuristic and may be a false positive. 'Recommendation' is unverified advice.",
    `Read ${profile.stats.contentFilesScanned} of ${profile.stats.files} files (a bounded, prioritised sample).`,
  ];
  if (snap.truncated)
    limits.push(
      "The repository is large: the file tree or sample was truncated, so 'missing file' findings are downgraded to warnings.",
    );
  if (profile.analysisLevel === "limited")
    limits.push(
      "This stack is only partially supported: structural checks ran, but code-level checks did not.",
    );
  if (profile.analysisLevel === "none") limits.push("No supported project type was recognised.");
  return {
    profile,
    findings,
    tasks,
    summary: { headline: headline(profile, findings), byKind, bySeverity },
    limits,
  };
}
