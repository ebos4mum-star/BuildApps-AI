"use client";
import Link from "next/link";
import { JOURNEY_INFO, type JourneyKey } from "@/components/Journeys";
import { Mascot } from "@/components/Mascot";
import { AuthGate } from "@/components/AuthGate";

export default function Onboarding() {
  return (
    <AuthGate>
      <div style={{ textAlign: "center" }}>
        <Mascot size={90} />
        <h1>Where are you with your app?</h1>
        <p className="muted">Pick the closest fit. You can add more projects later.</p>
      </div>
      <div className="grid3">
        {(Object.keys(JOURNEY_INFO) as JourneyKey[]).map((k) => (
          <Link key={k} className="jcard" href={`/projects/new?journey=${k}&onboarding=1`}>
            <div className="emoji" aria-hidden="true">
              {JOURNEY_INFO[k].emoji}
            </div>
            <h3>{JOURNEY_INFO[k].title}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {JOURNEY_INFO[k].blurb}
            </p>
          </Link>
        ))}
      </div>
      <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
        <Link href="/learn" className="btn secondary">
          Skip - just start learning
        </Link>
      </p>
    </AuthGate>
  );
}
