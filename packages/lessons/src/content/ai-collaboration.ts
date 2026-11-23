import type { Lesson } from "../types";

export const aiCollaboration: Lesson[] = [
  {
    id: "collab-1",
    skillId: "ai-collaboration",
    title: "Scope before you ask",
    summary: "Turn a big idea into AI-sized steps.",
    hook: "'Build me a social network' produces a pile of half-working code. Small, checkable steps produce an app.",
    exercises: [
      {
        id: "collab-1-seq",
        type: "sequence",
        difficulty: 1,
        prompt: "Order these steps to build a recipe app with an AI assistant.",
        items: [
          { id: "list", label: "Write down the 3 things version 1 must do" },
          { id: "first", label: "Ask the AI for just the first feature" },
          { id: "run", label: "Run it and check it really works" },
          { id: "commit", label: "Save a checkpoint (commit)" },
          { id: "next", label: "Ask for the next feature" },
        ],
        solution: ["list", "first", "run", "commit", "next"],
        explanation:
          "Each loop is small, verified and saved. If the next AI change breaks something, you can return to the last working checkpoint instead of untangling everything.",
      },
      {
        id: "collab-1-scn",
        type: "scenario",
        difficulty: 2,
        prompt: "What is the best next message?",
        context:
          "You asked an AI for a full e-commerce site. It produced 60 files, and the app won't start.",
        options: [
          {
            id: "rebuild",
            label: "Ask it to rebuild everything from scratch",
            feedback:
              "Starting over repeats the problem at the same size. You still won't know what broke.",
          },
          {
            id: "shrink",
            label: "Ask for only a product list page first, and get that running",
            feedback:
              "Right: shrinking the scope gives you something you can run and verify, and you learn what each file does.",
          },
          {
            id: "more",
            label: "Ask it to add more features so it 'catches up'",
            feedback: "More code on a broken base makes failures harder to locate.",
          },
        ],
        solution: "shrink",
        explanation:
          "When a large generation fails, reduce scope until you have a tiny version that runs. Working small pieces are far easier to verify than one huge guess.",
      },
      {
        id: "collab-1-bank",
        type: "word_bank",
        difficulty: 2,
        prompt: "Fill in a well-scoped request.",
        template: [
          "Add a ",
          { blank: "a" },
          " page that lists recipes from the existing ",
          { blank: "b" },
          " table. Only change ",
          { blank: "c" },
          " files, and tell me how to ",
          { blank: "d" },
          " it.",
        ],
        words: [
          { id: "list", label: "recipe list" },
          { id: "tbl", label: "recipes" },
          { id: "few", label: "the necessary" },
          { id: "test", label: "test" },
          { id: "all", label: "every" },
          { id: "whole", label: "whole app" },
        ],
        solution: { a: "list", b: "tbl", c: "few", d: "test" },
        explanation:
          "A good request says what to build, where the data lives, how far the change may reach, and how you will verify it. That last part makes the AI's output checkable.",
      },
      {
        id: "collab-1-match",
        type: "match",
        difficulty: 1,
        prompt: "Which requests are AI-sized (one verifiable step) and which are too big?",
        categories: [
          { id: "good", label: "One clear step" },
          { id: "big", label: "Too big - split it" },
        ],
        items: [
          { id: "a", label: "Add an email field to the sign-up form" },
          { id: "b", label: "Make my whole startup" },
          { id: "c", label: "Show an error when the password is under 8 characters" },
          { id: "d", label: "Add payments, chat, admin and analytics" },
        ],
        solution: { a: "good", b: "big", c: "good", d: "big" },
        explanation:
          "A good step has an outcome you can see and test in a minute or two. If you cannot say how you would check it, split it.",
      },
    ],
  },
  {
    id: "collab-2",
    skillId: "ai-collaboration",
    title: "Review what the AI wrote",
    summary: "Spot the risky lines in generated code.",
    hook: "AI code looks confident even when it is wrong. A 60-second review catches the mistakes that matter most.",
    exercises: [
      {
        id: "collab-2-bug1",
        type: "bug_hunt",
        difficulty: 2,
        prompt:
          "The AI added Stripe payments. Tap the line that would leak your secret key to every visitor.",
        filename: "components/Checkout.tsx",
        lines: [
          { id: "l1", label: "import Stripe from 'stripe';" },
          { id: "l2", label: "const stripe = new Stripe('sk_live_EXAMPLE_NOT_A_REAL_KEY');" },
          { id: "l3", label: "export function Checkout() {" },
          { id: "l4", label: "  return <button onClick={pay}>Pay</button>;" },
          { id: "l5", label: "}" },
        ],
        solution: ["l2"],
        explanation:
          "Code in a frontend component is shipped to every browser. Secret keys must live in server-side environment variables and be used only by the backend. A leaked live key lets strangers charge or refund on your account - rotate it immediately if this ever happens.",
      },
      {
        id: "collab-2-bug2",
        type: "bug_hunt",
        difficulty: 3,
        prompt: "Tap the line that makes this query vulnerable to SQL injection.",
        filename: "api/search.ts",
        lines: [
          { id: "l1", label: "export async function GET(req: Request) {" },
          { id: "l2", label: "  const q = new URL(req.url).searchParams.get('q');" },
          {
            id: "l3",
            label: "  const rows = await db.query(`SELECT * FROM recipes WHERE name = '${q}'`);",
          },
          { id: "l4", label: "  return Response.json(rows);" },
          { id: "l5", label: "}" },
        ],
        solution: ["l3"],
        explanation:
          "Putting user input straight into a SQL string lets an attacker rewrite the query. Use parameterised queries (placeholders like $1) so input is always treated as data, never as SQL.",
      },
      {
        id: "collab-2-scn",
        type: "scenario",
        difficulty: 2,
        prompt: "The AI says: 'I fixed the bug.' What do you do?",
        context: "Login was failing. The AI changed 12 files and reports success.",
        options: [
          {
            id: "trust",
            label: "Trust it and move on",
            feedback:
              "AI reports can be wrong or partial. Without running it you only have a claim, not evidence.",
          },
          {
            id: "verify",
            label: "Run the app, repeat the exact failing steps, and review the diff",
            feedback:
              "Right: reproduce the original failure and check it's gone, and skim what changed so nothing unrelated was touched.",
          },
          {
            id: "again",
            label: "Ask it to fix it again, just in case",
            feedback: "Asking again without checking adds changes without information.",
          },
        ],
        solution: "verify",
        explanation:
          "Treat AI output as a proposal. Re-running the original failing steps is the cheapest reliable proof, and reading the diff reveals surprise edits.",
      },
      {
        id: "collab-2-match",
        type: "match",
        difficulty: 2,
        prompt: "Sort these AI-generated snippets by how worried you should be.",
        categories: [
          { id: "ok", label: "Looks fine" },
          { id: "risky", label: "Needs a fix" },
        ],
        items: [
          { id: "a", label: "const apiKey = process.env.PAYMENT_KEY (server file)" },
          { id: "b", label: "password stored as plain text in the users table" },
          { id: "c", label: "// TODO: add auth later (on an admin endpoint)" },
          { id: "d", label: "Validate the email format before saving" },
        ],
        solution: { a: "ok", b: "risky", c: "risky", d: "ok" },
        explanation:
          "Secrets in server-side environment variables are the right pattern. Plain-text passwords and unauthenticated admin endpoints are the classic AI shortcuts that become real incidents.",
      },
    ],
  },
];
