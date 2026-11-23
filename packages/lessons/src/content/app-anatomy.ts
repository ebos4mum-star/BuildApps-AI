import type { Lesson } from "../types";

export const appAnatomy: Lesson[] = [
  {
    id: "anatomy-1",
    skillId: "app-anatomy",
    title: "What's inside an app?",
    summary: "Frontend, backend and database - who does what.",
    hook: "Your AI tool just generated 40 files. Knowing which layer each one belongs to tells you where to look when something breaks.",
    exercises: [
      {
        id: "anatomy-1-match",
        type: "match",
        difficulty: 1,
        prompt: "Drag each piece of a habit-tracker app into the layer where it lives.",
        categories: [
          { id: "frontend", label: "Frontend (what users see)" },
          { id: "backend", label: "Backend (server logic)" },
          { id: "database", label: "Database (stored data)" },
        ],
        items: [
          { id: "button", label: "The 'Add habit' button" },
          { id: "rules", label: "Check the user is logged in before saving" },
          { id: "table", label: "A table of habits and check-ins" },
          { id: "chart", label: "Weekly progress chart on screen" },
          { id: "email", label: "Send a reminder email at 8am" },
          { id: "rows", label: "Each user's saved streak count" },
        ],
        solution: {
          button: "frontend",
          rules: "backend",
          table: "database",
          chart: "frontend",
          email: "backend",
          rows: "database",
        },
        explanation:
          "The frontend runs on the user's device and shows things. The backend runs on a server you control and enforces rules. The database stores data durably. Rules like 'is this user allowed?' must live on the backend, because anything on the frontend can be changed by the user.",
      },
      {
        id: "anatomy-1-seq",
        type: "sequence",
        difficulty: 1,
        prompt: "A user taps 'Save habit'. Put what happens in order.",
        items: [
          { id: "tap", label: "Frontend sends the habit to the backend" },
          { id: "valid", label: "Backend checks the user and validates the data" },
          { id: "write", label: "Backend writes the habit to the database" },
          { id: "reply", label: "Backend replies 'saved'" },
          { id: "show", label: "Frontend shows the new habit on screen" },
        ],
        solution: ["tap", "valid", "write", "reply", "show"],
        explanation:
          "Data flows frontend -> backend -> database and the confirmation flows back. Validation happens before the write so bad data never reaches the database, and the screen only updates after the backend confirms.",
      },
      {
        id: "anatomy-1-scn",
        type: "scenario",
        difficulty: 2,
        prompt: "Where should you ask the AI to fix this?",
        context: "Your app shows a 'Saved!' message, but when you refresh, the new habit is gone.",
        options: [
          {
            id: "css",
            label: "The page styling - the message is the wrong colour",
            feedback:
              "Styling changes how things look, not whether data persists. The message appears, so the screen itself works.",
          },
          {
            id: "save",
            label: "The code that writes the habit to the database",
            feedback:
              "Right: the frontend claimed success, but nothing was stored. The write (or its error handling) is the likely culprit.",
          },
          {
            id: "logo",
            label: "The app logo file",
            feedback:
              "A logo can't affect saved data. Start from the symptom: data vanished on refresh means it was never stored.",
          },
        ],
        solution: "save",
        explanation:
          "Symptoms point to layers. Data missing after a refresh means it never reached the database, so look at the save path rather than the UI. Naming the layer makes your request to the AI far more precise.",
      },
      {
        id: "anatomy-1-bank",
        type: "word_bank",
        difficulty: 2,
        prompt: "Complete this request so the AI changes the right layer.",
        template: [
          "Add a 'streak' column to the ",
          { blank: "a" },
          " and update the ",
          { blank: "b" },
          " endpoint that saves check-ins. Do not change the ",
          { blank: "c" },
          ".",
        ],
        words: [
          { id: "db", label: "database" },
          { id: "be", label: "backend" },
          { id: "fe", label: "frontend styling" },
          { id: "os", label: "operating system" },
        ],
        solution: { a: "db", b: "be", c: "fe" },
        explanation:
          "A good request names the layer for each change and states what must stay untouched. That keeps the AI from rewriting unrelated files.",
      },
    ],
  },
  {
    id: "anatomy-2",
    skillId: "app-anatomy",
    title: "Follow the request",
    summary: "Trace a screen back to the data behind it.",
    hook: "'It doesn't work' is not debuggable. 'The list is empty' is. Learn to trace what each screen depends on.",
    exercises: [
      {
        id: "anatomy-2-match",
        type: "match",
        difficulty: 2,
        prompt: "Sort these bugs by the layer you should investigate first.",
        categories: [
          { id: "frontend", label: "Frontend" },
          { id: "backend", label: "Backend" },
          { id: "database", label: "Database" },
        ],
        items: [
          { id: "overlap", label: "Buttons overlap on small phones" },
          { id: "forbidden", label: "Server answers 403 for a valid user" },
          { id: "dup", label: "Two users share one email in the table" },
          { id: "spinner", label: "Loading spinner never disappears on screen" },
          { id: "timeout", label: "Endpoint takes 30 seconds to reply" },
          { id: "missingcol", label: "Query fails: column 'plan' does not exist" },
        ],
        solution: {
          overlap: "frontend",
          forbidden: "backend",
          dup: "database",
          spinner: "frontend",
          timeout: "backend",
          missingcol: "database",
        },
        explanation:
          "Layout and display problems live in the frontend. Wrong status codes and slow responses point to backend logic. Missing columns and duplicate rows are about how data is stored - a database constraint (like UNIQUE on email) prevents duplicates no matter what code runs.",
      },
      {
        id: "anatomy-2-seq",
        type: "sequence",
        difficulty: 2,
        prompt: "The profile page shows the wrong name. Order a sensible investigation.",
        items: [
          { id: "see", label: "Reproduce it and note exactly what is shown" },
          { id: "net", label: "Check what the backend actually returned" },
          { id: "row", label: "Look at the stored row in the database" },
          { id: "fix", label: "Fix the layer where the data first goes wrong" },
          { id: "retest", label: "Re-test the same steps" },
        ],
        solution: ["see", "net", "row", "fix", "retest"],
        explanation:
          "Follow the data from the screen backward until you find the first place it is wrong, then fix only that layer. Re-testing the same steps proves the fix instead of assuming it.",
      },
      {
        id: "anatomy-2-bug",
        type: "bug_hunt",
        difficulty: 2,
        prompt:
          "The AI wrote this check-in endpoint. Tap the line that lets anyone edit anyone's habits.",
        filename: "api/checkin.ts",
        lines: [
          { id: "l1", label: "export async function POST(req: Request) {" },
          { id: "l2", label: "  const { habitId, userId } = await req.json();" },
          { id: "l3", label: "  await db.checkins.insert({ habitId, userId });" },
          { id: "l4", label: "  return Response.json({ ok: true });" },
          { id: "l5", label: "}" },
        ],
        solution: ["l2"],
        explanation:
          "The userId comes from the request body, so a caller can claim to be any user. The backend must read the user from the verified session instead and never trust identity sent by the frontend.",
      },
    ],
  },
];
