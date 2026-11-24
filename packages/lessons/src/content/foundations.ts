import type { Lesson } from "../types";
import { bug, mat, scn, seq, wb } from "./dsl";

export const aiBuilders: Lesson[] = [
  {
    id: "builders-1",
    skillId: "ai-builders",
    title: "What an AI builder really does",
    summary: "Models, context and generated code - and where they fall short.",
    hook: "An AI app builder is a code generator with a short memory. Knowing its limits is how you stay in control.",
    exercises: [
      mat(
        "builders-1-match",
        1,
        "Which part of the AI building loop is each item?",
        [
          ["you", "You decide"],
          ["ai", "The AI produces"],
          ["tools", "Your tools check"],
        ],
        [
          ["goal", "What the app should do for users", "you"],
          ["code", "A first draft of the screens and logic", "ai"],
          ["tests", "Whether the build and tests pass", "tools"],
          ["accept", "Whether the result is good enough to keep", "you"],
          ["lint", "Style and type errors", "tools"],
        ],
        "The AI drafts, tools check mechanically, and you own the goal and the final judgement. Giving away the judgement is how broken apps reach users.",
      ),
      scn(
        "builders-1-scn",
        1,
        "Why did this happen?",
        "You asked the builder to 'add a settings page'. It did, but it silently removed the login check from another page.",
        [
          [
            "knows",
            "The AI understood your whole app perfectly and chose to remove it",
            "The model only sees the context it was given; it does not hold the whole app in mind.",
          ],
          [
            "context",
            "The AI worked from limited context and made a change with side effects",
            "Right: generated changes can touch more than you asked. Review diffs, not just the new screen.",
          ],
          [
            "bug",
            "The builder is broken and should be abandoned",
            "Side effects are normal for generated code; the fix is a review habit, not a new tool.",
          ],
        ],
        "context",
        "Models work from the context they are given and optimise for the request. Reviewing the diff of every change catches the collateral damage before it ships.",
      ),
      seq(
        "builders-1-seq",
        2,
        "Order a safe loop for each AI-generated change.",
        [
          ["ask", "Describe one small change"],
          ["gen", "Let the AI generate it"],
          ["diff", "Read the diff of what changed"],
          ["run", "Run the app and the checks"],
          ["save", "Commit the working result"],
        ],
        "Small request, generate, review, verify, save. Committing only after verification gives you a known-good point to return to.",
      ),
    ],
  },
  {
    id: "builders-2",
    skillId: "ai-builders",
    title: "Strengths and blind spots",
    summary: "Where generated code is reliable and where it quietly fails.",
    hook: "AI is excellent at boilerplate and weak at things it cannot see: your production data, your secrets, your users.",
    exercises: [
      mat(
        "builders-2-match",
        2,
        "Is the AI usually reliable or risky here?",
        [
          ["good", "Usually reliable"],
          ["risky", "Needs your scrutiny"],
        ],
        [
          ["form", "A standard sign-up form layout", "good"],
          ["auth", "Who is allowed to read each user's data", "risky"],
          ["css", "Making a card look like a mock-up", "good"],
          ["pay", "Handling payment webhooks safely", "risky"],
          ["rls", "Database access rules", "risky"],
        ],
        "Boilerplate and presentation are well represented in training data. Security, money and access rules fail silently, so those need human review and tests.",
      ),
      scn(
        "builders-2-scn",
        2,
        "What is the best response?",
        "The AI says: 'Done! Everything is working and secure.' You have not run anything yet.",
        [
          [
            "trust",
            "Believe it and deploy",
            "A model's statement is not evidence. It cannot see your running app.",
          ],
          [
            "verify",
            "Treat it as a claim and verify by running checks",
            "Right: confidence is not proof. Run the app and tests yourself.",
          ],
          [
            "ask",
            "Ask the AI again whether it is sure",
            "Asking again returns another claim, not evidence.",
          ],
        ],
        "verify",
        "Verification means observable evidence: a passing build, a test, or a scan. AI statements are claims to check, which is exactly how BuildApps treats them too.",
      ),
      wb(
        "builders-2-wb",
        2,
        "Complete the rule of thumb.",
        [
          "Treat AI output as a ",
          { blank: "a" },
          " that you must ",
          { blank: "b" },
          " before relying on it.",
        ],
        [
          ["draft", "draft"],
          ["verify", "verify"],
          ["final", "final answer"],
          ["ignore", "ignore"],
        ],
        { a: "draft", b: "verify" },
        "A draft invites review; a final answer discourages it. Verification turns the draft into something you can trust.",
      ),
    ],
  },
];

