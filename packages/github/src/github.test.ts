import { createVerify, generateKeyPairSync } from "node:crypto";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { scanSnapshot } from "@buildapps/scanner";
import {
  FakeGitHubGateway,
  FIXTURE_STUCK,
  GitHubAppGateway,
  GitHubError,
  OWNER_RE,
  REPO_RE,
  signState,
  TOKEN_PERMISSIONS,
  verifyState,
  verifyWebhookSignature,
} from "./index";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function mockGitHub(routes: (c: Call) => { status?: number; json?: unknown } | undefined) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const c: Call = {
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      ...(typeof init.body === "string" ? { body: init.body } : {}),
    };
    calls.push(c);
    const r = routes(c);
    return new Response(r?.json === undefined ? null : JSON.stringify(r.json), {
      status: r?.status ?? (r ? 200 : 404),
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const gw = (fetchImpl: typeof fetch, o: Record<string, unknown> = {}) =>
  new GitHubAppGateway({
    appId: "123",
    privateKey,
    slug: "buildapps-ai",
    clientId: "cid",
    clientSecret: "csecret",
    fetchImpl,
    now: () => 1_700_000_000_000,
    ...o,
  });
const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("GitHubAppGateway", () => {
  it("signs a short-lived RS256 app JWT that verifies with the public key", () => {
    const jwt = gw(fetch).appJwt();
    const [h, p, s] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims.iss).toBe("123");
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600); // GitHub max is 10 minutes
    expect(
      createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url")),
    ).toBe(true);
  });

  it("accepts escaped-newline PEM from env vars", () => {
    const escaped = privateKey.replace(/\n/g, "\\n");
    expect(() => gw(fetch, { privateKey: escaped }).appJwt()).not.toThrow();
  });

  it("requests installation tokens with least privilege, scoped to ONE repository", async () => {
    const m = mockGitHub((c) => {
      if (c.url.endsWith("/access_tokens")) return { status: 201, json: { token: "ghs_tok" } };
      if (c.url.endsWith("/repos/octo/app")) return { json: { default_branch: "main" } };
      if (c.url.includes("/commits/main")) return { json: { sha: "c".repeat(40) } };
      if (c.url.includes("/git/trees/")) return { json: { truncated: false, tree: [] } };
    });
    await gw(m.fetchImpl).getSnapshot(7, "octo", "app");
    const tokenCall = m.calls.find((c) => c.url.endsWith("/access_tokens"))!;
    expect(JSON.parse(tokenCall.body!)).toEqual({
      permissions: TOKEN_PERMISSIONS,
      repositories: ["app"],
    });
    expect(TOKEN_PERMISSIONS).toEqual({ contents: "read", metadata: "read", checks: "read" }); // nothing writable, ever
    expect(tokenCall.headers.Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/); // app JWT
    expect(m.calls.filter((c) => c.method !== "GET" && !c.url.endsWith("/access_tokens"))).toEqual(
      [],
    ); // only GETs besides the token mint
  });

  it("builds a bounded snapshot: skips symlinks, binaries and unwanted files; marks truncation", async () => {
    const files = {
      "package.json": '{"name":"x"}',
      "README.md": "# hi",
      "src/a.ts": "export const a = 1;",
    };
    const m = mockGitHub((c) => {
      if (c.url.endsWith("/access_tokens")) return { status: 201, json: { token: "t" } };
      if (c.url.endsWith("/repos/octo/app")) return { json: { default_branch: "main" } };
      if (c.url.includes("/commits/main")) return { json: { sha: "d".repeat(40) } };
      if (c.url.includes("/git/trees/"))
        return {
          json: {
            truncated: true,
            tree: [
              ...Object.entries(files).map(([path, v]) => ({
                path,
                type: "blob",
                mode: "100644",
                sha: `sha-${path}`,
                size: v.length,
              })),
              { path: "link", type: "blob", mode: "120000", sha: "sha-link", size: 5 },
              { path: "sub", type: "commit", mode: "160000", sha: "sha-sub" },
              { path: ".env", type: "blob", mode: "100644", sha: "sha-env", size: 40 },
              { path: "logo.png", type: "blob", mode: "100644", sha: "sha-png", size: 40 },
              { path: "src/bin.ts", type: "blob", mode: "100644", sha: "sha-bin", size: 10 },
            ],
          },
        };
      const blob = /git\/blobs\/sha-(.+)$/.exec(c.url);
      if (blob)
        return {
          json: {
            encoding: "base64",
            content:
              blob[1] === "bin"
                ? Buffer.from([0x41, 0, 0x42]).toString("base64")
                : b64(files[blob[1] as keyof typeof files] ?? ""),
          },
        };
    });
    const snap = await gw(m.fetchImpl).getSnapshot(7, "octo", "app");
    expect(Object.keys(snap.contents).sort()).toEqual(["README.md", "package.json", "src/a.ts"]);
    expect(snap.tree.map((t) => t.path)).not.toContain("link"); // symlink skipped
    expect(snap.tree.map((t) => t.path)).not.toContain("sub"); // submodule skipped
    expect(snap.truncated).toBe(true);
    expect(snap.commitSha).toBe("d".repeat(40));
    expect(m.calls.some((c) => c.url.includes("sha-env"))).toBe(false); // env files never fetched
    expect(m.calls.some((c) => c.url.includes("sha-png"))).toBe(false);
    expect(snap.contents["src/bin.ts"]).toBeUndefined(); // binary skipped
  });

  it("stops fetching file contents when the time budget is exhausted", async () => {
    let t = 1_700_000_000_000;
    const m = mockGitHub((c) => {
      if (c.url.endsWith("/access_tokens")) return { status: 201, json: { token: "t" } };
      if (c.url.endsWith("/repos/octo/app")) return { json: { default_branch: "main" } };
      if (c.url.includes("/commits/main")) return { json: { sha: "e".repeat(40) } };
      if (c.url.includes("/git/trees/"))
        return {
          json: {
            truncated: false,
            tree: Array.from({ length: 30 }, (_, i) => ({
              path: `src/f${i}.ts`,
              type: "blob",
              mode: "100644",
              sha: `s${i}`,
              size: 10,
            })),
          },
        };
      if (c.url.includes("/git/blobs/")) {
        t += 5000;
        return { json: { encoding: "base64", content: b64("x") } };
      }
    });
    const snap = await gw(m.fetchImpl, { now: () => t, fetchBudgetMs: 12_000 }).getSnapshot(
      7,
      "octo",
      "app",
    );
    expect(Object.keys(snap.contents).length).toBeLessThan(30);
    expect(snap.truncated).toBe(true);
  });

  it("rejects malicious owner/repo values before any network call", async () => {
    const m = mockGitHub(() => ({ json: {} }));
    for (const [o, r] of [
      ["../x", "a"],
      ["octo", "../../admin"],
      ["octo", "a/b"],
      ["octo", ".."],
      ["", "a"],
      ["a b", "c"],
    ])
      await expect(gw(m.fetchImpl).getSnapshot(1, o!, r!)).rejects.toBeInstanceOf(GitHubError);
    expect(m.calls).toEqual([]);
    expect(OWNER_RE.test("octo-cat")).toBe(true);
    expect(REPO_RE.test("my.repo_1")).toBe(true);
  });

  it("reads check runs, and returns null (not an exception) when unreadable", async () => {
    const ok = mockGitHub((c) =>
      c.url.endsWith("/access_tokens")
        ? { status: 201, json: { token: "t" } }
        : c.url.includes("/check-runs")
          ? {
              json: {
                check_runs: [{ name: "CI", status: "completed", conclusion: "success", extra: 1 }],
              },
            }
          : undefined,
    );
    expect(await gw(ok.fetchImpl).getCheckRuns(1, "octo", "app", "a".repeat(40))).toEqual([
      { name: "CI", status: "completed", conclusion: "success" },
    ]);
    const denied = mockGitHub((c) =>
      c.url.endsWith("/access_tokens")
        ? { status: 201, json: { token: "t" } }
        : { status: 403, json: {} },
    );
    expect(await gw(denied.fetchImpl).getCheckRuns(1, "octo", "app", "a".repeat(40))).toBeNull();
    expect(await gw(ok.fetchImpl).getCheckRuns(1, "octo", "app", "not-a-sha!")).toBeNull();
  });

  it("verifies installations via OAuth code and never persists the user token", async () => {
    const m = mockGitHub((c) => {
      if (c.url === "https://github.com/login/oauth/access_token")
        return { json: { access_token: "gho_usertoken" } };
      if (c.url.includes("/user/installations"))
        return {
          json: {
            installations: [
              {
                id: 55,
                account: { login: "octo", type: "Organization" },
                repository_selection: "all",
              },
            ],
          },
        };
    });
    const out = await gw(m.fetchImpl).userInstallations("the-code");
    expect(out).toEqual([
      {
        installationId: 55,
        accountLogin: "octo",
        accountType: "Organization",
        repositorySelection: "all",
      },
    ]);
    expect(JSON.parse(m.calls[0]!.body!)).toMatchObject({ client_id: "cid", code: "the-code" });
    const bad = mockGitHub((c) =>
      c.url.includes("oauth") ? { json: { error: "bad_verification_code" } } : undefined,
    );
    await expect(gw(bad.fetchImpl).userInstallations("x")).rejects.toMatchObject({ status: 401 });
  });

  it("lists repositories with pagination and uninstalls idempotently", async () => {
    let page2 = 0;
    const m = mockGitHub((c) => {
      if (c.url.endsWith("/access_tokens")) return { status: 201, json: { token: "t" } };
      if (c.url.includes("/installation/repositories")) {
        page2++;
        const n = page2 === 1 ? 100 : 3;
        return {
          json: {
            repositories: Array.from({ length: n }, (_, i) => ({
              id: page2 * 1000 + i,
              name: `r${i}`,
              full_name: `o/r${i}`,
              private: false,
              default_branch: "main",
              owner: { login: "o" },
            })),
          },
        };
      }
      if (c.method === "DELETE") return { status: 204 };
    });
    expect((await gw(m.fetchImpl).listRepos(1)).length).toBe(103);
    await expect(gw(m.fetchImpl).uninstall(1)).resolves.toBeUndefined();
    const gone = mockGitHub((c) => (c.method === "DELETE" ? { status: 404 } : undefined));
    await expect(gw(gone.fetchImpl).uninstall(1)).resolves.toBeUndefined();
    const boom = mockGitHub((c) => (c.method === "DELETE" ? { status: 500 } : undefined));
    await expect(gw(boom.fetchImpl).uninstall(1)).rejects.toBeInstanceOf(GitHubError);
  });

  it("builds an install URL carrying the signed state", () => {
    expect(gw(fetch).installUrl("a b")).toBe(
      "https://github.com/apps/buildapps-ai/installations/new?state=a%20b",
    );
  });
});

