import { describe, expect, it } from "vitest";
import {
  ACTION_STATUSES,
  canTransition,
  evaluateReadiness,
  isValidVersion,
  looksLikeSecret,
  PLATFORMS,
  RELEASE_STATUSES,
  RELEASE_TRANSITIONS,
  REQUIREMENTS,
  requirementsFor,
  suggestCorrectiveActions,
  unresolvedActions,
  validateMetadata,
  REASON_CATEGORIES,
  type Claim,
  type Platform,
  type PublishingEvidence,
  type ReadinessInput,
  type TargetMetadata,
} from "./index";

const AT = "2026-03-01T10:00:00Z";
const claim = (note = "I did this and it is complete"): Claim => ({
  kind: "self_reported",
  note,
  at: AT,
});
const na = (note = "This app has no such feature at all"): Claim => ({
  kind: "not_applicable",
  note,
  at: AT,
});
const noEvidence: PublishingEvidence = { scan: null, verification: null };
const goodEvidence: PublishingEvidence = {
  scan: {
    completedAt: AT,
    filesRead: 40,
    openCritical: 0,
    openHigh: 0,
    credentialFindings: 0,
    expoIosIdMissing: false,
    expoAndroidIdMissing: false,
  },
  verification: {
    createdAt: AT,
    commitSha: "a".repeat(40),
    checks: [
      { id: "ci.green", status: "pass" },
      { id: "static.tests-present", status: "pass" },
      { id: "static.build-script", status: "pass" },
    ],
  },
};
const fullMeta = (p: Platform): TargetMetadata => ({
  appName: "Habit Hero",
  description:
    "A habit tracker for students that rewards consistency with streaks, quests and friendly reminders.",
  category: "Productivity",
  supportUrl: "https://example.com/support",
  privacyPolicyUrl: "https://example.com/privacy",
  collectsUserData: true,
  hasLogin: true,
  ...(p === "apple_app_store"
    ? { bundleId: "com.example.habit" }
    : p === "google_play"
      ? { packageName: "com.example.habit" }
      : { siteUrl: "https://habit.example.com" }),
});
const claimsFor = (p: Platform) =>
  Object.fromEntries(
    requirementsFor(p)
      .filter((r) => r.claimable)
      .map((r) => [r.key, claim()]),
  );
const input = (p: Platform, o: Partial<ReadinessInput> = {}): ReadinessInput => ({
  platform: p,
  metadata: {},
  claims: {},
  evidence: noEvidence,
  releaseVersions: [],
  ...o,
});
const status = (r: ReturnType<typeof evaluateReadiness>, key: string) =>
  r.results.find((x) => x.key === key)!.status;

describe("requirement catalog", () => {
  it("has unique keys and applicable requirements for every platform", () => {
    expect(new Set(REQUIREMENTS.map((r) => r.key)).size).toBe(REQUIREMENTS.length);
    for (const p of PLATFORMS) expect(requirementsFor(p).length).toBeGreaterThan(10);
    expect(requirementsFor("apple_app_store").some((r) => r.key.startsWith("google."))).toBe(false);
    expect(requirementsFor("web").some((r) => r.key === "assets.icon")).toBe(false); // mobile-only
  });
  it("never uses compliance or approval wording", () => {
    for (const r of REQUIREMENTS)
      expect(`${r.title} ${r.help}`).not.toMatch(/\b(compliant|approved|guaranteed)\b/i);
  });
});

