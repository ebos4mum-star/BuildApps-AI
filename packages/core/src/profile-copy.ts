import type {
  AiTool,
  ExperienceLevel,
  Intent,
  LearningGoal,
  Pace,
  ProjectType,
  TargetPlatform,
} from "./profile";
import { DAILY_GOAL_XP } from "./profile";

/** One source of onboarding wording so web, iOS and Android say the same thing. */
type Opt<T extends string> = { id: T; emoji: string; title: string; blurb: string };

export const EXPERIENCE_OPTIONS: Opt<ExperienceLevel>[] = [
  {
    id: "new",
    emoji: "🌱",
    title: "Brand new",
    blurb: "I have never built software, or I only use AI to generate it.",
  },
  {
    id: "some",
    emoji: "🌿",
    title: "Some experience",
    blurb: "I have built a few things and want to understand them better.",
  },
  {
    id: "experienced",
    emoji: "🌳",
    title: "Experienced",
    blurb: "I can code. I want AI-assisted workflows and to fill gaps.",
  },
];
export const GOAL_OPTIONS: Opt<LearningGoal>[] = [
  {
    id: "ship_first_app",
    emoji: "🚀",
    title: "Ship my first app",
    blurb: "Get something real in front of users.",
  },
  {
    id: "understand_ai_code",
    emoji: "🔍",
    title: "Understand AI-written code",
    blurb: "Know what the AI built and why.",
  },
  {
    id: "fix_broken_app",
    emoji: "🛠",
    title: "Fix a broken app",
    blurb: "Get unstuck and make it work.",
  },
  {
    id: "level_up_skills",
    emoji: "📈",
    title: "Level up my skills",
    blurb: "Go deeper on backend, data and security.",
  },
  {
    id: "prepare_for_launch",
    emoji: "✅",
    title: "Prepare for launch",
    blurb: "Test, secure and publish with confidence.",
  },
];
export const TOOL_OPTIONS: Opt<AiTool>[] = [
  { id: "claude_code", emoji: "⌨️", title: "Claude Code", blurb: "Terminal-based coding agent." },
  { id: "cursor", emoji: "🖱", title: "Cursor", blurb: "AI-first code editor." },
  { id: "lovable", emoji: "💜", title: "Lovable", blurb: "Prompt-to-app builder." },
  { id: "replit", emoji: "🌀", title: "Replit", blurb: "Browser workspace with an AI agent." },
  { id: "copilot", emoji: "🤝", title: "GitHub Copilot", blurb: "Assistant inside your editor." },
  {
    id: "chat_assistant",
    emoji: "💬",
    title: "A chat assistant",
    blurb: "Copying code from a chat window.",
  },
  { id: "none_yet", emoji: "🧭", title: "None yet", blurb: "I am still choosing." },
];
export const INTENT_OPTIONS: Opt<Intent>[] = [
  {
    id: "start",
    emoji: "🌱",
    title: "Start a project",
    blurb: "I have an idea and want to build it step by step with AI.",
  },
  {
    id: "continue",
    emoji: "🧭",
    title: "Continue a project",
    blurb: "I already started. Help me finish and stay on track.",
  },
  {
    id: "rescue",
    emoji: "🛟",
    title: "Rescue a project",
    blurb: "My project is stuck, broken or abandoned.",
  },
  {
    id: "learn_first",
    emoji: "🎓",
    title: "Learn first",
    blurb: "I would rather learn before I build.",
  },
];
export const PACE_OPTIONS: Opt<Pace>[] = [
  {
    id: "light",
    emoji: "🐢",
    title: "Light",
    blurb: `About ${DAILY_GOAL_XP.light} XP a day: a few minutes.`,
  },
  {
    id: "steady",
    emoji: "🚶",
    title: "Steady",
    blurb: `About ${DAILY_GOAL_XP.steady} XP a day: one lesson.`,
  },
  {
    id: "intense",
    emoji: "🏃",
    title: "Intense",
    blurb: `About ${DAILY_GOAL_XP.intense} XP a day: a deep session.`,
  },
];
export const PROJECT_TYPE_OPTIONS: Opt<ProjectType>[] = [
  { id: "website", emoji: "🌐", title: "Website", blurb: "Marketing or content site." },
  { id: "web_app", emoji: "🧩", title: "Web app", blurb: "Accounts, data and workflows." },
  { id: "mobile_app", emoji: "📱", title: "Mobile app", blurb: "iOS and Android." },
  { id: "backend_api", emoji: "🗄", title: "Backend or API", blurb: "Services and data." },
  { id: "ai_app", emoji: "🤖", title: "AI-powered app", blurb: "Features that call models." },
];
export const PLATFORM_OPTIONS: Opt<TargetPlatform>[] = [
  { id: "web", emoji: "🖥", title: "Web", blurb: "Runs in the browser." },
  { id: "ios", emoji: "🍎", title: "iOS", blurb: "App Store." },
  { id: "android", emoji: "🤖", title: "Android", blurb: "Google Play." },
];
