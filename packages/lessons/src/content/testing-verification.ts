import type { Lesson } from "../types";

export const testingVerification: Lesson[] = [
  {
    id: "test-1",
    skillId: "testing-verification",
    title: "Does it really work?",
    summary: "Prove your app works instead of hoping.",
    hook: "'It worked on my screen' isn't proof. A few well-chosen checks catch most breakages before users do.",
    exercises: [
      {
        id: "test-1-match",
        type: "match",
        difficulty: 1,
        prompt: "Which kind of check catches each problem?",
        categories: [
          { id: "unit", label: "Automated test" },
          { id: "manual", label: "Click through it yourself" },
          { id: "lint", label: "Linter / type checker" },
        ],
        items: [
          { id: "typo", label: "Misspelled variable name" },
          { id: "calc", label: "Discount calculation returns wrong total" },
          { id: "feel", label: "Does the signup flow feel confusing?" },
          { id: "unused", label: "Imported file that is never used" },
          { id: "regress", label: "Checkout worked yesterday - did it break?" },
        ],
        solution: { typo: "lint", calc: "unit", feel: "manual", unused: "lint", regress: "unit" },
        explanation:
          "Linters and type checkers catch typos and unused code instantly. Automated tests lock in behaviour like calculations so it can't silently break later. Only a human can judge whether something feels confusing.",
      },
      {
        id: "test-1-scn",
        type: "scenario",
        difficulty: 2,
        prompt: "You're asked to prove 'password reset works'. What's the strongest evidence?",
        options: [
          {
            id: "ai",
            label: "The AI said it works",
            feedback: "A claim isn't evidence. Test results you can rerun are.",
          },
          {
            id: "e2e",
            label:
              "A test that requests a reset, uses the emailed link, and logs in with the new password",
            feedback:
              "Right: it exercises the whole journey and can be re-run every time the code changes.",
          },
          {
            id: "screen",
            label: "A screenshot of the 'Email sent' message",
            feedback:
              "That only proves one step - the email may never arrive or the link may be broken.",
          },
        ],
        solution: "e2e",
        explanation:
          "Good verification covers the whole user journey and is repeatable. That repeatability is also what lets this platform's Build Verification Lab mark progress as 'verified' rather than self-reported.",
      },
      {
        id: "test-1-bug",
        type: "bug_hunt",
        difficulty: 2,
        prompt: "The AI wrote a test that can never fail. Tap the line that makes it useless.",
        filename: "discount.test.ts",
        lines: [
          { id: "l1", label: "import { applyDiscount } from './discount';" },
          { id: "l2", label: "test('applies 10% discount', () => {" },
          { id: "l3", label: "  const total = applyDiscount(100, 10);" },
          { id: "l4", label: "  expect(total).toBe(total);" },
          { id: "l5", label: "});" },
        ],
        solution: ["l4"],
        explanation:
          "expect(total).toBe(total) compares a value to itself, so it always passes. A real test states the expected result - expect(total).toBe(90) - so wrong code makes it fail. AI-written tests often need this scrutiny.",
      },
      {
        id: "test-1-seq",
        type: "sequence",
        difficulty: 2,
        prompt: "Order how to fix a bug with a test.",
        items: [
          { id: "write", label: "Write a test that fails because of the bug" },
          { id: "see", label: "Run it and watch it fail" },
          { id: "fix", label: "Fix the code" },
          { id: "pass", label: "Run it and watch it pass" },
          { id: "all", label: "Run the whole test suite" },
        ],
        solution: ["write", "see", "fix", "pass", "all"],
        explanation:
          "Seeing the test fail first proves it detects the bug. Running everything at the end checks your fix didn't break something else.",
      },
    ],
  },
];
