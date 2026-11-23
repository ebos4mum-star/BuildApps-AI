export const JOURNEY_INFO = {
  start: {
    emoji: "🌱",
    title: "Start a project",
    blurb: "I have an idea and want to build it step by step with AI.",
  },
  continue: {
    emoji: "🧭",
    title: "Continue a project",
    blurb: "I already started - help me finish and stay on track.",
  },
  rescue: {
    emoji: "🛟",
    title: "Rescue a project",
    blurb: "My project is stuck, broken or abandoned. Help me recover it.",
  },
} as const;
export type JourneyKey = keyof typeof JOURNEY_INFO;
