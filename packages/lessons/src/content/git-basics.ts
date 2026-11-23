import type { Lesson } from "../types";

export const gitBasics: Lesson[] = [
  {
    id: "git-1",
    skillId: "git-basics",
    title: "Save points for your project",
    summary: "Commits let you undo AI mistakes.",
    hook: "An AI edit can break a working app in seconds. A commit is your undo button for the whole project.",
    exercises: [
      {
        id: "git-1-seq",
        type: "sequence",
        difficulty: 1,
        prompt: "Order the everyday Git flow for saving working code.",
        items: [
          { id: "edit", label: "Make a change (yourself or with AI)" },
          { id: "test", label: "Run the app and check it works" },
          { id: "add", label: "git add . (stage the changes)" },
          { id: "commit", label: 'git commit -m "Add recipe list"' },
          { id: "push", label: "git push (back it up on GitHub)" },
        ],
        solution: ["edit", "test", "add", "commit", "push"],
        explanation:
          "Commit after you've checked it works, so every commit is a known-good save point. Pushing copies those save points to GitHub in case your laptop dies.",
      },
      {
        id: "git-1-scn",
        type: "scenario",
        difficulty: 2,
        prompt: "What should you do first?",
        context:
          "The AI just refactored your app and now nothing loads. Your last commit, 20 minutes ago, worked.",
        options: [
          {
            id: "pray",
            label: "Keep prompting until it works again",
            feedback:
              "That can take hours and piles up more changes. You already have a working version saved.",
          },
          {
            id: "restore",
            label:
              "Look at what changed, and restore the last good commit if the fix isn't obvious",
            feedback:
              "Right: a commit means you can go back (git restore / git reset) and try a smaller change.",
          },
          {
            id: "delete",
            label: "Delete the project folder and start over",
            feedback:
              "Destructive and unnecessary. Version control exists so you never have to do this.",
          },
        ],
        solution: "restore",
        explanation:
          "Version control turns 'I broke everything' into 'return to 20 minutes ago'. Use git diff to see what changed, and git restore to bring back files from your last commit.",
      },
      {
        id: "git-1-match",
        type: "match",
        difficulty: 2,
        prompt: "Sort these into things Git should and shouldn't track.",
        categories: [
          { id: "track", label: "Commit to Git" },
          { id: "ignore", label: "Keep out of Git (.gitignore)" },
        ],
        items: [
          { id: "src", label: "Your source code" },
          { id: "env", label: ".env file with API keys" },
          { id: "nm", label: "node_modules/ folder" },
          { id: "readme", label: "README.md" },
          { id: "pkg", label: "package.json" },
        ],
        solution: { src: "track", env: "ignore", nm: "ignore", readme: "track", pkg: "track" },
        explanation:
          "Secrets never belong in Git history - once pushed, assume they're public. Generated folders like node_modules can be rebuilt from package.json, so tracking them only adds noise.",
      },
      {
        id: "git-1-bank",
        type: "word_bank",
        difficulty: 2,
        prompt: "Complete a good commit workflow before asking AI for a risky change.",
        template: [
          "Before the change run ",
          { blank: "a" },
          ", then work on a new ",
          { blank: "b" },
          " so the main version stays safe.",
        ],
        words: [
          { id: "status", label: "git status" },
          { id: "branch", label: "branch" },
          { id: "format", label: "format" },
          { id: "delete", label: "git delete" },
        ],
        solution: { a: "status", b: "branch" },
        explanation:
          "git status shows whether you have unsaved work. A branch is a safe sandbox: if the experiment fails you simply switch back to main.",
      },
    ],
  },
];