describe("readiness engine", () => {
  it("an empty project is not ready and everything required is missing", () => {
    for (const p of PLATFORMS) {
      const r = evaluateReadiness(input(p));
      expect(r.readyToSubmit).toBe(false);
      expect(r.counts.verified).toBe(0);
      expect(r.missing.length).toBe(r.requiredTotal - r.counts.not_applicable);
      expect(r.disclaimer).toMatch(/not an approval/);
    }
  });

  it("is ready only with metadata + claims + system evidence together, and says what is verified", () => {
    for (const p of PLATFORMS) {
      const r = evaluateReadiness(
        input(p, {
          metadata: fullMeta(p),
          claims: claimsFor(p),
          evidence: goodEvidence,
          releaseVersions: ["1.0.0"],
        }),
      );
      expect(r.blockers).toEqual([]);
      expect(r.missing).toEqual([]);
      expect(r.readyToSubmit).toBe(true);
      expect(r.requiredVerified).toBeGreaterThanOrEqual(4); // CI, tests, credentials, serious findings
      expect(r.requiredSelfReported).toBeGreaterThan(0); // and plenty the user only reported
    }
  });

  it("a user's claim can never become 'verified' or clear a blocker", () => {
    // claims on system-evidence items are ignored; CI failing stays blocked whatever the user says
    const failing: PublishingEvidence = {
      ...goodEvidence,
      verification: {
        createdAt: AT,
        commitSha: null,
        checks: [
          { id: "ci.green", status: "fail" },
          { id: "static.tests-present", status: "pass" },
        ],
      },
    };
    const r = evaluateReadiness(
      input("google_play", {
        metadata: fullMeta("google_play"),
        claims: {
          ...claimsFor("google_play"),
          "build.ci-passing": claim("CI is fine now, trust me"),
        },
        evidence: failing,
        releaseVersions: ["1.0.0"],
      }),
    );
    expect(status(r, "build.ci-passing")).toBe("blocked");
    expect(r.readyToSubmit).toBe(false);
    expect(r.blockers.join()).toMatch(/CI is failing/);
    // across the whole catalog, claims alone never produce verified
    for (const p of PLATFORMS) {
      const all = Object.fromEntries(REQUIREMENTS.map((q) => [q.key, claim()]));
      expect(evaluateReadiness(input(p, { claims: all })).counts.verified).toBe(0);
    }
  });

  it("serious findings and committed credentials block; clean scans verify", () => {
    const bad = (o: object): PublishingEvidence => ({
      ...goodEvidence,
      scan: { ...goodEvidence.scan!, ...o },
    });
    const base = {
      metadata: fullMeta("web"),
      claims: claimsFor("web"),
      releaseVersions: ["1.0.0"],
    };
    expect(
      status(
        evaluateReadiness(input("web", { ...base, evidence: bad({ credentialFindings: 2 }) })),
        "security.no-credentials",
      ),
    ).toBe("blocked");
    expect(
      status(
        evaluateReadiness(input("web", { ...base, evidence: bad({ openHigh: 1 }) })),
        "security.no-serious-findings",
      ),
    ).toBe("blocked");
    expect(
      status(
        evaluateReadiness(input("web", { ...base, evidence: goodEvidence })),
        "security.no-serious-findings",
      ),
    ).toBe("verified");
    expect(
      status(
        evaluateReadiness(input("web", { ...base, evidence: noEvidence })),
        "security.no-serious-findings",
      ),
    ).toBe("missing"); // no scan = missing, not assumed fine
  });

  it("platform identity is cross-checked against the repository (Expo app.json)", () => {
    const ev: PublishingEvidence = {
      ...goodEvidence,
      scan: { ...goodEvidence.scan!, expoIosIdMissing: true },
    };
    const r = evaluateReadiness(
      input("apple_app_store", { metadata: fullMeta("apple_app_store"), evidence: ev }),
    );
    expect(status(r, "apple.bundle-id")).toBe("blocked"); // typed in, but the repo disagrees
    expect(
      status(
        evaluateReadiness(
          input("google_play", { metadata: fullMeta("google_play"), evidence: ev }),
        ),
        "google.package-name",
      ),
    ).toBe("self_reported");
  });

  it("not-applicable is honoured only where allowed, or when declared in metadata", () => {
    expect(
      status(
        evaluateReadiness(input("apple_app_store", { claims: { "apple.review-access": na() } })),
        "apple.review-access",
      ),
    ).toBe("not_applicable");
    expect(
      status(
        evaluateReadiness(input("apple_app_store", { metadata: { hasLogin: false } })),
        "apple.review-access",
      ),
    ).toBe("not_applicable");
    // N/A on a requirement that does not allow it is ignored
    const r = evaluateReadiness(
      input("apple_app_store", { claims: { "apple.signing": na("we skip signing entirely") } }),
    );
    expect(status(r, "apple.signing")).toBe("missing");
    expect(
      status(
        evaluateReadiness(input("web", { metadata: { collectsUserData: false } })),
        "privacy.data-disclosure",
      ),
    ).toBe("not_applicable");
  });

  it("incomplete metadata is 'missing', not a silent pass", () => {
    const r = evaluateReadiness(
      input("web", {
        metadata: { appName: "X", description: "too short", privacyPolicyUrl: "https://e.co/p" },
      }),
    );
    expect(status(r, "identity.app-name")).toBe("missing"); // < 2 chars
    expect(status(r, "metadata.description")).toBe("missing");
    expect(status(r, "privacy.policy-url")).toBe("self_reported");
    expect(status(r, "identity.version")).toBe("missing");
    expect(
      status(
        evaluateReadiness(input("web", { releaseVersions: ["not-a-version"] })),
        "identity.version",
      ),
    ).toBe("missing");
  });

  it("is deterministic", () => {
    const i = input("apple_app_store", {
      metadata: fullMeta("apple_app_store"),
      claims: claimsFor("apple_app_store"),
      evidence: goodEvidence,
      releaseVersions: ["2.1.0"],
    });
    expect(JSON.stringify(evaluateReadiness(i))).toBe(JSON.stringify(evaluateReadiness(i)));
  });

  it("recommended items do not gate submission", () => {
    const r = evaluateReadiness(
      input("web", {
        metadata: fullMeta("web"),
        claims: Object.fromEntries(
          Object.entries(claimsFor("web")).filter(
            ([k]) => k !== "web.accessibility" && k !== "web.consent",
          ),
        ),
        evidence: goodEvidence,
        releaseVersions: ["1.0.0"],
      }),
    );
    expect(status(r, "web.accessibility")).toBe("missing");
    expect(r.readyToSubmit).toBe(true);
  });
});

