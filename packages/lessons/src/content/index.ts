import type { SkillDefinition } from "@buildapps/core";
import type { Curriculum } from "../types";
import { appAnatomy } from "./app-anatomy";
import { aiCollaboration } from "./ai-collaboration";
import { readingErrors } from "./reading-errors";
import { gitBasics } from "./git-basics";
import { dataApis } from "./data-apis";
import { testingVerification } from "./testing-verification";
import { shipping } from "./shipping";
import { aiBuilders, frontend, prompting, specs } from "./foundations";
import { backend, databases, flows, uxDesign } from "./design-backend";
import { rowSecurity } from "./data-access";
import { quality } from "./quality-delivery";
import { advancedOps, advancedSecurity } from "./advanced";
import { debugCases } from "./challenges";
import { guidedProjects } from "./projects";
import { aiWorkflows } from "./ai-workflows";
import { mobile, platformData } from "./mobile-and-platform";
import { guidedProjects2 } from "./projects2";
import { debugCases2 } from "./challenges2";
import { apiIntegrations, auth, debugging, maintenance, security } from "./security-ops";

export const skills: SkillDefinition[] = [
  { id: "app-anatomy", name: "How apps work", prerequisites: [] },
  {
    id: "ai-collaboration",
    name: "Working with AI",
    prerequisites: [{ skillId: "app-anatomy", minLevel: "beginner" }],
  },
  {
    id: "reading-errors",
    name: "Reading errors",
    prerequisites: [{ skillId: "app-anatomy", minLevel: "beginner" }],
  },
  {
    id: "git-basics",
    name: "Version control",
    prerequisites: [{ skillId: "app-anatomy", minLevel: "beginner" }],
  },
  {
    id: "data-apis",
    name: "Data & APIs",
    prerequisites: [{ skillId: "reading-errors", minLevel: "beginner" }],
  },
  {
    id: "testing-verification",
    name: "Testing & verification",
    prerequisites: [{ skillId: "reading-errors", minLevel: "beginner" }],
  },
  {
    id: "shipping",
    name: "Shipping your app",
    prerequisites: [
      { skillId: "testing-verification", minLevel: "beginner" },
      { skillId: "git-basics", minLevel: "beginner" },
    ],
  },
  { id: "ai-builders", name: "How AI builders work", prerequisites: [] },
  {
    id: "specs",
    name: "Ideas to specs",
    prerequisites: [{ skillId: "ai-builders", minLevel: "beginner" }],
  },
  {
    id: "prompting",
    name: "Writing AI instructions",
    prerequisites: [{ skillId: "specs", minLevel: "beginner" }],
  },
  {
    id: "frontend",
    name: "Frontend",
    prerequisites: [{ skillId: "app-anatomy", minLevel: "beginner" }],
  },
  {
    id: "ux-design",
    name: "UI/UX design",
    prerequisites: [{ skillId: "frontend", minLevel: "beginner" }],
  },
  {
    id: "flows",
    name: "Navigation & flows",
    prerequisites: [{ skillId: "ux-design", minLevel: "beginner" }],
  },
  {
    id: "backend",
    name: "Backend",
    prerequisites: [{ skillId: "app-anatomy", minLevel: "beginner" }],
  },
  {
    id: "databases",
    name: "Databases & Supabase",
    prerequisites: [{ skillId: "backend", minLevel: "beginner" }],
  },
  {
    id: "auth",
    name: "Auth & permissions",
    prerequisites: [{ skillId: "backend", minLevel: "beginner" }],
  },
  {
    id: "api-integrations",
    name: "API integrations",
    prerequisites: [{ skillId: "data-apis", minLevel: "beginner" }],
  },
  {
    id: "security",
    name: "Security & privacy",
    prerequisites: [{ skillId: "auth", minLevel: "beginner" }],
  },
  {
    id: "debugging",
    name: "Debugging broken apps",
    prerequisites: [{ skillId: "reading-errors", minLevel: "beginner" }],
  },
  {
    id: "maintenance",
    name: "App maintenance",
    prerequisites: [{ skillId: "shipping", minLevel: "beginner" }],
  },
  {
    id: "quality",
    name: "Quality: accessibility & speed",
    prerequisites: [{ skillId: "frontend", minLevel: "beginner" }],
  },
  {
    id: "cicd",
    name: "Automation & releases",
    prerequisites: [
      { skillId: "git-basics", minLevel: "beginner" },
      { skillId: "testing-verification", minLevel: "beginner" },
    ],
  },
  {
    id: "ai-workflows",
    name: "AI coding workflows",
    prerequisites: [{ skillId: "prompting", minLevel: "beginner" }],
  },
  {
    id: "mobile",
    name: "Mobile apps",
    prerequisites: [{ skillId: "frontend", minLevel: "beginner" }],
  },
];

