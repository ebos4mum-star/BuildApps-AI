import type { Lesson } from "../types";
import { bug, mat, scn, seq, wb } from "./dsl";

export const uxDesign: Lesson[] = [
  {
    id: "ux-1",
    skillId: "ux-design",
    title: "Clarity and hierarchy",
    summary: "Make the most important thing obvious.",
    hook: "Users decide in seconds. A clear hierarchy tells them where to look and what to do.",
    exercises: [
      mat(
        "ux-1-match",
        1,
        "Is each element a primary action, a secondary action, or supporting text?",
        [
          ["primary", "Primary action"],
          ["secondary", "Secondary action"],
          ["support", "Supporting text"],
        ],
        [
          ["buy", "Place order (the main goal of the page)", "primary"],
          ["back", "Back to cart", "secondary"],
          ["note", "Delivery takes 2-3 days", "support"],
          ["save", "Save for later", "secondary"],
        ],
        "One primary action per screen, visually strongest. Secondary actions stay quieter and supporting text explains without competing.",
      ),
      scn(
        "ux-1-scn",
        1,
        "How should you fix this screen?",
        "A form has five equally bright buttons: Save, Cancel, Delete account, Export, Help. Users keep clicking the wrong one.",
        [
          ["more", "Make all buttons bigger", "Bigger everything is still equal weight."],
          [
            "rank",
            "Make one primary, mute the rest, and separate the destructive one",
            "Right: rank actions and isolate danger.",
          ],
          ["hide", "Remove the form", "That removes the feature, not the confusion."],
        ],
        "rank",
        "Hierarchy comes from contrast: one obvious primary action, quieter alternatives, and destructive actions set apart and confirmed.",
      ),
      bug(
        "ux-1-bug",
        2,
        "Tap the accessibility problem in this markup.",
        "Form.tsx",
        [
          "<form onSubmit={save}>",
          '  <input placeholder="Email" />',
          "  <button>Send</button>",
          "</form>",
        ],
        [1],
        "A placeholder disappears as soon as you type and is not a label for screen readers. Use a real <label> connected to the input.",
      ),
    ],
  },
  {
    id: "ux-2",
    skillId: "ux-design",
    title: "Feedback and accessibility",
    summary: "Tell users what happened, and design for everyone.",
    hook: "Silent apps feel broken. Accessible apps reach more people and are usually easier for everybody.",
    exercises: [
      mat(
        "ux-2-match",
        1,
        "What feedback fits each moment?",
        [
          ["inline", "Inline message"],
          ["toast", "Brief confirmation"],
          ["confirm", "Confirmation dialog"],
        ],
        [
          ["field", "Email format is invalid", "inline"],
          ["saved", "Settings were saved", "toast"],
          ["delete", "About to delete a project permanently", "confirm"],
          ["pwd", "Password is too short", "inline"],
        ],
        "Put errors beside the field, confirm harmless successes briefly, and require explicit confirmation before irreversible actions.",
      ),
      wb(
        "ux-2-wb",
        2,
        "Complete the accessibility checklist.",
        [
          "Every image needs ",
          { blank: "a" },
          " text, every input needs a ",
          { blank: "b" },
          ", and information must not rely on ",
          { blank: "c" },
          " alone.",
        ],
        [
          ["alt", "alternative"],
          ["label", "label"],
          ["color", "color"],
          ["size", "size"],
          ["shadow", "shadow"],
        ],
        { a: "alt", b: "label", c: "color" },
        "Alternative text, labels and non-colour cues let screen-reader users and colour-blind users complete the same tasks as everyone else.",
      ),
      scn(
        "ux-2-scn",
        2,
        "A user has 'reduce motion' turned on. What should the app do?",
        "Your celebration screen has a big confetti animation.",
        [
          [
            "ignore",
            "Play it anyway; it is just visual",
            "Motion can cause nausea or distraction for some people.",
          ],
          [
            "respect",
            "Reduce or skip the animation and show the same information statically",
            "Right: honour prefers-reduced-motion.",
          ],
          [
            "remove",
            "Remove the celebration for everyone",
            "Unnecessary; adapt for those who ask.",
          ],
        ],
        "respect",
        "The prefers-reduced-motion setting is an explicit user request. Apps should keep the information and drop the motion.",
      ),
    ],
  },
];

