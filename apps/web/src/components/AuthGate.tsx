"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getToken, signOut } from "@/lib/session";
import { Mascot } from "./Mascot";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getToken().then((t) => (t ? setReady(true) : router.replace("/login")));
  }, [router]);
  if (!ready)
    return (
      <p className="wrap muted" role="status">
        Loading...
      </p>
    );
  const link = (href: string, text: string) => (
    <Link className="link" href={href} aria-current={path.startsWith(href) ? "page" : undefined}>
      {text}
    </Link>
  );
  return (
    <>
      <nav className="nav" aria-label="Main">
        <Link href="/learn" className="brand">
          <Mascot size={30} /> BuildApps
        </Link>
        {link("/learn", "Learn")}
        {link("/projects", "Projects")}
        <span className="spacer" />
        <button
          className="btn secondary small"
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
        >
          Sign out
        </button>
      </nav>
      <main className="wrap">{children}</main>
    </>
  );
}