export const curriculum: Curriculum = {
  skills,
  lessons: [
    ...appAnatomy,
    ...aiCollaboration,
    ...readingErrors,
    ...gitBasics,
    ...dataApis,
    ...testingVerification,
    ...shipping,
    ...aiBuilders,
    ...specs,
    ...prompting,
    ...frontend,
    ...uxDesign,
    ...flows,
    ...backend,
    ...databases,
    ...auth,
    ...apiIntegrations,
    ...security,
    ...debugging,
    ...maintenance,
    ...rowSecurity,
    ...quality,
    ...advancedSecurity,
    ...advancedOps,
    ...debugCases,
    ...guidedProjects,
    ...aiWorkflows,
    ...mobile,
    ...platformData,
    ...guidedProjects2,
    ...debugCases2,
  ],
  units: [
    { id: "unit-1", title: "Know your app", lessonIds: ["anatomy-1", "anatomy-2"] },
    { id: "unit-2", title: "Direct the AI", lessonIds: ["collab-1", "collab-2"] },
    { id: "unit-3", title: "Debug like a pro", lessonIds: ["errors-1", "git-1", "api-1"] },
    { id: "unit-4", title: "Prove it & ship it", lessonIds: ["test-1", "ship-1"] },
    { id: "unit-5", title: "How AI builders work", lessonIds: ["builders-1", "builders-2"] },
    {
      id: "unit-6",
      title: "Plan it & prompt it",
      lessonIds: ["specs-1", "specs-2", "prompt-1", "prompt-2"],
    },
    {
      id: "unit-7",
      title: "Build the front end",
      lessonIds: ["front-1", "front-2", "ux-1", "ux-2", "flows-1", "flows-2"],
    },
    {
      id: "unit-8",
      title: "Server, data and access",
      lessonIds: ["back-1", "back-2", "db-1", "db-2", "auth-1", "auth-2"],
    },
    {
      id: "unit-9",
      title: "Connect, protect and fix",
      lessonIds: ["integr-1", "sec-1", "sec-2", "debug-1", "debug-2"],
    },
    { id: "unit-10", title: "Keep it healthy", lessonIds: ["maint-1"] },
    { id: "unit-p1", title: "Guided project: Habit Tracker", lessonIds: ["proj-habit"] },
    {
      id: "unit-11",
      title: "Data you can trust",
      lessonIds: ["rls-1", "mig-1", "db-3", "back-3"],
    },
    { id: "unit-12", title: "Identity and secrets", lessonIds: ["auth-3", "env-1"] },
    { id: "unit-13", title: "Reliable integrations", lessonIds: ["api-2", "api-3"] },
    {
      id: "unit-14",
      title: "Quality you can feel",
      lessonIds: ["state-1", "a11y-1", "a11y-2", "perf-1"],
    },
    {
      id: "unit-15",
      title: "Automate and verify",
      lessonIds: ["test-2", "test-3", "ci-1", "ci-2"],
    },
    { id: "unit-16", title: "Direct the AI like a reviewer", lessonIds: ["prompt-3", "prompt-4"] },
    { id: "unit-p2", title: "Guided project: Booking app", lessonIds: ["proj-booking"] },
    { id: "unit-17", title: "Defend it", lessonIds: ["sec-3", "sec-4"] },
    { id: "unit-18", title: "Operate it", lessonIds: ["maint-2", "maint-3"] },
    {
      id: "unit-19",
      title: "Debugging cases",
      lessonIds: [
        "case-login-loop",
        "case-vanished-data",
        "case-works-locally",
        "case-slow-page",
        "case-leaked-key",
      ],
    },
    { id: "unit-p3", title: "Guided project: Rescue an app", lessonIds: ["proj-rescue"] },
    {
      id: "unit-20",
      title: "Build with AI tools",
      lessonIds: [
        "aiw-1",
        "aiw-2",
        "aiw-3",
        "aiw-4",
        "aiw-5",
        "aiw-6",
        "aiw-7",
        "aiw-8",
        "aiw-9",
        "aiw-10",
      ],
    },
    {
      id: "unit-21",
      title: "Mobile apps",
      lessonIds: ["mob-1", "mob-2", "mob-3", "mob-4", "mob-5"],
    },
    {
      id: "unit-22",
      title: "Data, APIs and background work",
      lessonIds: ["db-4", "api-4", "back-4", "auth-4"],
    },
    {
      id: "unit-23",
      title: "Privacy, testing and operations",
      lessonIds: ["sec-5", "test-4", "ship-2", "ship-3"],
    },
    {
      id: "unit-24",
      title: "Interfaces for real people",
      lessonIds: ["front-3", "ux-3", "ux-4"],
    },
    {
      id: "unit-25",
      title: "More debugging cases",
      lessonIds: [
        "case-double-events",
        "case-white-screen",
        "case-stale-data",
        "case-surprise-bill",
      ],
    },
    {
      id: "unit-p4",
      title: "Guided projects: notes, AI feature, store-ready",
      lessonIds: ["proj-notes", "proj-ai-feature", "proj-mobile-ship"],
    },
  ],
  paths: [
    {
      id: "beginner",
      title: "Beginner: build with AI",
      blurb:
        "How apps and AI builders work, turning ideas into specs, and your first guided project.",
      unitIds: ["unit-1", "unit-2", "unit-3", "unit-4", "unit-5", "unit-6", "unit-p1"],
    },
    {
      id: "intermediate",
      title: "Intermediate: build it properly",
      blurb: "Front end, data, access control, integrations, quality and automation.",
      unitIds: [
        "unit-7",
        "unit-8",
        "unit-9",
        "unit-10",
        "unit-11",
        "unit-12",
        "unit-13",
        "unit-14",
        "unit-15",
        "unit-16",
        "unit-20",
        "unit-21",
        "unit-22",
        "unit-24",
        "unit-p2",
      ],
    },
    {
      id: "advanced",
      title: "Advanced: secure, operate and rescue",
      blurb:
        "Threat modelling, incident response, real debugging cases and rescuing a stalled app.",
      unitIds: ["unit-17", "unit-18", "unit-19", "unit-p3", "unit-23", "unit-25", "unit-p4"],
    },
  ],
};