export const flows: Lesson[] = [
  {
    id: "flows-1",
    skillId: "flows",
    title: "Navigation and user flows",
    summary: "Map how people move through the app.",
    hook: "Apps feel broken when people get lost. A flow map shows dead ends before you build them.",
    exercises: [
      seq(
        "flows-1-seq",
        1,
        "Order a typical sign-up flow.",
        [
          ["land", "Landing page"],
          ["signup", "Create account"],
          ["verify", "Confirm email"],
          ["onboard", "Short onboarding"],
          ["home", "Home screen"],
        ],
        "A flow should be the shortest honest path to value. Each extra step before value loses users.",
      ),
      mat(
        "flows-1-match",
        1,
        "Which navigation pattern suits each app?",
        [
          ["tabs", "Bottom tabs"],
          ["stack", "Stack with back button"],
          ["drawer", "Side menu"],
        ],
        [
          ["social", "Home, Search, Profile used all the time", "tabs"],
          ["detail", "Open an order, then its items", "stack"],
          ["many", "Twenty rarely used admin sections", "drawer"],
          ["learn", "Learn, Projects, Expert: top-level destinations", "tabs"],
        ],
        "Frequent top-level destinations belong in tabs, drill-downs use a stack, and large rarely used sets fit a menu.",
      ),
      scn(
        "flows-1-scn",
        2,
        "What is the flow bug?",
        "After deleting their last project, users see a blank page with no way back to anything.",
        [
          [
            "deadend",
            "A dead end: no next action or navigation",
            "Right: every state needs a way forward.",
          ],
          ["slow", "The page loads slowly", "Unrelated to the described problem."],
          ["color", "The page is the wrong colour", "Unrelated to the described problem."],
        ],
        "deadend",
        "Every screen, including empty and success states, needs a clear next action so users are never stranded.",
      ),
    ],
  },
];

flows.push({
  id: "flows-2",
  skillId: "flows",
  title: "Deep links and recovery paths",
  summary: "Plan for back buttons, expired sessions and shared links.",
  hook: "Real users arrive from emails, refresh pages and lose sessions. Flows must survive that.",
  exercises: [
    scn(
      "flows-2-scn",
      2,
      "What should happen?",
      "A signed-out user opens a shared link to /projects/42.",
      [
        ["blank", "Show a blank page", "A blank page tells the user nothing and loses them."],
        [
          "login",
          "Send them to sign in, then return them to /projects/42",
          "Right: preserve the destination through sign-in.",
        ],
        [
          "home",
          "Send them to the home page and forget the link",
          "They would have to find the page again.",
        ],
      ],
      "login",
      "Remembering where the user was going turns an interruption into a smooth continuation.",
    ),
    seq(
      "flows-2-seq",
      2,
      "Order the checks when a protected page opens.",
      [
        ["session", "Is there a valid session?"],
        ["owner", "Does the user have permission for this record?"],
        ["load", "Load the data"],
        ["render", "Render the right state (loading, empty, error, content)"],
      ],
      "Check identity, then permission, then load and render. Rendering before checking can flash data a user should never see.",
    ),
    mat(
      "flows-2-match",
      3,
      "Which screen state needs an escape route?",
      [
        ["needs", "Needs a clear way forward"],
        ["fine", "Fine as is"],
      ],
      [
        ["err", "A failed payment", "needs"],
        ["done", "A completed onboarding with a Continue button", "fine"],
        ["empty", "An empty project list", "needs"],
        ["expired", "An expired session", "needs"],
      ],
      "Error, empty and expired states are where users get stranded, so each needs a retry, a start action or a sign-in path.",
    ),
  ],
});

