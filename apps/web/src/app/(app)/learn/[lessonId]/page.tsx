"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { LessonPlayer } from "@/components/LessonPlayer";
import { api, type LessonPayload } from "@/lib/api-types";

export default function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = use(params);
  const [lesson, setLesson] = useState<LessonPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api
      .lesson(lessonId)
      .then(setLesson)
      .catch((e) => setErr(e.message));
  }, [lessonId]);
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
  if (!lesson)
    return (
      <p className="muted" role="status">
        Loading lesson...
      </p>
    );
  return <LessonPlayer lesson={lesson} />;
}
