import type { ExtraUnit } from "./index";

export const extraUnits: ExtraUnit[] = [
  {
    path: "advanced",
    id: "unit-cases-3",
    title: "Debugging cases: web, data and security",
    lessonIds: [
      "case-cors",
      "case-n-plus-one",
      "case-oauth-redirect",
      "case-timezone",
      "case-migration",
      "case-memory-leak",
      "case-double-signup",
      "case-keyboard",
      "case-images",
      "case-key-in-app",
      "case-ownership-change",
      "case-ci-only",
    ],
  },
  {
    path: "advanced",
    id: "unit-cases-4",
    title: "Debugging cases: rendering, sync, upgrades, AI and delivery",
    lessonIds: [
      "case-render-loop",
      "case-event-order",
      "case-offline-loss",
      "case-pagination-dups",
      "case-breaking-upgrade",
      "case-prompt-leak",
      "case-store-rejection",
      "case-email-missing",
    ],
  },
  {
    path: "intermediate",
    id: "unit-craft-1",
    title: "Craft with AI tools: UI, tests, refactors, docs and review",
    lessonIds: ["ui-prompts", "ai-tests", "ai-refactor", "ai-docs", "team-review"],
  },
  {
    path: "intermediate",
    id: "unit-craft-2",
    title: "Platform patterns: Supabase, serverless, caching, search and uploads",
    lessonIds: ["supabase-stack", "serverless", "caching", "search", "uploads"],
  },
  {
    path: "advanced",
    id: "unit-cases-5",
    title: "Debugging case: slow search",
    lessonIds: ["case-slow-search"],
  },
  {
    path: "intermediate",
    id: "unit-craft-3",
    title: "Reach, measurement, publishing and platform choice",
    lessonIds: ["i18n", "analytics-ethics", "web-publish", "choose-platform"],
  },
  {
    path: "advanced",
    id: "unit-craft-4",
    title: "Abuse limits, production evidence, acceptance and expert handoffs",
    lessonIds: ["abuse-limits", "prod-logs", "acceptance", "expert-handoff"],
  },
];
