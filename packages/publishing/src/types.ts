export const PLATFORMS = ["apple_app_store", "google_play", "web"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = {
  apple_app_store: "Apple App Store",
  google_play: "Google Play",
  web: "Web",
};

/**
 * verified       - proven by system evidence BuildApps can observe (a scan, repository CI results, static checks)
 * self_reported  - entered or claimed by the user; format-checked at most, NEVER proof
 * missing        - nothing provided yet
 * blocked        - system evidence shows a problem that must be fixed (a user claim cannot override it)
 * not_applicable - declared not relevant (only for requirements that allow it, with a reason)
 */
export type RequirementStatus =
  "verified" | "self_reported" | "missing" | "blocked" | "not_applicable";

export type RequirementCategory =
  | "identity"
  | "build"
  | "security"
  | "privacy"
  | "metadata"
  | "assets"
  | "signing"
  | "testing"
  | "platform";

export interface RequirementDef {
  key: string;
  platforms: readonly Platform[];
  category: RequirementCategory;
  title: string;
  help: string;
  level: "required" | "recommended";
  /** May the user declare this requirement not applicable (with a reason)? */
  canBeNotApplicable: boolean;
  /** May the user self-report it (a claim)? False for items derived only from entered metadata or system evidence. */
  claimable: boolean;
}

export interface Claim {
  kind: "self_reported" | "not_applicable";
  note: string;
  at: string;
}

export interface RequirementResult {
  key: string;
  title: string;
  help: string;
  category: RequirementCategory;
  level: "required" | "recommended";
  status: RequirementStatus;
  /** Why the item has this status, in plain language. */
  reason: string;
  source: "system_evidence" | "metadata" | "user_claim" | "none";
  claimable: boolean;
  canBeNotApplicable: boolean;
  evidence?: { kind: "scan" | "verification" | "metadata" | "claim"; detail: string };
}

export interface PublishingEvidence {
  scan: {
    completedAt: string;
    filesRead: number;
    openCritical: number;
    openHigh: number;
    /** committed env/credential files or credential patterns still detected */
    credentialFindings: number;
    expoIosIdMissing: boolean;
    expoAndroidIdMissing: boolean;
  } | null;
  verification: {
    createdAt: string;
    commitSha: string | null;
    checks: { id: string; status: "pass" | "fail" | "skipped" | "unavailable" }[];
  } | null;
}

export interface Readiness {
  platform: Platform;
  results: RequirementResult[];
  counts: Record<RequirementStatus, number>;
  /** Every REQUIRED item is verified, self-reported or not applicable - and none is missing or blocked. */
  readyToSubmit: boolean;
  blockers: string[];
  missing: string[];
  requiredTotal: number;
  requiredVerified: number;
  requiredSelfReported: number;
  disclaimer: string;
}

export const READINESS_DISCLAIMER =
  "Readiness shows the evidence BuildApps can see. It is not an approval and does not mean a store will accept your app. BuildApps has not submitted anything: submissions and review outcomes here are recorded by you.";
