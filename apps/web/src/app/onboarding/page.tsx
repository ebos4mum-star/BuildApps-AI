"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LearnerProfile } from "@buildapps/core";
import { AuthGate } from "@/components/AuthGate";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { api } from "@/lib/api-types";

export default function Onboarding() {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [initial, setInitial] = useState<LearnerProfile | null | undefined>(undefined);
  useEffect(() => {
    setEditing(new URLSearchParams(window.location.search).get("edit") === "1");
    api.myProfile().then(
      (p) => setInitial(p?.profile ?? null),
      () => setInitial(null),
    );
  }, []);
  async function save(p: LearnerProfile) {
    await api.saveProfile(p);
    // people who are starting, continuing or rescuing go straight to creating that project
    router.push(
      p.intent === "learn_first" ? "/learn" : `/projects/new?journey=${p.intent}&onboarding=1`,
    );
  }
  return (
    <AuthGate>
      {initial === undefined ? (
        <p className="muted" role="status">
          Loading...
        </p>
      ) : (
        <OnboardingWizard
          initial={editing ? initial : null}
          onSubmit={save}
          submitLabel={editing ? "Save changes" : "Build my plan"}
        />
      )}
      <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
        <Link href="/learn" className="btn secondary">
          Skip for now
        </Link>
      </p>
    </AuthGate>
  );
}
