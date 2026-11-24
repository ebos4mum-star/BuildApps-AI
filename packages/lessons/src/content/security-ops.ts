import type { Lesson } from "../types";
import { bug, mat, scn, seq, wb } from "./dsl";

export const auth: Lesson[] = [
  {
    id: "auth-1",
    skillId: "auth",
    title: "Who are you, and what may you do?",
    summary: "Authentication versus authorization.",
    hook: "Most serious app breaches are not clever hacks. They are missing permission checks.",
    exercises: [
      mat(
        "auth-1-match",
        1,
        "Is each question about authentication or authorization?",
        [
          ["authn", "Authentication (who)"],
          ["authz", "Authorization (may they)"],
        ],
        [
          ["login", "Is this really Sam?", "authn"],
          ["edit", "May Sam edit this project?", "authz"],
          ["pwd", "Does the password match?", "authn"],
          ["admin", "Is Sam allowed to open the admin area?", "authz"],
        ],
        "Authentication proves identity; authorization decides permissions for that identity. Apps need both, on the server, for every request.",
      ),
      scn(
        "auth-1-scn",
        2,
        "What is the bug?",
        "GET /api/invoices/42 returns the invoice for any signed-in user who asks for id 42.",
        [
          [
            "idor",
            "Missing ownership check: users can read other people's invoices by changing the id",
            "Right: this is an insecure direct object reference.",
          ],
          ["login", "Users are not logged in", "They are logged in; that is not the issue."],
          ["cache", "Caching is misconfigured", "Not what is described."],
        ],
        "idor",
        "Being signed in is not permission. Every record access must check that the record belongs to, or is shared with, the caller.",
      ),
      seq(
        "auth-1-seq",
        2,
        "Order a safe login flow.",
        [
          ["submit", "User submits credentials over HTTPS"],
          ["verify", "Server verifies them against hashed passwords"],
          ["session", "Server issues a short-lived session token"],
          ["store", "Client stores the token securely"],
          ["check", "Each later request is checked against the session"],
        ],
        "Credentials travel only over HTTPS, passwords are stored hashed, sessions are short lived, and every request is re-checked server-side.",
      ),
    ],
  },
  {
    id: "auth-2",
    skillId: "auth",
    title: "Sessions, tokens and roles",
    summary: "Handle sign-in state safely across web and mobile.",
    hook: "One account across web and mobile means one identity and one set of rules, enforced in one place.",
    exercises: [
      mat(
        "auth-2-match",
        2,
        "Where should each item be stored?",
        [
          ["secure", "Secure storage"],
          ["plain", "Plain app storage is acceptable"],
          ["never", "Never in the client"],
        ],
        [
          ["token", "Session or refresh token", "secure"],
          ["theme", "Dark mode preference", "plain"],
          ["service", "Service role key", "never"],
          ["lang", "Chosen language", "plain"],
        ],
        "Anything that grants access belongs in secure storage; harmless preferences can be plain; powerful secrets never reach a client.",
      ),
      bug(
        "auth-2-bug",
        2,
        "Tap the insecure line.",
        "profile.ts",
        [
          "const role = req.body.role;",
          "const user = await getUser(session.userId);",
          "if (role === 'admin') grantAdminTools(user);",
        ],
        [0, 2],
        "The role comes from the request body, which anyone can edit. Roles must be read from the server's own records for the authenticated user.",
      ),
      scn(
        "auth-2-scn",
        3,
        "A user reports their phone was stolen. What should the system support?",
        "The phone has a signed-in session.",
        [
          [
            "wait",
            "Nothing; the session expires eventually",
            "Waiting leaves the thief with access.",
          ],
          [
            "revoke",
            "Let the user sign out everywhere / revoke sessions",
            "Right: revocation limits the damage.",
          ],
          ["email", "Email the user a reminder", "Does not stop the stolen session."],
        ],
        "revoke",
        "Short-lived tokens plus the ability to revoke sessions limit what a lost device can do.",
      ),
    ],
  },
];

