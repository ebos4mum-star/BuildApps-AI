export const dynamic = "force-dynamic";
/** Public liveness probe for uptime monitors. Reveals nothing about configuration or data. */
export const GET = () =>
  Response.json(
    { ok: true, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
