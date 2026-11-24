"use client";
import { useEffect, useRef, useState } from "react";
import {
  AI_TOOLS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  INTENT_OPTIONS,
  PACE_OPTIONS,
  PLATFORM_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  TOOL_OPTIONS,
  parseProfile,
  type LearnerProfile,
} from "@buildapps/core";
import { Mascot } from "./Mascot";

type Draft = Partial<LearnerProfile> & { reminders: LearnerProfile["reminders"] };
const STEPS = ["experience", "goals", "tools", "intent", "pace", "targets", "reminders"] as const;
const TITLES: Record<(typeof STEPS)[number], string> = {
  experience: "How much have you built?",
  goals: "What do you want to get out of this?",
  tools: "Which AI tools do you use?",
  intent: "What are you doing right now?",
  pace: "How much time can you give it?",
  targets: "What are you building, and for where?",
  reminders: "Want a gentle nudge?",
};

interface Option {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
}
function Choices({
  label,
  options,
  selected,
  multi,
  onChange,
}: {
  label: string;
  options: readonly Option[];
  selected: readonly string[];
  multi: boolean;
  onChange: (next: string[]) => void;
}) {
  return (
    <div role={multi ? "group" : "radiogroup"} aria-label={label} className="grid3">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            className={`jcard${on ? " selected" : ""}`}
            style={on ? { outline: "3px solid var(--mint, #2ee6a6)" } : undefined}
            onClick={() =>
              onChange(
                multi ? (on ? selected.filter((x) => x !== o.id) : [...selected, o.id]) : [o.id],
              )
            }
          >
            <div className="emoji" aria-hidden="true">
              {o.emoji}
            </div>
            <h3>{o.title}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {o.blurb}
            </p>
          </button>
        );
      })}
    </div>
  );
}

/** Seven short steps; every answer is optional to change later. Used for first-run and for editing. */
export function OnboardingWizard({
  initial,
  onSubmit,
  submitLabel = "Build my plan",
}: {
  initial?: LearnerProfile | null;
  onSubmit: (p: LearnerProfile) => Promise<void>;
  submitLabel?: string;
}) {
  const [d, setD] = useState<Draft>(initial ?? { reminders: { enabled: false, hour: 18 } });
  const [i, setI] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [i]);
  const step = STEPS[i]!;
  const one = <K extends "experience" | "intent" | "pace">(k: K) => (d[k] ? [d[k] as string] : []);
  const canNext =
    step === "experience"
      ? !!d.experience
      : step === "goals"
        ? !!d.goals?.length
        : step === "tools"
          ? !!d.tools?.length
          : step === "intent"
            ? !!d.intent
            : step === "pace"
              ? !!d.pace
              : true;
  async function finish() {
    const r = parseProfile({
      projectTypes: [],
      platforms: [],
      ...d,
    });
    if (!r.ok) return setErr(r.issues.map((x) => x.message).join(". "));
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(r.profile);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }
  return (
    <div>
      <div style={{ textAlign: "center" }}>
        <Mascot size={80} mood={i === STEPS.length - 1 ? "cheer" : undefined} />
        <div
          className="bar"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={0}
          aria-valuemax={STEPS.length}
          aria-valuenow={i + 1}
          style={{ maxWidth: 360, margin: ".6rem auto" }}
        >
          <i style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
        </div>
        <p className="muted">
          Step {i + 1} of {STEPS.length}
        </p>
        <h1 tabIndex={-1} ref={heading}>
          {TITLES[step]}
        </h1>
      </div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      {step === "experience" && (
        <Choices
          label="Experience"
          options={EXPERIENCE_OPTIONS}
          selected={one("experience")}
          multi={false}
          onChange={([v]) => setD({ ...d, experience: v as LearnerProfile["experience"] })}
        />
      )}
      {step === "goals" && (
        <Choices
          label="Goals (pick any)"
          options={GOAL_OPTIONS}
          selected={d.goals ?? []}
          multi
          onChange={(v) => setD({ ...d, goals: v as LearnerProfile["goals"] })}
        />
      )}
      {step === "tools" && (
        <Choices
          label="AI tools (pick any)"
          options={TOOL_OPTIONS.filter((o) => AI_TOOLS.includes(o.id))}
          selected={d.tools ?? []}
          multi
          onChange={(v) => setD({ ...d, tools: v as LearnerProfile["tools"] })}
        />
      )}
      {step === "intent" && (
        <Choices
          label="What you are doing"
          options={INTENT_OPTIONS}
          selected={one("intent")}
          multi={false}
          onChange={([v]) => setD({ ...d, intent: v as LearnerProfile["intent"] })}
        />
      )}
      {step === "pace" && (
        <Choices
          label="Learning pace"
          options={PACE_OPTIONS}
          selected={one("pace")}
          multi={false}
          onChange={([v]) => setD({ ...d, pace: v as LearnerProfile["pace"] })}
        />
      )}
      {step === "targets" && (
        <>
          <h2>Project type</h2>
          <Choices
            label="Project types (pick any)"
            options={PROJECT_TYPE_OPTIONS}
            selected={d.projectTypes ?? []}
            multi
            onChange={(v) => setD({ ...d, projectTypes: v as LearnerProfile["projectTypes"] })}
          />
          <h2>Where will it run?</h2>
          <Choices
            label="Platforms (pick any)"
            options={PLATFORM_OPTIONS}
            selected={d.platforms ?? []}
            multi
            onChange={(v) => setD({ ...d, platforms: v as LearnerProfile["platforms"] })}
          />
        </>
      )}
      {step === "reminders" && (
        <div className="card">
          <label style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={d.reminders.enabled}
              onChange={(e) =>
                setD({ ...d, reminders: { ...d.reminders, enabled: e.target.checked } })
              }
            />
            Remind me to practise
          </label>
          <label htmlFor="rem-hour" className="muted">
            Preferred hour (your local time)
          </label>
          <select
            id="rem-hour"
            value={d.reminders.hour}
            disabled={!d.reminders.enabled}
            onChange={(e) =>
              setD({ ...d, reminders: { ...d.reminders, hour: Number(e.target.value) } })
            }
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          <p className="muted">
            Reminders appear in the app until push or email delivery is set up. Missing a day never
            costs you anything.
          </p>
        </div>
      )}
      <div className="stack" style={{ maxWidth: 360, margin: "1.5rem auto 0" }}>
        {i < STEPS.length - 1 ? (
          <button className="btn" disabled={!canNext} onClick={() => setI(i + 1)}>
            Continue
          </button>
        ) : (
          <button className="btn" disabled={busy} onClick={finish}>
            {busy ? "Saving..." : submitLabel}
          </button>
        )}
        {i > 0 && (
          <button className="btn secondary" onClick={() => setI(i - 1)}>
            Back
          </button>
        )}
      </div>
    </div>
  );
}
