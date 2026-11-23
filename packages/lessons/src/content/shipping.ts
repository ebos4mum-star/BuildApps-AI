import type { Lesson } from "../types";

export const shipping: Lesson[] = [
  {
    id: "ship-1",
    skillId: "shipping",
    title: "Ready to ship?",
    summary: "What stands between 'it works' and the app stores.",
    hook: "Most unfinished AI-built apps stall at the last 20%: secrets, settings and store requirements.",
    exercises: [
      {
        id: "ship-1-seq",
        type: "sequence",
        difficulty: 2,
        prompt: "Order a sensible path from working app to published app.",
        items: [
          { id: "tests", label: "Automated checks pass" },
          {
            id: "secrets",
            label: "Move secrets to environment variables and rotate any exposed ones",
          },
          { id: "build", label: "Create a production build and test it on a real device" },
          { id: "listing", label: "Prepare store listing, privacy policy and screenshots" },
          { id: "submit", label: "Submit for store review" },
        ],
        solution: ["tests", "secrets", "build", "listing", "submit"],
        explanation:
          "Verify first, then secure, then build, then paperwork. Stores reject apps that crash or lack a privacy policy, so checking those before submitting saves days of back-and-forth.",
      },
      {
        id: "ship-1-match",
        type: "match",
        difficulty: 2,
        prompt: "Sort these items by where they belong.",
        categories: [
          { id: "repo", label: "In the repository" },
          { id: "env", label: "In environment / secret storage" },
          { id: "store", label: "In the store listing" },
        ],
        items: [
          { id: "code", label: "App source code" },
          { id: "stripe", label: "Payment secret key" },
          { id: "shots", label: "Screenshots and description" },
          { id: "dburl", label: "Database password" },
          { id: "policy", label: "Privacy policy URL" },
        ],
        solution: { code: "repo", stripe: "env", shots: "store", dburl: "env", policy: "store" },
        explanation:
          "Repositories hold code, never secrets. Store listings hold what users and reviewers see. Keeping each in the right place means a leaked repo doesn't leak your accounts.",
      },
      {
        id: "ship-1-scn",
        type: "scenario",
        difficulty: 3,
        prompt: "What should you do?",
        context:
          "Your store submission was rejected: 'App crashes on launch on iPhone 12.' It works fine in your simulator.",
        options: [
          {
            id: "resubmit",
            label: "Resubmit unchanged and hope the reviewer was unlucky",
            feedback:
              "Reviewers test real devices; the same build will fail again and slow your next review.",
          },
          {
            id: "repro",
            label:
              "Test a release build on a real or matching device, read the crash log, fix, then resubmit",
            feedback:
              "Right: simulators hide problems. Release builds behave differently, and the crash log tells you exactly what failed.",
          },
          {
            id: "dispute",
            label: "Argue that it works on your machine",
            feedback: "Reviews are about users' devices, not yours. Evidence beats arguments.",
          },
        ],
        solution: "repro",
        explanation:
          "Test the same kind of build users will get. When review fails, the crash log is your evidence - and this is a good moment to get a second pair of eyes, such as a vetted expert, if it's beyond you.",
      },
    ],
  },
];