export const apiIntegrations: Lesson[] = [
  {
    id: "integr-1",
    skillId: "api-integrations",
    title: "Connecting to other services",
    summary: "Keys, webhooks and failure handling.",
    hook: "Most apps are glue between services. The glue has to survive outages, retries and untrusted callers.",
    exercises: [
      mat(
        "integr-1-match",
        1,
        "Is each item a request you make or a callback you receive?",
        [
          ["call", "You call them"],
          ["hook", "They call you (webhook)"],
        ],
        [
          ["geocode", "Look up an address", "call"],
          ["paid", "Notification that a payment finished", "hook"],
          ["email", "Send a welcome email", "call"],
          ["push", "A repo push event from GitHub", "hook"],
        ],
        "Calls are initiated by your server. Webhooks are initiated by the other service, so they must be verified as genuine.",
      ),
      scn(
        "integr-1-scn",
        2,
        "How should you treat this webhook?",
        "An endpoint /api/webhook marks orders as paid whenever it receives a JSON body saying so.",
        [
          [
            "accept",
            "Accept it; the sender is probably the provider",
            "Anyone can post to a public URL.",
          ],
          [
            "verify",
            "Verify the provider's signature before acting",
            "Right: HMAC signature verification proves origin.",
          ],
          ["hide", "Keep the URL secret", "Secret URLs leak; signatures do not."],
        ],
        "verify",
        "Never act on an unauthenticated webhook. Verify the signature with the shared secret, and make handling idempotent.",
      ),
      wb(
        "integr-1-wb",
        2,
        "Complete the resilience rule.",
        [
          "External calls can fail, so set a ",
          { blank: "a" },
          ", retry with ",
          { blank: "b" },
          ", and show the user a clear message if it still fails.",
        ],
        [
          ["timeout", "timeout"],
          ["backoff", "exponential backoff"],
          ["louder", "louder logs"],
          ["unlimited", "unlimited retries"],
        ],
        { a: "timeout", b: "backoff" },
        "Timeouts stop a slow service from freezing yours, and backoff avoids hammering a struggling one. Unlimited retries make outages worse.",
      ),
    ],
  },
];

