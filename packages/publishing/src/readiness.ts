import { requirementsFor } from "./catalog";
import type { TargetMetadata } from "./metadata";
import {
  READINESS_DISCLAIMER,
  type Claim,
  type Platform,
  type PublishingEvidence,
  type Readiness,
  type RequirementDef,
  type RequirementResult,
  type RequirementStatus,
} from "./types";
import { isValidVersion } from "./releases";

export interface ReadinessInput {
  platform: Platform;
  metadata: TargetMetadata;
  /** The user's claims by requirement key. They can never produce `verified` or `blocked`. */
  claims: Record<string, Claim | undefined>;
  evidence: PublishingEvidence;
  /** Versions of releases created for this target (any status except withdrawn). */
  releaseVersions: string[];
}

type Outcome = Pick<RequirementResult, "status" | "reason" | "source" | "evidence">;
const out = (
  status: RequirementStatus,
  reason: string,
  source: Outcome["source"],
  evidence?: Outcome["evidence"],
): Outcome => ({ status, reason, source, ...(evidence ? { evidence } : {}) });
const checkStatus = (e: PublishingEvidence, id: string) =>
  e.verification?.checks.find((c) => c.id === id)?.status;
const filled = (v: string | undefined, min = 1) => typeof v === "string" && v.trim().length >= min;

function fromClaim(def: RequirementDef, claim: Claim | undefined, missingReason: string): Outcome {
  if (!claim) return out("missing", missingReason, "none");
  if (claim.kind === "not_applicable") {
    return def.canBeNotApplicable
      ? out("not_applicable", `Declared not applicable by you: ${claim.note}`, "user_claim", {
          kind: "claim",
          detail: claim.note,
        })
      : out("missing", missingReason, "none"); // an illegal N/A is ignored, never honoured
  }
  return out("self_reported", `Reported by you: ${claim.note}`, "user_claim", {
    kind: "claim",
    detail: claim.note,
  });
}

