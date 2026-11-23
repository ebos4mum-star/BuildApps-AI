/** Release/submission lifecycle. BuildApps submits nothing: every status here is recorded by the user. */
export const RELEASE_STATUSES = [
  "draft",
  "ready",
  "submitted",
  "in_review",
  "rejected",
  "approved",
  "released",
  "withdrawn",
] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const RELEASE_TRANSITIONS: Readonly<Record<ReleaseStatus, readonly ReleaseStatus[]>> = {
  draft: ["ready", "withdrawn"],
  ready: ["draft", "submitted", "withdrawn"],
  submitted: ["in_review", "approved", "rejected", "withdrawn"],
  in_review: ["approved", "rejected", "withdrawn"],
  rejected: ["submitted", "withdrawn"], // submitted = a RESUBMISSION (new attempt), gated by corrective actions
  approved: ["released"],
  released: [],
  withdrawn: [],
};
export const canTransition = (from: ReleaseStatus, to: ReleaseStatus) =>
  RELEASE_TRANSITIONS[from].includes(to);

export const isValidVersion = (v: string): boolean =>
  /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-+][0-9A-Za-z.-]{1,20})?$/.test(v.trim());

export const REVIEW_OUTCOMES = ["rejected", "approved", "info_requested"] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export const REASON_CATEGORIES = [
  "metadata",
  "privacy",
  "crash_or_bug",
  "guideline",
  "security",
  "legal",
  "performance",
  "other",
] as const;
export type ReasonCategory = (typeof REASON_CATEGORIES)[number];

export interface SuggestedAction {
  title: string;
  detail: string;
  /** Requirement keys worth re-checking for this kind of rejection. */
  requirementKeys: string[];
}

/** Deterministic starting points for a rejection. They are suggestions the user can edit, not store policy. */
export function suggestCorrectiveActions(category: ReasonCategory): SuggestedAction[] {
  switch (category) {
    case "metadata":
      return [
        {
          title: "Fix store listing metadata",
          detail:
            "Compare your description, screenshots and category with what the app actually does, then update them.",
          requirementKeys: ["metadata.description", "metadata.category", "assets.screenshots"],
        },
      ];
    case "privacy":
      return [
        {
          title: "Align privacy policy and data disclosures",
          detail:
            "Make the privacy policy, the store's data-collection answers and the app's real behaviour agree.",
          requirementKeys: ["privacy.policy-url", "privacy.data-disclosure", "google.data-safety"],
        },
      ];
    case "crash_or_bug":
      return [
        {
          title: "Reproduce and fix the reported crash or bug",
          detail:
            "Test a release build on a real device, read the crash log, fix it and get CI green.",
          requirementKeys: ["build.ci-passing", "testing.evidence"],
        },
      ];
    case "security":
      return [
        {
          title: "Resolve the security concern",
          detail: "Remove committed secrets, fix serious findings and re-scan.",
          requirementKeys: ["security.no-credentials", "security.no-serious-findings"],
        },
      ];
    case "guideline":
      return [
        {
          title: "Address the cited guideline",
          detail: "Read the guideline the reviewer cited and change the app or listing to meet it.",
          requirementKeys: [],
        },
      ];
    case "legal":
      return [
        {
          title: "Resolve the legal or content concern",
          detail: "Check ownership of content, licences and required disclosures.",
          requirementKeys: ["privacy.policy-url"],
        },
      ];
    case "performance":
      return [
        {
          title: "Improve performance or stability",
          detail: "Profile the app on a real device and fix slow or unresponsive screens.",
          requirementKeys: ["testing.evidence"],
        },
      ];
    default:
      return [
        {
          title: "Respond to the reviewer's message",
          detail: "Read the message carefully and decide what to change.",
          requirementKeys: [],
        },
      ];
  }
}

export type ActionStatus = "open" | "in_progress" | "done" | "wont_fix";
export const ACTION_STATUSES: readonly ActionStatus[] = ["open", "in_progress", "done", "wont_fix"];

/** After a rejection every corrective action must be resolved before resubmitting; "wont_fix" needs a reason. */
export function unresolvedActions(
  actions: readonly { status: ActionStatus; note?: string | null }[],
): number {
  return actions.filter(
    (a) =>
      a.status === "open" ||
      a.status === "in_progress" ||
      (a.status === "wont_fix" && !(a.note && a.note.trim().length >= 5)),
  ).length;
}