export const specs: Lesson[] = [
  {
    id: "specs-1",
    skillId: "specs",
    title: "From idea to spec",
    summary: "Turn a vague idea into something buildable.",
    hook: "'An app for dog walkers' is not a spec. Who uses it, to do what, and how will you know it works?",
    exercises: [
      seq(
        "specs-1-seq",
        1,
        "Order the steps of turning an idea into a spec.",
        [
          ["user", "Name who the app is for"],
          ["problem", "State the problem they have"],
          ["stories", "List the key things they must be able to do"],
          ["scope", "Cut everything not needed for a first version"],
          ["accept", "Write how you will know each thing works"],
        ],
        "Start with the person and problem, then actions, then ruthlessly cut scope, then define done. Specs that skip scope never finish.",
      ),
      mat(
        "specs-1-match",
        1,
        "Is each line a goal, a requirement, or out of scope for version 1?",
        [
          ["goal", "Goal"],
          ["req", "Requirement"],
          ["out", "Out of scope (later)"],
        ],
        [
          ["g1", "Let walkers get paid fairly and on time", "goal"],
          ["r1", "A walker can accept or decline a booking", "req"],
          ["o1", "In-app video calls", "out"],
          ["r2", "An owner can see the booking status", "req"],
          ["o2", "A loyalty points programme", "out"],
        ],
        "Goals say why, requirements say what must exist, and out-of-scope items protect the first release from growing forever.",
      ),
      scn(
        "specs-1-scn",
        2,
        "Which acceptance criterion is best?",
        "Feature: an owner books a walk.",
        [
          [
            "vague",
            "Booking should be easy and fast",
            "Not testable: nobody can say whether it passed.",
          ],
          [
            "testable",
            "After choosing a walker, date and time, the owner sees a confirmation with the booking status 'pending'",
            "Right: observable and testable.",
          ],
          [
            "tech",
            "Use a modern framework for bookings",
            "That is an implementation choice, not an outcome.",
          ],
        ],
        "testable",
        "Good acceptance criteria describe an observable result so both you and a test can decide pass or fail.",
      ),
    ],
  },
  {
    id: "specs-2",
    skillId: "specs",
    title: "Data and screens on paper",
    summary: "Sketch entities and screens before any code exists.",
    hook: "Ten minutes sketching the data and screens saves hours of regenerating the wrong app.",
    exercises: [
      mat(
        "specs-2-match",
        1,
        "Is each item a thing the app stores (entity), a screen, or an action?",
        [
          ["entity", "Stored thing"],
          ["screen", "Screen"],
          ["action", "Action"],
        ],
        [
          ["booking", "Booking", "entity"],
          ["list", "Upcoming walks list", "screen"],
          ["cancel", "Cancel a booking", "action"],
          ["walker", "Walker profile", "entity"],
          ["checkout", "Booking confirmation page", "screen"],
        ],
        "Entities become tables, screens become routes, actions become buttons and API calls. Separating them early keeps the plan clear.",
      ),
      wb(
        "specs-2-wb",
        2,
        "Complete the relationship description.",
        [
          "One ",
          { blank: "a" },
          " can have many bookings, and each booking belongs to exactly one ",
          { blank: "b" },
          ".",
        ],
        [
          ["owner", "owner"],
          ["walker", "walker"],
          ["color", "color"],
          ["page", "page"],
        ],
        { a: "owner", b: "walker" },
        "Stating one-to-many relationships in plain language is what you later turn into foreign keys. Some relationship wording is enough for the AI to draft the tables.",
        "Sketching the data model.",
      ),
      scn(
        "specs-2-scn",
        3,
        "What is missing from this spec?",
        "Spec: 'Owners book walks. Walkers accept bookings.' The AI builds it and anyone can accept any booking.",
        [
          [
            "perm",
            "Who is allowed to do each action",
            "Right: permissions are part of the spec; the AI cannot guess them.",
          ],
          ["color", "A colour palette", "Nice to have, but unrelated to the problem."],
          ["logo", "A logo", "Branding does not cause this bug."],
        ],
        "perm",
        "Specs must say who may do what. Without it the generated app defaults to 'anyone can do anything'.",
      ),
    ],
  },
];

