/**
 * Plain-language help for every scanner rule: why it matters, the interactive lesson that teaches it, a
 * structured corrective task, and what the next scan will check. A test guarantees each rule has an entry
 * and each lesson exists, so a new rule cannot ship without guidance.
 */
export interface FindingGuidance {
  /** Accessible explanation: what this means and why it matters, without jargon. */
  plain: string;
  lessonId: string;
  /** Concrete steps the owner can follow in their own repository. */
  steps: string[];
  /** What the rescan looks for, so "fixed" is verified rather than claimed. */
  verifiedBy: string;
}

const g = (
  plain: string,
  lessonId: string,
  steps: string[],
  verifiedBy: string,
): FindingGuidance => ({
  plain,
  lessonId,
  steps,
  verifiedBy,
});

export const GUIDANCE: Record<string, FindingGuidance> = {
  "env-file-committed": g(
    "A file holding your app's private settings is stored in the repository. Anyone who can see the repository can read it, and git remembers it even after you delete it.",
    "env-1",
    [
      "Treat every value in that file as exposed and rotate the keys at each provider.",
      "Remove the file from the repository and add it to .gitignore.",
      "Create a .env.example listing the variable names with fake values.",
    ],
    "The .env file is no longer in the repository tree.",
  ),
  "credential-file-committed": g(
    "A private key or certificate file is in the repository. These files prove your identity, so anyone holding a copy can act as you.",
    "case-leaked-key",
    [
      "Revoke the key or certificate and issue a new one.",
      "Remove the file and add its extension to .gitignore.",
      "Load the new credential from a secret store or environment variable.",
    ],
    "No key or certificate files remain in the tree.",
  ),
  "dependencies-committed": g(
    "The downloaded libraries folder is stored in git. It makes the repository huge and slow and hides which versions you really depend on.",
    "git-1",
    [
      "Add node_modules to .gitignore.",
      "Remove it from the repository (git rm -r --cached node_modules).",
      "Rely on the lockfile to reinstall the same versions.",
    ],
    "No node_modules paths remain in the tree.",
  ),
  "build-artifacts-committed": g(
    "Generated build output is stored in the repository. It goes stale quickly and causes noisy changes.",
    "git-1",
    [
      "Add the build folder (for example dist or .next) to .gitignore.",
      "Remove the folder from the repository.",
      "Let your build or CI produce it fresh each time.",
    ],
    "Build output folders are no longer in the tree.",
  ),
  "no-gitignore": g(
    "There is no .gitignore, so it is easy to commit secrets, libraries and generated files by accident.",
    "git-1",
    [
      "Create a .gitignore for your framework.",
      "Include .env files, node_modules and build output.",
      "Check git status to confirm nothing sensitive is staged.",
    ],
    "A .gitignore file exists at the repository root.",
  ),
  "gitignore-missing-env": g(
    "Your .gitignore does not exclude .env files, so the next accidental commit could publish your secrets.",
    "env-1",
    [
      "Add .env and .env.* to .gitignore.",
      "Keep .env.example tracked.",
      "Run git status to confirm .env is untracked.",
    ],
    "The .gitignore excludes .env files.",
  ),
  "gitignore-missing-node-modules": g(
    "Your .gitignore does not exclude the libraries folder, so installing packages could bloat the repository.",
    "git-1",
    ["Add node_modules to .gitignore.", "Run git status to confirm nothing from it is staged."],
    "The .gitignore excludes node_modules.",
  ),
  "no-readme": g(
    "There is no README. A new teammate, an expert helper or future you cannot tell what the project is or how to run it.",
    "specs-1",
    [
      "Write two sentences on what the app does and who it is for.",
      "List the commands to install and start it.",
      "List the environment variables it needs (names only).",
    ],
    "A README file exists at the repository root.",
  ),
  "readme-is-template": g(
    "The README is still the starter template, so it does not describe your project.",
    "specs-1",
    ["Replace the template text with what your app does.", "Add the real setup and run steps."],
    "The README no longer matches the starter template.",
  ),
  "no-ci": g(
    "Nothing runs your checks automatically, so a broken change can reach users without anyone noticing.",
    "ci-1",
    [
      "Add a workflow that installs dependencies, builds and runs the tests on every push.",
      "Make it required before merging to the main branch.",
    ],
    "A CI workflow file exists in the repository.",
  ),
  "no-env-example": g(
    "There is no list of the settings the app needs, so setting it up somewhere new is guesswork.",
    "env-1",
    ["Create .env.example with each variable name and a fake value.", "Mention it in the README."],
    "A .env.example file exists.",
  ),
  "empty-source-files": g(
    "Some source files are empty. The app may be missing pieces that a screen or feature depends on.",
    "proj-rescue",
    [
      "Open each empty file and decide whether it is needed.",
      "Delete files you do not need, and implement or stub the ones you do with a clear TODO.",
    ],
    "The listed files now contain code, or no longer exist.",
  ),
  "missing-package-json": g(
    "There is no package.json, so tools cannot tell what the project is, what it depends on or how to build it.",
    "anatomy-2",
    [
      "Create a package.json with a name, scripts and dependencies.",
      "Commit the generated lockfile.",
    ],
    "A package.json exists at the project root.",
  ),
  "invalid-package-json": g(
    "package.json is not valid JSON, so installs and builds will fail immediately.",
    "errors-1",
    [
      "Open the file and look for a missing comma or quote.",
      "Validate it with a JSON checker and re-run the install.",
    ],
    "package.json parses as valid JSON.",
  ),
  "no-test-script": g(
    "The project has no test command, so there is no quick way to prove a change did not break something.",
    "test-1",
    [
      "Add a test runner such as Vitest or Jest.",
      'Add a "test" script to package.json.',
      "Write one test for your most important feature.",
    ],
    "package.json defines a test script.",
  ),
  "no-build-script": g(
    "The project has no build command, so nobody can confirm it compiles before publishing.",
    "debug-1",
    [
      'Add a "build" script for your framework.',
      "Run it locally and fix the first error it shows.",
    ],
    "package.json defines a build script.",
  ),
  "no-lockfile": g(
    "There is no lockfile, so each install may pull slightly different library versions and behave differently.",
    "maint-2",
    ["Run your package manager's install command.", "Commit the lockfile it creates."],
    "A lockfile exists in the repository.",
  ),
  "multiple-lockfiles": g(
    "Two different package managers have left lockfiles. They can disagree about versions.",
    "maint-2",
    ["Choose one package manager.", "Delete the other lockfile and reinstall."],
    "Only one lockfile remains.",
  ),
  "unpinned-dependencies": g(
    "Some libraries accept any version, so a future release could silently break your app.",
    "maint-2",
    [
      "Pin versions or use ranges with a committed lockfile.",
      "Update dependencies deliberately, one at a time, with tests.",
    ],
    "The listed dependencies now specify versions.",
  ),
  "deprecated-dependencies": g(
    "You depend on libraries that are no longer maintained, so security fixes will not arrive.",
    "maint-1",
    [
      "Find the recommended replacement for each.",
      "Swap them one at a time and run the tests after each change.",
    ],
    "The deprecated packages are no longer listed.",
  ),
  "expo-store-ids-missing": g(
    "The mobile app config lacks the identifiers the App Store and Google Play require.",
    "ship-1",
    [
      "Set ios.bundleIdentifier and android.package in your Expo config.",
      "Pick final values: changing them later affects installs.",
    ],
    "Both identifiers are present in the app config.",
  ),
  "no-tests": g(
    "There are no test files, so every change is a gamble.",
    "test-2",
    [
      "Write a test for the most valuable behavior first.",
      "Run it and watch it fail before fixing, so you know it can catch the bug.",
    ],
    "Test files exist in the repository.",
  ),
  "hardcoded-secret": g(
    "Something that looks like a private key is written directly in your source code. This is a pattern match, so check it first, but treat it as real until proven otherwise.",
    "env-1",
    [
      "Confirm whether the value is a real credential.",
      "If real: revoke it at the provider and create a new one.",
      "Move the value to an environment variable and read it on the server only.",
    ],
    "The pattern no longer appears in the scanned files.",
  ),
  "todo-markers": g(
    "The code contains TODO or FIXME notes, which usually mark unfinished work.",
    "proj-rescue",
    [
      "List each note and decide: do now, schedule, or delete.",
      "Turn the important ones into milestones.",
    ],
    "The number of TODO markers drops in the next scan.",
  ),
  "incomplete-stubs": g(
    "Some functions look like placeholders that do nothing yet, so features may appear to work but not do anything real.",
    "proj-rescue",
    ["Open each listed spot.", "Implement it, or remove the feature entry point until it exists."],
    "The listed placeholders are gone.",
  ),
  "starter-template-unchanged": g(
    "The main screen is still the framework's starter page, so the app has not been built out yet.",
    "front-2",
    [
      "Replace the starter page with your first real screen.",
      "Link it to the next step users should take.",
    ],
    "The starter text no longer appears.",
  ),
  "sql-string-building": g(
    "Database queries are assembled by joining text together. If any part comes from a user, an attacker can change what the query does.",
    "sec-4",
    [
      "Switch to parameterized queries or your database library's query builder.",
      "Never put user input directly inside a SQL string.",
    ],
    "The string-built query pattern no longer appears.",
  ),
  "dynamic-code-execution": g(
    "The code runs text as code (for example eval). If that text can be influenced by a user, they can run their own code in your app.",
    "sec-4",
    [
      "Replace it with a safe alternative such as JSON.parse or a lookup table.",
      "If you truly need it, restrict inputs to a fixed allow-list.",
    ],
    "The dynamic execution pattern no longer appears.",
  ),
  "skipped-tests": g(
    "Some tests are switched off, so failures can hide there.",
    "test-2",
    [
      "Turn each skipped test back on, or delete it with a note on why.",
      "Fix any that fail for a real reason.",
    ],
    "The skip markers are gone.",
  ),
  "hardcoded-local-urls": g(
    "Addresses like localhost are written into the code. They work on your computer but break for real users.",
    "case-works-locally",
    [
      "Move the address to an environment variable.",
      "Set the production value in your hosting settings.",
    ],
    "The localhost addresses no longer appear in source.",
  ),
  "swallowed-errors": g(
    "Some errors are caught and ignored, so failures can happen silently and be very hard to diagnose later.",
    "debug-2",
    ["Log the error or show the user a helpful message.", "Re-throw if the caller needs to know."],
    "The empty catch pattern no longer appears.",
  ),
};

/** Category fallback if a future rule has no specific entry (a test makes that a build failure anyway). */
export const guidanceFor = (ruleId: string): FindingGuidance | null => GUIDANCE[ruleId] ?? null;
