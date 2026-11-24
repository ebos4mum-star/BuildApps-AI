"use client";
import { Illustration } from "./Illustration";

export interface CelebrationItem {
  kind: "achievement" | "skill" | "quest" | "goal";
  title: string;
  detail?: string;
}
const LABEL = {
  achievement: "Achievement unlocked",
  skill: "Skill level up",
  quest: "Quest complete",
  goal: "Daily goal reached",
} as const;

/**
 * Earned rewards at the end of a lesson. Items are announced politely to screen readers; the pop-in
 * animation is disabled automatically under prefers-reduced-motion (see globals.css).
 */
export function Celebration({ items }: { items: CelebrationItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="What you earned" className="celebration" data-testid="celebration">
      {items.map((it, i) => (
        <div
          key={`${it.kind}-${it.title}`}
          className="reward-card"
          style={{ animationDelay: `${i * 140}ms` }}
        >
          <Illustration scene="celebrate" size={56} />
          <div style={{ textAlign: "left" }}>
            <span className="badge warn">{LABEL[it.kind]}</span>
            <strong style={{ display: "block" }}>{it.title}</strong>
            {it.detail && <span className="muted">{it.detail}</span>}
          </div>
        </div>
      ))}
    </section>
  );
}
