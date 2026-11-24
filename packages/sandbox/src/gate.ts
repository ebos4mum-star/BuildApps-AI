import { ISOLATION_CONTROLS, type IsolationAttestation } from "./contract";

export type RuntimeAvailability =
  | { available: true; backend: string; verifiedAt: string; expiresAt: string }
  | {
      available: false;
      reason: string;
      code: "no_backend" | "not_attested" | "incomplete" | "expired";
    };

/**
 * The single decision point for "may untrusted code run?". Fails closed: it requires an attestation from a
 * configured backend that proves EVERY control and has not expired.
 */
export function runtimeAvailability(
  backendName: string | null,
  attestation: IsolationAttestation | null,
  now: Date,
): RuntimeAvailability {
  if (!backendName)
    return {
      available: false,
      code: "no_backend",
      reason:
        "No isolated execution backend is configured. Repository code is never run on BuildApps servers.",
    };
  if (!attestation || attestation.backend !== backendName)
    return {
      available: false,
      code: "not_attested",
      reason: "The execution backend has not yet proven its isolation.",
    };
  if (
    Date.parse(attestation.expiresAt) <= now.getTime() ||
    Number.isNaN(Date.parse(attestation.expiresAt))
  )
    return {
      available: false,
      code: "expired",
      reason: "The isolation proof has expired and must be re-run.",
    };
  const missing = ISOLATION_CONTROLS.filter((c) => !attestation.proven.includes(c));
  if (missing.length > 0 || attestation.failed.length > 0)
    return {
      available: false,
      code: "incomplete",
      reason: `Isolation is not fully proven (missing: ${missing.join(", ") || attestation.failed.join(", ")}).`,
    };
  return {
    available: true,
    backend: backendName,
    verifiedAt: attestation.checkedAt,
    expiresAt: attestation.expiresAt,
  };
}
