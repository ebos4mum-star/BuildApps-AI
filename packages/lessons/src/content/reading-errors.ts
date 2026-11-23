import type { Lesson } from "../types";

export const readingErrors: Lesson[] = [
  {
    id: "errors-1",
    skillId: "reading-errors",
    title: "Decode the error",
    summary: "Find the useful line in a wall of red text.",
    hook: "Error messages are instructions in disguise. Most of the time the answer is in the first or last few lines.",
    exercises: [
      {
        id: "errors-1-bug",
        type: "bug_hunt",
        difficulty: 1,
        prompt: "Tap the line of this error that tells you what actually went wrong.",
        filename: "terminal output",
        lines: [
          { id: "l1", label: "> next build" },
          { id: "l2", label: "Failed to compile." },
          { id: "l3", label: "./app/page.tsx:12:18" },
          {
            id: "l4",
            label: "Type error: Property 'nme' does not exist on type 'User'. Did you mean 'name'?",
          },
          {
            id: "l5",
            label: "    at processTicksAndRejections (node:internal/process/task_queues:95:5)",
          },
        ],
        solution: ["l4"],
        explanation:
          "The message line says what is wrong ('nme' is a typo for 'name'); the line above it says where (file, line 12). Stack-trace lines like the last one are usually noise until you need them.",
      },
      {
        id: "errors-1-match",
        type: "match",
        difficulty: 1,
        prompt: "What does each message usually mean?",
        categories: [
          { id: "client", label: "Problem with the request / your code" },
          { id: "server", label: "Problem on the server side" },
          { id: "missing", label: "Something is missing or wrong name" },
        ],
        items: [
          { id: "e400", label: "400 Bad Request" },
          { id: "e500", label: "500 Internal Server Error" },
          { id: "e404", label: "404 Not Found" },
          { id: "mod", label: "Cannot find module 'stripe'" },
          { id: "e401", label: "401 Unauthorized" },
          { id: "e503", label: "503 Service Unavailable" },
        ],
        solution: {
          e400: "client",
          e500: "server",
          e404: "missing",
          mod: "missing",
          e401: "client",
          e503: "server",
        },
        explanation:
          "4xx codes mean the request was wrong (bad data, not logged in). 5xx means the server failed. 'Not found' and missing-module errors mean a name, path or dependency doesn't exist - check spelling and installs first.",
      },
      {
        id: "errors-1-scn",
        type: "scenario",
        difficulty: 2,
        prompt: "How should you ask the AI for help with this error?",
        context: "Your app shows: 'TypeError: Cannot read properties of undefined (reading map)'.",
        options: [
          {
            id: "vague",
            label: "'It's broken, fix it'",
            feedback:
              "Without the message or code, the AI has to guess and often rewrites the wrong thing.",
          },
          {
            id: "full",
            label: "Paste the full error, the file it points to, and what you clicked just before",
            feedback:
              "Right: the exact message, the relevant code and the steps to reproduce let the AI diagnose instead of guess.",
          },
          {
            id: "screens",
            label: "Describe the page colours and layout",
            feedback:
              "Appearance rarely explains a runtime error. Give it the error text and the code location.",
          },
        ],
        solution: "full",
        explanation:
          "A strong bug report has three parts: exact error text, the code it points to, and how to reproduce. This 'undefined .map' error usually means data hadn't loaded yet - the AI can only tell if it sees the code.",
      },
      {
        id: "errors-1-seq",
        type: "sequence",
        difficulty: 2,
        prompt: "Order a calm approach to an error you don't understand.",
        items: [
          { id: "read", label: "Read the first line of the message and the file/line number" },
          { id: "repro", label: "Make it happen again on purpose" },
          { id: "search", label: "Search the exact message or ask the AI with full context" },
          { id: "change", label: "Change one thing" },
          { id: "check", label: "Re-run and see if the message changed" },
        ],
        solution: ["read", "repro", "search", "change", "check"],
        explanation:
          "Changing one thing at a time means you know what fixed (or broke) it. If the message changes, you're making progress even when it isn't fixed yet.",
      },
    ],
  },
];
