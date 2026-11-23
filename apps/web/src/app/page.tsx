import Link from "next/link";
import { Mascot } from "@/components/Mascot";

const FEATURES = [
  [
    "🎮",
    "Learn by doing",
    "Drag, sort and debug real AI-built app scenarios. XP, streaks and skills keep you going.",
  ],
  [
    "🛟",
    "Rescue a project",
    "Connect a stuck GitHub project (read-only) and get an evidence-based assessment.",
  ],
  [
    "📋",
    "Live workspace",
    "Milestones and outstanding tasks - with verified progress kept separate from self-reported.",
  ],
  ["🧪", "Verification lab", "Automated checks turn 'I think it works' into proof."],
  [
    "🧑‍💻",
    "Human developer rescue",
    "Vetted experts and scoped, secure handoffs when you need a hand.",
  ],
  ["🚀", "Publishing center", "Help getting to the App Store and Google Play."],
];

export default function Home() {
  return (
    <main className="wrap" style={{ textAlign: "center", paddingTop: "3rem" }}>
      <Mascot size={110} mood="cheer" />
      <h1 style={{ fontSize: "2.4rem" }}>Finish the app you started with AI.</h1>
      <p className="muted" style={{ fontSize: "1.15rem", maxWidth: 560, margin: "0 auto 1.5rem" }}>
        Short, hands-on lessons that teach you to steer AI tools, fix what breaks and ship real apps
        - not another chatbot.
      </p>
      <Link href="/login" className="btn">
        Start learning
      </Link>
      <div className="grid3" style={{ marginTop: "3rem", textAlign: "left" }}>
        {FEATURES.map(([e, t, d]) => (
          <div className="card" key={t}>
            <div style={{ fontSize: "1.8rem" }} aria-hidden="true">
              {e}
            </div>
            <h3>{t}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {d}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