export const security: Lesson[] = [
  {
    id: "sec-1",
    skillId: "security",
    title: "Secrets and safe defaults",
    summary: "Keep keys out of code and out of Git.",
    hook: "Bots scan public repositories for keys within minutes. A leaked key is a compromised account.",
    exercises: [
      bug(
        "sec-1-bug",
        1,
        "Tap the line that must never be committed.",
        "config.ts",
        [
          "export const config = {",
          "  appName: 'Pet Walker',",
          "  supabaseUrl: process.env.SUPABASE_URL,",
          "  paymentSecret: 'paste-your-live-key-here',",
          "};",
        ],
        [3],
        "A hard-coded secret key lives forever in Git history. Read secrets from environment variables and rotate any key that was ever committed.",
      ),
      seq(
        "sec-1-seq",
        2,
        "Order your response to a leaked key.",
        [
          ["revoke", "Revoke or rotate the key immediately"],
          ["scope", "Check what the key could access and its logs"],
          ["remove", "Remove it from code and use environment variables"],
          ["prevent", "Add secret scanning to prevent a repeat"],
        ],
        "Rotation first because deleting the line does not un-leak it. Then assess impact, fix the code and add a guard.",
      ),
      mat(
        "sec-1-match",
        2,
        "Which of these is a security risk?",
        [
          ["risk", "Risk"],
          ["ok", "Fine"],
        ],
        [
          ["env", ".env file listed in .gitignore", "ok"],
          ["pub", "Service key in client-side code", "risk"],
          ["rls", "RLS policies on user tables", "ok"],
          ["log", "Logging full passwords for debugging", "risk"],
        ],
        "Keeping secrets out of Git and clients, enforcing access rules and not logging sensitive data are baseline habits.",
      ),
    ],
  },
  {
    id: "sec-2",
    skillId: "security",
    title: "Privacy and user data",
    summary: "Collect less, protect more, tell users the truth.",
    hook: "Stores and users both expect you to explain what you collect. The safest data is data you never stored.",
    exercises: [
      mat(
        "sec-2-match",
        1,
        "Is each item personal data you must disclose?",
        [
          ["pii", "Personal data"],
          ["none", "Not personal"],
        ],
        [
          ["email", "User email address", "pii"],
          ["theme", "Count of total app downloads", "none"],
          ["loc", "Precise location", "pii"],
          ["ver", "App version number", "none"],
        ],
        "Anything identifying or tracking a person is personal data. Aggregated counts and version numbers are not.",
      ),
      scn(
        "sec-2-scn",
        2,
        "What should you do?",
        "You want to add analytics that records each user's contacts to 'improve suggestions'. You do not need it for any feature.",
        [
          [
            "collect",
            "Collect it now in case it is useful",
            "Unneeded data is liability and store-review risk.",
          ],
          ["minimal", "Do not collect data you have no feature for", "Right: data minimisation."],
          [
            "hide",
            "Collect it but do not mention it",
            "Undisclosed collection breaks policy and law.",
          ],
        ],
        "minimal",
        "Collect only what a feature needs, disclose it in your privacy policy, and delete it when it is no longer needed.",
      ),
      wb(
        "sec-2-wb",
        2,
        "Complete the privacy checklist.",
        [
          "Publish a ",
          { blank: "a" },
          " policy, let users ",
          { blank: "b" },
          " their account and data, and collect only what you need.",
        ],
        [
          ["privacy", "privacy"],
          ["delete", "delete"],
          ["rename", "rename"],
          ["colour", "colour"],
        ],
        { a: "privacy", b: "delete" },
        "App stores require a privacy policy and account deletion for apps with accounts. Offering it from the start avoids rejection later.",
      ),
    ],
  },
];

export const debugging: Lesson[] = [
  {
    id: "debug-1",
    skillId: "debugging",
    title: "Rescue a broken app",
    summary: "A systematic way to fix what AI broke.",
    hook: "When an AI-built app stops working, panic edits make it worse. A method makes it tractable.",
    exercises: [
      seq(
        "debug-1-seq",
        2,
        "Order a systematic debugging process.",
        [
          ["repro", "Reproduce the problem reliably"],
          ["narrow", "Narrow down where it starts (last good commit, failing line)"],
          ["hypo", "Form one hypothesis"],
          ["test", "Test it with one change"],
          ["lock", "Add a test so it cannot return"],
        ],
        "Reproduce, narrow, hypothesise, test, lock in. Changing many things at once means you cannot tell what fixed it.",
      ),
      scn(
        "debug-1-scn",
        2,
        "It worked yesterday. What is the most useful next step?",
        "Today the build fails after three AI-generated changes.",
        [
          [
            "rewrite",
            "Rewrite the feature from scratch",
            "You would lose the information in the diff.",
          ],
          [
            "bisect",
            "Compare against the last working commit and undo changes one at a time",
            "Right: version control turns 'it broke' into 'this change broke it'.",
          ],
          [
            "ignore",
            "Ignore the failing build and keep adding features",
            "Failures compound when ignored.",
          ],
        ],
        "bisect",
        "Git history is a debugging tool. Finding the change that introduced the failure is usually faster than reasoning about the whole app.",
      ),
      bug(
        "debug-1-bug",
        3,
        "Tap the line that causes 'Cannot read properties of undefined'.",
        "list.tsx",
        [
          "const { data } = useQuery('items');",
          "return (",
          "  <ul>",
          "    {data.items.map((i) => <li key={i.id}>{i.name}</li>)}",
          "  </ul>",
          ");",
        ],
        [3],
        "While loading, data is undefined, so data.items throws. Guard for loading and missing data before reading its fields.",
      ),
    ],
  },
  {
    id: "debug-2",
    skillId: "debugging",
    title: "Logs and reproduction",
    summary: "Find the cause from evidence.",
    hook: "Good debuggers collect evidence before touching code.",
    exercises: [
      mat(
        "debug-2-match",
        1,
        "Which tool answers each question?",
        [
          ["console", "Browser console"],
          ["network", "Network tab"],
          ["serverlog", "Server logs"],
        ],
        [
          ["js", "Did a JavaScript error occur?", "console"],
          ["status", "What status did the API return?", "network"],
          ["exc", "Which exception did the server throw?", "serverlog"],
          ["payload", "What body did the browser send?", "network"],
        ],
        "The console shows client errors, the network tab shows requests and responses, and server logs show what happened behind the API.",
      ),
      scn(
        "debug-2-scn",
        2,
        "What is the best reproduction report?",
        "You must tell a teammate or an AI what is broken.",
        [
          ["broken", "The app is broken", "No steps, no evidence."],
          [
            "steps",
            "On /checkout with an empty cart, clicking Pay shows a blank page; console: 'TypeError: cart.items'",
            "Right: location, steps and evidence.",
          ],
          ["angry", "Checkout NEVER works!!!", "Emotion is not evidence."],
        ],
        "steps",
        "A good report lets someone else see the failure in two minutes: where, what you did, what you saw, and the exact error.",
      ),
      wb(
        "debug-2-wb",
        2,
        "Complete the logging rule.",
        [
          "Log what happened and the ",
          { blank: "a" },
          ", but never log ",
          { blank: "b" },
          " or personal data.",
        ],
        [
          ["context", "request context"],
          ["secrets", "secrets"],
          ["fun", "jokes"],
          ["colors", "colours"],
        ],
        { a: "context", b: "secrets" },
        "Useful logs include enough context to trace a problem, but credentials and personal data in logs become a second leak.",
      ),
    ],
  },
];

