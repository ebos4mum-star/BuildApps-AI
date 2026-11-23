import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createApiClient } from "./index";

const ROOT = resolve(__dirname, "../../..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory())
      out.push(...(name === "node_modules" || name === ".next" ? [] : sources(p)));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
/** Which api-client operations does a platform's UI actually call? */
function used(dir: string): Set<string> {
  const found = new Set<string>();
  for (const f of sources(dir)) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/\bapi\s*\.\s*(publishing\s*\.\s*)?([A-Za-z]+)\s*\(/g))
      found.add(`${m[1] ? "publishing." : ""}${m[2]}`);
  }
  return found;
}

const client = createApiClient({ baseUrl: "", getToken: async () => null });
const OPERATIONS = Object.entries(client).flatMap(([k, v]) =>
  typeof v === "function" ? [k] : Object.keys(v as object).map((x) => `${k}.${x}`),
);

/** Operations intentionally available on one platform only, with the reason. Keep this list short. */
const INTENTIONAL_GAPS: Record<string, string> = {};

describe("cross-platform parity", () => {
  const web = used(join(ROOT, "apps/web/src"));
  const mobile = used(join(ROOT, "apps/mobile/src"));

  it("every shared API operation is used by BOTH the web and mobile apps (or the gap is documented)", () => {
    const missing = OPERATIONS.filter((op) => !INTENTIONAL_GAPS[op])
      .flatMap((op) => [
        !web.has(op) ? `web is missing ${op}` : null,
        !mobile.has(op) ? `mobile is missing ${op}` : null,
      ])
      .filter(Boolean);
    expect(missing).toEqual([]);
  });

  it("documented gaps are real and still needed", () => {
    for (const op of Object.keys(INTENTIONAL_GAPS)) {
      expect(OPERATIONS).toContain(op);
      expect(
        web.has(op) && mobile.has(op),
        `${op} is now on both platforms; remove it from INTENTIONAL_GAPS`,
      ).toBe(false);
    }
  });

  it("neither app calls an operation the shared client does not provide", () => {
    for (const [name, set] of [
      ["web", web],
      ["mobile", mobile],
    ] as const)
      for (const op of set) expect(OPERATIONS, `${name} uses unknown api.${op}`).toContain(op);
  });
});
