import type { SkillDefinition } from "@buildapps/core";
import type { Curriculum } from "../types";
import { appAnatomy } from "./app-anatomy";
import { aiCollaboration } from "./ai-collaboration";
import { readingErrors } from "./reading-errors";
import { gitBasics } from "./git-basics";
import { dataApis } from "./data-apis";
import { testingVerification } from "./testing-verification";
import { shipping } from "./shipping";

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
  ],
  units: [
    { id: "unit-1", title: "Know your app", lessonIds: ["anatomy-1", "anatomy-2"] },
    { id: "unit-2", title: "Direct the AI", lessonIds: ["collab-1", "collab-2"] },
    { id: "unit-3", title: "Debug like a pro", lessonIds: ["errors-1", "git-1", "api-1"] },
    { id: "unit-4", title: "Prove it & ship it", lessonIds: ["test-1", "ship-1"] },
  ],
};