export const prompting: Lesson[] = [
  {
    id: "prompt-1",
    skillId: "prompting",
    title: "Instructions that work",
    summary: "Write requests an AI builder can act on precisely.",
    hook: "The difference between a frustrating session and a smooth one is usually the request.",
    exercises: [
      scn(
        "prompt-1-scn",
        1,
        "Which request will get the best result?",
        "You want a password reset flow.",
        [
          ["a", "Make login better", "Too vague: the AI will guess what 'better' means."],
          [
            "b",
            "Add a 'Forgot password' link on /login that emails a reset link using Supabase auth, and show a confirmation message. Do not change other pages.",
            "Right: specific outcome, location, mechanism and a boundary.",
          ],
          [
            "c",
            "Rewrite the whole auth system with best practices",
            "A huge open request invites collateral changes.",
          ],
        ],
        "b",
        "Good instructions state the outcome, where it lives, the tools to use and what must not change.",
      ),
      mat(
        "prompt-1-match",
        1,
        "Which part of a good request is each sentence?",
        [
          ["goal", "Goal"],
          ["constraint", "Constraint"],
          ["verify", "How to check"],
        ],
        [
          ["a", "Show the last 10 orders on the dashboard", "goal"],
          ["b", "Do not modify the orders table", "constraint"],
          [
            "c",
            "The page loads without console errors and shows 10 rows for the seed user",
            "verify",
          ],
          ["d", "Use the existing Card component", "constraint"],
        ],
        "Goal, constraints and a way to check make a request actionable and reviewable.",
      ),
      wb(
        "prompt-1-wb",
        2,
        "Complete the request template.",
        [
          "Add ",
          { blank: "a" },
          " to the ",
          { blank: "b" },
          ". Keep ",
          { blank: "c" },
          " unchanged and tell me how to test it.",
        ],
        [
          ["feat", "a search box"],
          ["page", "products page"],
          ["rest", "all other pages"],
          ["vibe", "make it pop"],
          ["all", "everything"],
        ],
        { a: "feat", b: "page", c: "rest" },
        "A feature, a place, a boundary and a test instruction fit in one sentence. Vague words like 'make it pop' cannot be verified.",
      ),
    ],
  },
  {
    id: "prompt-2",
    skillId: "prompting",
    title: "Iterating and recovering",
    summary: "What to do when the AI gets it wrong.",
    hook: "Good builders do not retry the same prompt louder. They change what the AI knows.",
    exercises: [
      scn(
        "prompt-2-scn",
        2,
        "The same bug survived three attempts. What now?",
        "You keep pasting 'it still doesn't work, fix it'.",
        [
          ["again", "Paste the same sentence again", "Repeating gives the AI no new information."],
          [
            "evidence",
            "Paste the exact error, the file and what you expected, then ask for a diagnosis before a fix",
            "Right: concrete evidence plus asking for the cause first.",
          ],
          [
            "restart",
            "Delete the project and restart",
            "Destroys working progress without understanding the cause.",
          ],
        ],
        "evidence",
        "New evidence changes the answer. Asking for diagnosis first stops the AI from stacking guesses on top of each other.",
      ),
      seq(
        "prompt-2-seq",
        2,
        "Order a good debugging prompt.",
        [
          ["expected", "What you expected to happen"],
          ["actual", "What actually happened"],
          ["error", "The exact error text"],
          ["where", "The file and recent change involved"],
          ["ask", "Ask for the likely cause before changing code"],
        ],
        "Expected, actual, evidence, location, then a request for diagnosis gives the model what it needs to reason rather than guess.",
      ),
      bug(
        "prompt-2-bug",
        3,
        "Tap the part of this prompt that makes it risky.",
        "prompt",
        [
          "The checkout page crashes with 'TypeError: price is undefined' in cart.ts line 40.",
          "Fix it. While you are there, refactor the whole app to use a different state library",
          "and also change the database layout.",
        ],
        [1, 2],
        "Bundling unrelated big changes with a bug fix makes failures impossible to trace. One problem per request.",
      ),
    ],
  },
];