function evaluate(def: RequirementDef, i: ReadinessInput): Outcome {
  const { metadata: m, evidence: ev, claims } = i;
  const claim = claims[def.key];
  const meta = (ok: boolean, detail: string, miss: string) =>
    ok
      ? out(
          "self_reported",
          `Entered by you (format checked, not verified with the store): ${detail}`,
          "metadata",
          { kind: "metadata", detail },
        )
      : out("missing", miss, "none");
  const scan = ev.scan;
  const noScan = out("missing", "Scan the repository to get evidence for this item.", "none");

  switch (def.key) {
    case "identity.app-name":
      return meta(filled(m.appName, 2), m.appName ?? "", "Enter an app name.");
    case "identity.version": {
      const v = i.releaseVersions.find(isValidVersion);
      return meta(!!v, v ?? "", "Create a release with a version such as 1.0.0.");
    }
    case "build.ci-passing": {
      const s = checkStatus(ev, "ci.green");
      const ref = ev.verification
        ? `verification run ${ev.verification.createdAt}${ev.verification.commitSha ? ` @ ${ev.verification.commitSha.slice(0, 7)}` : ""}`
        : "";
      if (s === "pass")
        return out(
          "verified",
          "Your repository's CI passed on the latest verified commit.",
          "system_evidence",
          { kind: "verification", detail: ref },
        );
      if (s === "fail")
        return out(
          "blocked",
          "Your repository's CI is failing on the latest verified commit.",
          "system_evidence",
          { kind: "verification", detail: ref },
        );
      return out(
        "missing",
        s === "skipped"
          ? "CI is still running; verify again when it finishes."
          : "No CI results available yet. Run verification (needs a connected repository with CI).",
        "none",
      );
    }
    case "testing.evidence": {
      const s = checkStatus(ev, "static.tests-present");
      if (s === "pass")
        return out("verified", "Test files and a test script were found.", "system_evidence", {
          kind: "verification",
          detail: "static check",
        });
      return out(
        "missing",
        s === "fail"
          ? "No tests (or no test script) were found in the repository."
          : "Run verification to check for tests.",
        "none",
      );
    }
    case "security.no-credentials": {
      if (!scan) return noScan;
      return scan.credentialFindings > 0
        ? out(
            "blocked",
            `${scan.credentialFindings} committed credential file(s) or credential pattern(s) detected. Remove them and rotate the secrets.`,
            "system_evidence",
            { kind: "scan", detail: scan.completedAt },
          )
        : out(
            "verified",
            "No committed credential files or credential patterns were detected in the sampled files (a heuristic check).",
            "system_evidence",
            { kind: "scan", detail: `${scan.filesRead} files read` },
          );
    }
    case "security.no-serious-findings": {
      if (!scan) return noScan;
      const n = scan.openCritical + scan.openHigh;
      return n > 0
        ? out(
            "blocked",
            `${n} critical/high finding(s) are still detected by the latest scan.`,
            "system_evidence",
            { kind: "scan", detail: scan.completedAt },
          )
        : out(
            "verified",
            "The latest scan detects no critical or high findings.",
            "system_evidence",
            { kind: "scan", detail: scan.completedAt },
          );
    }
    case "privacy.policy-url":
      return meta(
        filled(m.privacyPolicyUrl),
        m.privacyPolicyUrl ?? "",
        "Add the https address of your privacy policy.",
      );
    case "privacy.data-disclosure": {
      if (m.collectsUserData === false)
        return out("not_applicable", "You declared the app collects no user data.", "metadata", {
          kind: "metadata",
          detail: "collectsUserData = false",
        });
      return fromClaim(
        def,
        claim,
        "Confirm your data collection is disclosed accurately (or declare that the app collects no user data).",
      );
    }
    case "metadata.description":
      return meta(
        filled(m.description, 80),
        `${(m.description ?? "").length} characters`,
        "Write a description of at least 80 characters.",
      );
    case "metadata.category":
      return meta(filled(m.category), m.category ?? "", "Choose a category.");
    case "metadata.support-url":
      return meta(filled(m.supportUrl), m.supportUrl ?? "", "Add an https support page.");
    case "apple.bundle-id": {
      if (scan?.expoIosIdMissing)
        return out(
          "blocked",
          "Your Expo app.json has no ios.bundleIdentifier. Set it to match your bundle identifier.",
          "system_evidence",
          { kind: "scan", detail: scan.completedAt },
        );
      return meta(
        filled(m.bundleId),
        m.bundleId ?? "",
        "Enter your bundle identifier (e.g. com.example.myapp).",
      );
    }
    case "google.package-name": {
      if (scan?.expoAndroidIdMissing)
        return out(
          "blocked",
          "Your Expo app.json has no android.package. Set it to match your application ID.",
          "system_evidence",
          { kind: "scan", detail: scan.completedAt },
        );
      return meta(
        filled(m.packageName),
        m.packageName ?? "",
        "Enter your application ID (e.g. com.example.myapp).",
      );
    }
    case "apple.review-access": {
      if (m.hasLogin === false)
        return out("not_applicable", "You declared the app has no login.", "metadata", {
          kind: "metadata",
          detail: "hasLogin = false",
        });
      return fromClaim(
        def,
        claim,
        "Provide reviewer access in the store's demo-account fields, then confirm here (or declare the app has no login).",
      );
    }
    case "web.site-url":
      return meta(filled(m.siteUrl), m.siteUrl ?? "", "Enter your production https address.");
    case "web.build": {
      const s = checkStatus(ev, "static.build-script");
      return s === "pass"
        ? out(
            "verified",
            "A build script (or no build step is needed) was confirmed by a static check.",
            "system_evidence",
            { kind: "verification", detail: "static check" },
          )
        : out("missing", "Run verification to check for a build script.", "none");
    }
    default:
      return fromClaim(
        def,
        claim,
        def.claimable ? "Complete this step, then confirm it here." : "Not provided yet.",
      );
  }
}

/** Deterministic: the same input always yields the same readiness. Nothing here trusts a stored status. */
export function evaluateReadiness(input: ReadinessInput): Readiness {
  const results: RequirementResult[] = requirementsFor(input.platform).map((def) => {
    const o = evaluate(def, input);
    return {
      key: def.key,
      title: def.title,
      help: def.help,
      category: def.category,
      level: def.level,
      claimable: def.claimable,
      canBeNotApplicable: def.canBeNotApplicable,
      ...o,
    };
  });
  const counts: Record<RequirementStatus, number> = {
    verified: 0,
    self_reported: 0,
    missing: 0,
    blocked: 0,
    not_applicable: 0,
  };
  for (const r of results) counts[r.status]++;
  const required = results.filter((r) => r.level === "required");
  return {
    platform: input.platform,
    results,
    counts,
    readyToSubmit: required.every(
      (r) =>
        r.status === "verified" || r.status === "self_reported" || r.status === "not_applicable",
    ),
    blockers: results.filter((r) => r.status === "blocked").map((r) => `${r.title}: ${r.reason}`),
    missing: required.filter((r) => r.status === "missing").map((r) => r.title),
    requiredTotal: required.length,
    requiredVerified: required.filter((r) => r.status === "verified").length,
    requiredSelfReported: required.filter((r) => r.status === "self_reported").length,
    disclaimer: READINESS_DISCLAIMER,
  };
}