export const maintenance: Lesson[] = [
  {
    id: "maint-1",
    skillId: "maintenance",
    title: "Keeping an app healthy",
    summary: "Updates, monitoring and safe changes after launch.",
    hook: "Launching is the start. Apps that are not maintained break, become insecure and get removed from stores.",
    exercises: [
      mat(
        "maint-1-match",
        1,
        "How often should each be done?",
        [
          ["always", "Continuously (automated)"],
          ["regular", "Regularly (e.g. monthly)"],
          ["event", "When something happens"],
        ],
        [
          ["tests", "Run automated tests on every change", "always"],
          ["deps", "Review dependency updates", "regular"],
          ["incident", "Investigate an alert or crash report", "event"],
          ["scan", "Scan for leaked secrets", "always"],
        ],
        "Automate repeatable checks, schedule regular reviews, and respond to events. Maintenance by memory eventually does not happen.",
      ),
      seq(
        "maint-1-seq",
        2,
        "Order a safe update of a dependency.",
        [
          ["branch", "Create a branch"],
          ["update", "Update the dependency"],
          ["tests", "Run tests and the app"],
          ["review", "Review the changelog for breaking changes"],
          ["merge", "Merge once everything passes"],
        ],
        "Updates are code changes: do them on a branch, verify, review release notes, then merge. Blind bulk updates cause surprise breakage.",
      ),
      scn(
        "maint-1-scn",
        2,
        "What should you do about this crash report?",
        "Users on one Android version report the app crashes on launch. Your own phone is fine.",
        [
          ["ignore", "Ignore it; it works on your device", "Your device is one data point."],
          [
            "repro",
            "Reproduce on that Android version or emulator and fix with a test",
            "Right: reproduce first, then fix and lock in.",
          ],
          [
            "remove",
            "Stop supporting that Android version silently",
            "Unannounced drops lose users.",
          ],
        ],
        "repro",
        "Real devices differ. Reproducing on the affected configuration turns an anecdote into a testable bug.",
      ),
    ],
  },
];
