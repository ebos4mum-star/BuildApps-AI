/**
 * Date policy (used by streaks and daily caps):
 * - Instants are stored in UTC (ISO strings / Date).
 * - A "learning day" is the calendar date (YYYY-MM-DD) of the instant in the user's IANA timezone
 *   *as reported with that activity*. The server must validate the timezone it records.
 */
export type DayKey = string;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

export function assertValidTimeZone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    throw new RangeError(`Invalid IANA time zone: ${tz}`);
  }
}

export function toDayKey(instant: Date | string, tz: string): DayKey {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new RangeError("Invalid date");
  let f = formatters.get(tz);
  if (!f) {
    assertValidTimeZone(tz);
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f.format(d); // en-CA => YYYY-MM-DD
}

export function isDayKey(v: unknown): v is DayKey {
  if (typeof v !== "string" || !DAY_KEY.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().startsWith(v);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: DayKey, to: DayKey): number {
  if (!isDayKey(from) || !isDayKey(to)) throw new RangeError("Invalid day key");
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