export const backend: Lesson[] = [
  {
    id: "back-1",
    skillId: "backend",
    title: "What the server is for",
    summary: "Decide what belongs on the server, not in the browser.",
    hook: "Anything the user's device can see or change cannot be trusted. The server is where rules live.",
    exercises: [
      mat(
        "back-1-match",
        1,
        "Should this run in the client or on the server?",
        [
          ["client", "Client"],
          ["server", "Server"],
        ],
        [
          ["anim", "Button hover animation", "client"],
          ["price", "Calculating the order total", "server"],
          ["valid", "Checking a user is allowed to see a record", "server"],
          ["modal", "Opening a dialog", "client"],
          ["secret", "Calling a paid API with a secret key", "server"],
        ],
        "Presentation lives in the client. Anything involving money, permission or secrets belongs on the server because clients can be modified by whoever holds them.",
      ),
      scn(
        "back-1-scn",
        2,
        "What is wrong with this design?",
        "The app sends {userId: 7, isAdmin: true, price: 0} from the browser and the server stores it as sent.",
        [
          [
            "trust",
            "The server trusts values the client can forge",
            "Right: never trust client-supplied roles, prices or ids.",
          ],
          [
            "json",
            "JSON is the wrong format",
            "The format is fine; the trust model is the problem.",
          ],
          ["slow", "It is too slow", "Not the issue described."],
        ],
        "trust",
        "The server must derive identity from the session and compute prices and roles itself. Client input is only a request.",
      ),
      seq(
        "back-1-seq",
        2,
        "Order how a server should handle a request.",
        [
          ["auth", "Identify who is calling"],
          ["validate", "Validate the input shape"],
          ["authorize", "Check they may do this"],
          ["act", "Perform the change"],
          ["respond", "Return a useful result or error"],
        ],
        "Authenticate, validate, authorize, act, respond. Doing the change before checking permission is the classic security hole.",
      ),
    ],
  },
  {
    id: "back-2",
    skillId: "backend",
    title: "APIs that behave",
    summary: "Predictable requests, errors and retries.",
    hook: "A good API is boring: the same request gives the same result, and failures tell you why.",
    exercises: [
      mat(
        "back-2-match",
        1,
        "Which status family fits each outcome?",
        [
          ["ok", "2xx success"],
          ["client", "4xx caller's fault"],
          ["server", "5xx server's fault"],
        ],
        [
          ["created", "Record created", "ok"],
          ["bad", "Missing required field", "client"],
          ["crash", "Unhandled exception in the server", "server"],
          ["forbidden", "User not allowed to see this", "client"],
          ["fine", "Data returned", "ok"],
        ],
        "Status codes tell callers whether to fix their request (4xx) or retry later (5xx). Returning 200 for everything hides real failures.",
      ),
      wb(
        "back-2-wb",
        2,
        "Complete the idempotency rule.",
        [
          "A retried request should not ",
          { blank: "a" },
          " the work twice; clients send an ",
          { blank: "b" },
          " key so the server can recognise the repeat.",
        ],
        [
          ["dup", "duplicate"],
          ["idem", "idempotency"],
          ["fast", "faster"],
          ["color", "colour"],
        ],
        { a: "dup", b: "idem" },
        "Networks fail and clients retry. Idempotency keys make a double tap or retry safe, so nobody gets charged or enrolled twice.",
      ),
      bug(
        "back-2-bug",
        3,
        "Tap the line that leaks internal details.",
        "api/orders.ts",
        [
          "try {",
          "  const order = await createOrder(body);",
          "  return json(order, 201);",
          "} catch (e) {",
          "  return json({ error: String(e.stack), query: lastSql }, 500);",
          "}",
        ],
        [4],
        "Returning stack traces and SQL helps attackers and confuses users. Log details on the server and return a short safe message.",
      ),
    ],
  },
];

