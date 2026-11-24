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
  ],
};
