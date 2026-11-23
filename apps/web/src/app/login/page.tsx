"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEV, devSignIn, getSupabase } from "@/lib/session";
import { Mascot } from "@/components/Mascot";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const sb = getSupabase();
      if (mode === "up") {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { display_name: name } },
        });
        if (error) throw error;
        if (!data.session) {
          setMsg("Check your email to confirm your account, then sign in.");
          setMode("in");
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace(mode === "up" ? "/onboarding" : "/learn");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap" style={{ maxWidth: 440, paddingTop: "3rem" }}>
      <div style={{ textAlign: "center" }}>
        <Mascot size={80} />
        <h1>{mode === "up" ? "Create your account" : "Welcome back"}</h1>
      </div>
      {DEV ? (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            devSignIn(name || "learner");
            router.replace("/onboarding");
          }}
        >
          <p className="badge warn">Local dev mode - no Supabase</p>
          <label className="field" htmlFor="dn">
            Pick a name
          </label>
          <input
            id="dn"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="alex"
          />
          <p>
            <button className="btn" type="submit">
              Continue
            </button>
          </p>
        </form>
      ) : (
        <form className="card" onSubmit={submit}>
          {mode === "up" && (
            <>
              <label className="field" htmlFor="n">
                Display name
              </label>
              <input
                id="n"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoComplete="nickname"
              />
            </>
          )}
          <label className="field" htmlFor="e">
            Email
          </label>
          <input
            id="e"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <label className="field" htmlFor="p">
            Password
          </label>
          <input
            id="p"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
          />
          {msg && (
            <div className="err" role="alert">
              {msg}
            </div>
          )}
          <p>
            <button className="btn" type="submit" disabled={busy}>
              {mode === "up" ? "Sign up" : "Sign in"}
            </button>
          </p>
          <p className="muted">
            {mode === "up" ? "Already have an account? " : "New here? "}
            <button
              type="button"
              className="btn secondary small"
              onClick={() => setMode(mode === "up" ? "in" : "up")}
            >
              {mode === "up" ? "Sign in" : "Create account"}
            </button>
          </p>
        </form>
      )}
    </main>
  );
}