export const databases: Lesson[] = [
  {
    id: "db-1",
    skillId: "databases",
    title: "Tables, keys and relationships",
    summary: "Model data so it stays consistent.",
    hook: "A good data model makes whole classes of bugs impossible. A bad one makes them permanent.",
    exercises: [
      mat(
        "db-1-match",
        1,
        "What is each database term?",
        [
          ["table", "Table"],
          ["pk", "Primary key"],
          ["fk", "Foreign key"],
        ],
        [
          ["orders", "A collection of rows like orders", "table"],
          ["id", "A column that uniquely identifies each row", "pk"],
          ["user", "A column pointing at a row in another table", "fk"],
          ["users", "The users records", "table"],
        ],
        "Tables hold rows, primary keys identify them and foreign keys link them. Relationships are how data stays consistent.",
      ),
      scn(
        "db-1-scn",
        2,
        "How should you store a user's many orders?",
        "A beginner stores order1, order2, order3 as columns on the user.",
        [
          [
            "cols",
            "Keep adding columns",
            "You will run out of columns and queries become painful.",
          ],
          [
            "table",
            "A separate orders table with a user_id foreign key",
            "Right: one row per order, linked to the user.",
          ],
          ["text", "Put all orders in one text field", "Impossible to query or validate."],
        ],
        "table",
        "One-to-many relationships become a child table with a foreign key. That scales and can be validated by the database itself.",
      ),
      seq(
        "db-1-seq",
        2,
        "Order a safe schema change.",
        [
          ["write", "Write a migration file"],
          ["local", "Run it on a local database"],
          ["test", "Run tests against the new schema"],
          ["review", "Review the migration in the diff"],
          ["apply", "Apply it to production deliberately"],
        ],
        "Schema changes are code: versioned, tried locally, tested and reviewed. Editing production tables by hand leaves no record and no undo.",
      ),
    ],
  },
  {
    id: "db-2",
    skillId: "databases",
    title: "Supabase and row-level security",
    summary: "Let the database enforce who sees what.",
    hook: "In Supabase the browser can talk to the database directly. Row-level security is the lock on that door.",
    exercises: [
      scn(
        "db-2-scn",
        2,
        "What is the risk?",
        "A table `notes` has RLS disabled. The app only shows each user their own notes in the UI.",
        [
          [
            "fine",
            "None, the UI hides other notes",
            "The UI is not a security boundary; anyone can query the API directly.",
          ],
          [
            "rls",
            "Any signed-in user can read everyone's notes via the API",
            "Right: without RLS the database serves whatever is asked.",
          ],
          ["slow", "Queries will be slower", "Speed is unrelated to access control."],
        ],
        "rls",
        "Hiding data in the UI does nothing for the API. RLS policies make the database itself refuse requests for other people's rows.",
      ),
      wb(
        "db-2-wb",
        3,
        "Complete the policy idea.",
        [
          "Enable ",
          { blank: "a" },
          " on the table, then add a policy so a user can select only rows where ",
          { blank: "b" },
          " equals the signed-in user.",
        ],
        [
          ["rls", "row-level security"],
          ["owner", "owner_id"],
          ["title", "title"],
          ["index", "an index"],
        ],
        { a: "rls", b: "owner" },
        "Turning RLS on denies everything by default; policies then grant precisely the access you intend, usually by comparing the row owner to the authenticated user.",
      ),
      mat(
        "db-2-match",
        2,
        "Which key may be used where?",
        [
          ["public", "Safe in the browser"],
          ["secret", "Server only"],
        ],
        [
          ["anon", "The anon / publishable key (with RLS on)", "public"],
          ["service", "The service role key", "secret"],
          ["url", "The project URL", "public"],
          ["dbpass", "The database password", "secret"],
        ],
        "The service role bypasses RLS, so it must never ship in a client app. Public keys are only safe because RLS limits what they can do.",
      ),
    ],
  },
];