export const frontend: Lesson[] = [
  {
    id: "front-1",
    skillId: "frontend",
    title: "Components and state",
    summary: "How screens are assembled and how they change.",
    hook: "Every screen is components plus state. When the UI is wrong, one of those two is wrong.",
    exercises: [
      mat(
        "front-1-match",
        1,
        "Is each item props, state, or markup?",
        [
          ["props", "Props (passed in)"],
          ["state", "State (changes over time)"],
          ["markup", "Markup (what renders)"],
        ],
        [
          ["title", "The title a parent gives a Card", "props"],
          ["count", "How many items are in the cart right now", "state"],
          ["btn", "<button>Add</button>", "markup"],
          ["open", "Whether a menu is open", "state"],
          ["label", "The label a parent gives a Button", "props"],
        ],
        "Props flow down from parents, state belongs to the component that changes it, and markup is the result. Knowing which is which tells you where a bug lives.",
      ),
      bug(
        "front-1-bug",
        2,
        "This counter never updates the screen. Tap the buggy line.",
        "Counter.tsx",
        [
          "export function Counter() {",
          "  let count = 0;",
          "  return (",
          "    <button onClick={() => { count = count + 1; }}>",
          "      Clicked {count} times",
          "    </button>",
          "  );",
          "}",
        ],
        [1],
        "A plain variable resets on every render and changing it does not trigger one. Use state (useState) so React re-renders when it changes.",
      ),
      scn(
        "front-1-scn",
        2,
        "Where should this state live?",
        "Two sibling components both need the currently selected product.",
        [
          ["each", "Duplicate it in each component", "They would drift out of sync."],
          [
            "parent",
            "Lift it to their common parent and pass it down",
            "Right: one source of truth.",
          ],
          [
            "global",
            "Put every piece of state in a global store",
            "Over-sharing makes everything coupled.",
          ],
        ],
        "parent",
        "Lifting state to the nearest common parent keeps one source of truth without making everything global.",
      ),
    ],
  },
  {
    id: "front-2",
    skillId: "frontend",
    title: "Loading, empty and error states",
    summary: "The three screens most generated apps forget.",
    hook: "Real users hit slow networks and empty lists constantly. A polished app handles all three states.",
    exercises: [
      mat(
        "front-2-match",
        1,
        "Which state is each situation?",
        [
          ["loading", "Loading"],
          ["empty", "Empty"],
          ["error", "Error"],
          ["ok", "Success"],
        ],
        [
          ["spin", "Request in flight, no data yet", "loading"],
          ["none", "Request succeeded and returned zero items", "empty"],
          ["fail", "Request failed with a 500", "error"],
          ["list", "Request returned 12 items", "ok"],
        ],
        "Every data screen has four faces. Designing all four avoids blank pages and confusing silent failures.",
      ),
      seq(
        "front-2-seq",
        2,
        "Order the render logic for a data screen.",
        [
          ["err", "If there is an error, show it with a retry"],
          ["load", "Else if loading, show a placeholder"],
          ["empty", "Else if there are no items, show a helpful empty state"],
          ["list", "Otherwise render the list"],
        ],
        "Check failure first, then loading, then empty, and only then render data. This order never shows a misleading 'empty' while still loading.",
      ),
      scn(
        "front-2-scn",
        3,
        "What is wrong with this empty state?",
        "A new user opens the Projects page and sees a blank white area.",
        [
          ["fine", "Nothing, they have no projects", "Blank is indistinguishable from broken."],
          [
            "guide",
            "It should explain and offer the next action ('Start your first project')",
            "Right: empty states are onboarding moments.",
          ],
          [
            "hide",
            "The page should be hidden for new users",
            "Hiding does not help users get started.",
          ],
        ],
        "guide",
        "A good empty state tells users that nothing is wrong and what to do next.",
      ),
    ],
  },
];