describe("state and webhook security", () => {
  const secret = "s".repeat(32);
  it("binds state to the user, expires it and rejects tampering", () => {
    const st = signState("user-1", secret, 1000, 60_000);
    expect(verifyState(st, secret, 2000)).toBe("user-1");
    expect(verifyState(st, secret, 1000 + 60_001)).toBeNull(); // expired
    expect(verifyState(st, "z".repeat(32), 2000)).toBeNull(); // wrong secret
    const [p, sig] = st.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ u: "user-2", e: 9e15, n: "x" })).toString(
      "base64url",
    );
    expect(verifyState(`${forged}.${sig}`, secret, 2000)).toBeNull(); // payload swapped
    expect(verifyState(`${p}.AAAA`, secret, 2000)).toBeNull();
    for (const junk of ["", "a", "a.b.c", "x".repeat(2000)])
      expect(verifyState(junk, secret)).toBeNull();
    expect(() => signState("u", "short")).toThrow();
    expect(signState("u", secret)).not.toBe(signState("u", secret)); // nonce
  });
  it("verifies webhook signatures over the raw body", () => {
    const body = JSON.stringify({ action: "deleted" });
    const sig = "sha256=" + createHmac("sha256", "whsec").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, "whsec")).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, sig, "other")).toBe(false);
    expect(verifyWebhookSignature(body, null, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=zz", "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, sig, "")).toBe(false);
  });
});

