"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { PlacementCheck as Check } from "@buildapps/api-client";
import { PlacementCheck } from "@/components/PlacementCheck";
import { api } from "@/lib/session";

export default function CheckPage({ params }: { params: Promise<{ skillId: string }> }) {
  const { skillId } = use(params);
  const [check, setCheck] = useState<Check | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api
      .placement(skillId)
      .then(setCheck)
      .catch((e) => setErr(e.message));
  }, [skillId]);
  if (err)
    return (
      <>
        <div className="err" role="alert">
          {err}
        </div>
        <Link href="/learn" className="btn secondary">
          Back to your path
        </Link>
      </>
    );
  if (!check)
    return (
      <p className="muted" role="status">
        Loading skill check...
      </p>
    );
  return <PlacementCheck check={check} />;
}