describe("metadata validation", () => {
  it("accepts valid per-platform fields and rejects wrong-platform, bad, or secret-bearing input", () => {
    expect(
      validateMetadata("apple_app_store", { appName: "Habit Hero", bundleId: "com.example.habit" })
        .ok,
    ).toBe(true);
    expect(validateMetadata("google_play", { packageName: "com.example.habit" }).ok).toBe(true);
    expect(validateMetadata("web", { siteUrl: "https://example.com" }).ok).toBe(true);
    for (const [p, v] of [
      ["apple_app_store", { packageName: "com.example.habit" }],
      ["web", { bundleId: "com.example.habit" }],
      ["web", { siteUrl: "http://insecure.example" }],
      ["apple_app_store", { bundleId: "not a bundle" }],
      ["google_play", { packageName: "Com.Example" }],
      ["web", { privacyPolicyUrl: "javascript:alert(1)" }],
      ["web", { unknown: 1 }],
      ["web", { appName: "x".repeat(31) }],
    ] as const)
      expect(validateMetadata(p, v).ok, JSON.stringify(v)).toBe(false);
    const secret = validateMetadata("apple_app_store", {
      reviewNotes: "Login with password: hunter2hunter2",
    });
    expect(secret.ok).toBe(false);
    expect(looksLikeSecret("AKIA" + "ABCDEFGHIJKLMNOP")).toBe(true);
    expect(looksLikeSecret("Tap the settings tab, then choose Export")).toBe(false);
  });
});

describe("release lifecycle", () => {
  it("only allows documented transitions; terminal states are final", () => {
    for (const from of RELEASE_STATUSES)
      for (const to of RELEASE_STATUSES)
        expect(canTransition(from, to)).toBe(RELEASE_TRANSITIONS[from].includes(to));
    expect(canTransition("draft", "submitted")).toBe(false); // cannot skip readiness
    expect(canTransition("draft", "approved")).toBe(false); // cannot claim approval without a submission
    expect(canTransition("ready", "released")).toBe(false);
    expect(canTransition("submitted", "released")).toBe(false);
    expect(canTransition("approved", "rejected")).toBe(false);
    expect(RELEASE_TRANSITIONS.released).toEqual([]);
    expect(RELEASE_TRANSITIONS.withdrawn).toEqual([]);
    expect(canTransition("rejected", "submitted")).toBe(true); // resubmission
  });
  it("validates versions", () => {
    for (const ok of ["1.0.0", "0.1.12", "2.10.3-beta.1", "10.0.0+45"])
      expect(isValidVersion(ok), ok).toBe(true);
    for (const bad of ["1", "1.0", "v1.0.0", "1.0.0.0", "a.b.c", "", "1.0.0 ", "1.0.0-"])
      expect(isValidVersion(bad) && bad.trim() === bad, bad).toBe(false);
  });
  it("suggests corrective actions for every rejection category", () => {
    for (const c of REASON_CATEGORIES) {
      const s = suggestCorrectiveActions(c);
      expect(s.length).toBeGreaterThan(0);
      for (const a of s) {
        expect(a.title.length).toBeGreaterThan(5);
        for (const k of a.requirementKeys)
          expect(
            REQUIREMENTS.some((r) => r.key === k),
            k,
          ).toBe(true);
      }
    }
    expect(suggestCorrectiveActions("privacy")[0]!.requirementKeys).toContain("privacy.policy-url");
  });
  it("won't-fix needs a reason before resubmission", () => {
    expect(ACTION_STATUSES).toEqual(["open", "in_progress", "done", "wont_fix"]);
    expect(
      unresolvedActions([
        { status: "done" },
        { status: "wont_fix", note: "Reviewer misread the guideline; replied" },
      ]),
    ).toBe(0);
    expect(
      unresolvedActions([
        { status: "open" },
        { status: "in_progress" },
        { status: "wont_fix" },
        { status: "wont_fix", note: "no" },
      ]),
    ).toBe(4);
  });
});
