import type { Lesson } from "../types";
import { bug, mat, scn, seq } from "./dsl";

/** Advanced security and operations. */
export const advancedSecurity: Lesson[] = [
  {
    id: "sec-3",
    skillId: "security",
    title: "Threat modelling your app",
    summary: "Think like an attacker for ten minutes before you ship.",
    hook: "You cannot defend what you have not listed. A threat model is a short list of what you protect, from whom, and how.",
    exercises: [
      seq(
        "sec-3-seq",
        2,
        "Order a lightweight threat-modelling session.",
        [
          ["assets", "List what is valuable (accounts, data, keys)"],
          ["entry", "List how data enters (forms, APIs, webhooks, uploads)"],
          ["abuse", "Ask 'how could someone misuse each entry point?'"],
          ["mitigate", "Pick mitigations, highest risk first"],
          ["test", "Write tests proving the top mitigations work"],
        ],
        "Start from assets and entry points, then think adversarially. Prioritize by impact so the first hours of work go to the real risks.",
      ),
      mat(
        "sec-3-match",
        3,
        "Match each threat to its main defense.",
        [
          ["authz", "Authorization checks / RLS"],
          ["valid", "Input validation and encoding"],
          ["rate", "Rate limiting"],
          ["audit", "Audit logging"],
        ],
        [
          ["a", "User A reads user B's records", "authz"],
          ["b", "Script floods the login endpoint", "rate"],
          ["c", "Malicious text breaks out into HTML", "valid"],
          ["d", "An admin quietly changes data and nobody can tell", "audit"],
          ["e", "A user edits a project they do not own", "authz"],
        ],
        "Every defense answers a specific threat. If you cannot say which threat a control stops, it is probably theater.",
      ),
      scn(
        "sec-3-scn",
        3,
        "Which is the highest-impact risk for a notes app with private notes?",
        "You can only fix one thing this week.",
        [
          [
            "idor",
            "Missing ownership checks, so changing an id in the URL reveals someone else's note.",
            "Yes: broken access control exposes the very data users trust you with, and it is easy to exploit.",
          ],
          ["logo", "The logo is slightly pixelated.", "Cosmetic issues do not endanger users."],
          ["emoji", "Notes cannot contain emoji.", "A functionality gap, not a security risk."],
        ],
        "idor",
        "Broken access control tops real-world breach lists. Verify ownership on the server for every read and write.",
      ),
    ],
  },
  {
    id: "sec-4",
    skillId: "security",
    title: "Injection and unsafe input",
    summary: "SQL injection, XSS and why concatenating strings is dangerous.",
    hook: "Every injection bug is the same mistake: treating data as instructions.",
    exercises: [
      bug(
        "sec-4-bug",
        2,
        "Tap the line vulnerable to SQL injection.",
        "search.ts",
        [
          "export async function search(term: string) {",
          "  const sql = `select * from products where name = '${term}'`;",
          "  return db.query(sql);",
          "}",
        ],
        [1],
        "Putting user input into the SQL string lets \"' or '1'='1\" rewrite the query. Use parameters: db.query('select * from products where name = $1', [term]).",
      ),
      bug(
        "sec-4-bug2",
        2,
        "Tap the line that can run an attacker's script (XSS).",
        "Comment.tsx",
        [
          "function Comment({ html }) {",
          "  return (",
          "    <div dangerouslySetInnerHTML={{ __html: html }} />",
          "  );",
          "}",
        ],
        [2],
        "Injecting raw user HTML runs any <script> or event handler inside it. Render text as text (React escapes it by default) or sanitize with a vetted library.",
      ),
      mat(
        "sec-4-match",
        2,
        "Which defense stops which attack?",
        [
          ["param", "Parameterized queries"],
          ["escape", "Output encoding / sanitizing"],
          ["csrf", "SameSite cookies / CSRF tokens"],
        ],
        [
          ["a", "SQL injection", "param"],
          ["b", "Stored XSS in a comment", "escape"],
          ["c", "A malicious site triggers a POST using your cookie", "csrf"],
          ["d", "Attacker-controlled filter text in a query", "param"],
        ],
        "Match the control to where untrusted data lands: databases need parameters, HTML needs encoding, and cookies need cross-site protections.",
      ),
      scn(
        "sec-4-scn",
        3,
        "The AI offers to 'fix' the SQL error by wrapping input in escape-quotes manually. Best response?",
        "It writes a custom escape function.",
        [
          [
            "param",
            "Reject it; use the driver's parameterized queries.",
            "Yes: hand-rolled escaping is a famous source of bypasses. Parameters keep data and code separate by construction.",
          ],
          [
            "accept",
            "Accept it; escaping is escaping.",
            "Subtle encoding cases routinely defeat custom escapes.",
          ],
          [
            "strip",
            "Strip all punctuation from input.",
            "It breaks legitimate names like O'Brien while still missing other attack shapes.",
          ],
        ],
        "param",
        "Never build injection defenses by hand when the platform provides a safe primitive.",
      ),
    ],
  },
];

