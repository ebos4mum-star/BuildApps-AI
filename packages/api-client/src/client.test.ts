import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./index";

describe("api client", () => {
  it("sends bearer token and JSON body, parses responses", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: 1, correct: true }), { status: 200 }),
    );
    const c = createApiClient({
      baseUrl: "http://x",
      getToken: async () => "tok",
      fetchImpl: fetchImpl as never,
    });
    await c.submitAttempt("e1", { type: "scenario", optionId: "a" }, "UTC");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/api/attempts");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toMatchObject({ exerciseId: "e1" });
  });
  it("throws ApiError with server code, and 401 when signed out", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "locked", message: "no" } }), { status: 403 }),
    );
    const c = createApiClient({
      baseUrl: "http://x",
      getToken: async () => "t",
      fetchImpl: fetchImpl as never,
    });
    await expect(c.lesson("a")).rejects.toMatchObject({ status: 403, code: "locked" });
    const anon = createApiClient({
      baseUrl: "http://x",
      getToken: async () => null,
      fetchImpl: fetchImpl as never,
    });
    await expect(anon.dashboard()).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
