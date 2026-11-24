import type { GitHubGateway } from "@buildapps/github/types";
import type { IsolationAttestation } from "@buildapps/sandbox";
import type { Stores } from "./store";

export interface Deps {
  stores: Stores;
  /** Null when no GitHub App is configured: GitHub features then report `unavailable`. */
  gateway: GitHubGateway | null;
  /** Secret for signing OAuth `state` (server env only). */
  stateSecret: string;
  /**
   * Isolated execution, if any. Absent by default: runtime verification then reports `unavailable` and no
   * repository code runs. A backend only counts after its probe attestation is current and complete.
   */
  sandbox?: { backendName: string; attestation: IsolationAttestation | null };
  now?: () => Date;
}
export const nowOf = (d: Deps): Date => (d.now ? d.now() : new Date());