export const advancedOps: Lesson[] = [
  {
    id: "maint-2",
    skillId: "maintenance",
    title: "Dependencies and updates",
    summary: "Keep libraries current without breaking the app.",
    hook: "Most of your app is other people's code. Keeping it updated is part of owning it.",
    exercises: [
      scn(
        "maint-2-scn",
        2,
        "A scanner reports a critical vulnerability in a library you use. What now?",
        "A patch version is available.",
        [
          [
            "upgrade",
            "Upgrade to the patched version, run the tests, and deploy promptly.",
            "Right: a small, tested patch upgrade is the usual safe route.",
          ],
          [
            "ignore",
            "Ignore it; nobody attacks small apps.",
            "Attacks are automated and indiscriminate.",
          ],
          [
            "remove",
            "Delete the lockfile and reinstall everything.",
            "That upgrades everything at once and can introduce many unrelated breakages.",
          ],
        ],
        "upgrade",
        "Upgrade the affected package in a small change, verify with tests, then ship. Lockfiles keep builds reproducible.",
      ),
      mat(
        "maint-2-match",
        2,
        "Is this version bump likely safe?",
        [
          ["safe", "Usually safe (patch/minor)"],
          ["care", "Needs care (major)"],
        ],
        [
          ["a", "2.4.1 -> 2.4.2", "safe"],
          ["b", "2.4.1 -> 2.5.0", "safe"],
          ["c", "2.4.1 -> 3.0.0", "care"],
          ["d", "A package deprecated with no maintainer", "care"],
        ],
        "Semantic versioning signals risk: patches fix bugs, minors add features compatibly and majors may break callers. Abandoned packages are a risk on their own.",
      ),
      seq(
        "maint-2-seq",
        2,
        "Order a safe dependency update.",
        [
          ["branch", "Create a branch"],
          ["bump", "Update one package (or one group)"],
          ["test", "Run type-check and tests"],
          ["try", "Smoke-test the app"],
          ["merge", "Merge and deploy"],
        ],
        "Small batches make it obvious what broke when something does.",
      ),
    ],
  },
  {
    id: "maint-3",
    skillId: "maintenance",
    title: "Incidents and postmortems",
    summary: "Respond calmly, communicate, and learn without blame.",
    hook: "Every app has an outage. Teams are judged by how they respond and what they change afterwards.",
    exercises: [
      seq(
        "maint-3-seq",
        2,
        "Order the response to a production incident.",
        [
          ["detect", "Detect and confirm the impact"],
          ["mitigate", "Mitigate (roll back, disable the feature)"],
          ["comm", "Tell affected users what is happening"],
          ["fix", "Fix the root cause"],
          ["review", "Write a blameless postmortem"],
        ],
        "Stop the bleeding before you diagnose. Keep users informed. Learning is the last step but the one that prevents a repeat.",
      ),
      mat(
        "maint-3-match",
        2,
        "Which belongs in a postmortem?",
        [
          ["yes", "Include"],
          ["no", "Leave out"],
        ],
        [
          ["a", "Timeline of events", "yes"],
          ["b", "Root cause and contributing factors", "yes"],
          ["c", "Who to blame", "no"],
          ["d", "Concrete follow-up actions with owners", "yes"],
          ["e", "Secrets or customer personal data", "no"],
        ],
        "Postmortems explain systems, not villains. They are shared widely, so they must not contain secrets or personal data.",
      ),
      scn(
        "maint-3-scn",
        3,
        "Which follow-up action is best?",
        "A migration dropped a column that a background job still used.",
        [
          [
            "guard",
            "Add a check in CI that flags destructive migrations, and require expand/contract.",
            "A systemic guard prevents the entire class of mistake.",
          ],
          ["careful", "Tell the team to be more careful.", "Reminders do not scale; systems do."],
          [
            "fire",
            "Remove the person who ran it.",
            "Blame hides problems and makes people conceal mistakes.",
          ],
        ],
        "guard",
        "Good follow-ups change the system (checks, automation, safer defaults) so the next person cannot make the same mistake.",
      ),
    ],
  },
];