describe("FakeGitHubGateway (dev)", () => {
  it("serves fixtures that the scanner can analyse", async () => {
    const g = new FakeGitHubGateway();
    expect((await g.listRepos(1001)).map((r) => r.fullName)).toEqual([
      "demo/healthy-app",
      "demo/stuck-app",
    ]);
    const stuck = scanSnapshot(await g.getSnapshot(1001, "demo", "stuck-app"));
    expect(stuck.findings.map((f) => f.ruleId)).toEqual(
      expect.arrayContaining(["env-file-committed", "hardcoded-secret", "no-lockfile"]),
    );
    const healthy = scanSnapshot(await g.getSnapshot(1001, "demo", "healthy-app"));
    expect(healthy.findings.filter((f) => ["critical", "high"].includes(f.severity))).toEqual([]);
    expect(JSON.stringify(FIXTURE_STUCK)).toContain("sk_live_"); // exists at runtime, but not as a literal in source
  });
  it("honours revocation and unknown repos", async () => {
    const g = new FakeGitHubGateway();
    await expect(g.getSnapshot(1001, "demo", "nope")).rejects.toMatchObject({ status: 404 });
    await g.uninstall(1001);
    expect(await g.getInstallation(1001)).toBeNull();
    await expect(g.listRepos(1001)).rejects.toMatchObject({ status: 404 });
    expect(await g.userInstallations("dev")).toEqual([]);
  });
});
