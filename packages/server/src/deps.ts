import type { GitHubGateway } from "@buildapps/github/types";
import type { Stores } from "./store";

export interface Deps {
  stores: Stores;
  /** Null when no GitHub App is configured: GitHub features then report `unavailable`. */
  gateway: GitHubGateway | null;
  /** Secret for signing OAuth `state` (server env only). */
  stateSecret: string;
  now?: () => Date;
}
export const nowOf = (d: Deps): Date => (d.now ? d.now() : new Date());
