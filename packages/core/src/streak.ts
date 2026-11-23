import { diffDays, isDayKey, toDayKey, type DayKey } from "./dates";

/**
 * Non-punitive streaks. A "learning day" is the local calendar date (see dates.ts).
 * - Missed days are covered by "rest days" (start with 1, +1 per 7-day streak milestone, max 2).
 * - Running out of rest days restarts the streak at 1; `longest` is never reduced.
 * - Activity on an already-counted day, or on an earlier local date (e.g. after travelling west),
 *   never changes the streak. Timezone changes therefore can't shorten or double-count a streak.
 */
export const MAX_REST_DAYS = 2;
export const REST_DAY_EARN_INTERVAL = 7;

export interface StreakState {
  current: number;
  longest: number;
  lastActiveDay: DayKey | null;
  restDaysAvailable: number;
}

export const INITIAL_STREAK: StreakState = {
  current: 0,
  longest: 0,
  lastActiveDay: null,
  restDaysAvailable: 1,
};

export type StreakOutcome =
  "started" | "extended" | "extended_using_rest_days" | "already_counted" | "restarted";

export function recordActivity(
  state: StreakState,
  instant: Date | string,
  tz: string,
): { state: StreakState; outcome: StreakOutcome; restDaysUsed: number } {
  const day = toDayKey(instant, tz);
  const unchanged = (outcome: StreakOutcome) => ({ state, outcome, restDaysUsed: 0 });

  if (state.lastActiveDay !== null && !isDayKey(state.lastActiveDay)) {
    throw new RangeError("Invalid lastActiveDay in streak state");
  }
  if (state.lastActiveDay === null) {
    return {
      state: { ...state, current: 1, longest: Math.max(state.longest, 1), lastActiveDay: day },
      outcome: "started",
      restDaysUsed: 0,
    };
  }

  const gap = diffDays(state.lastActiveDay, day);
  if (gap <= 0) return unchanged("already_counted");

  const missed = gap - 1;
  if (missed > state.restDaysAvailable) {
    return {
      state: { ...state, current: 1, longest: Math.max(state.longest, 1), lastActiveDay: day },
      outcome: "restarted",
      restDaysUsed: 0,
    };
  }

  const current = state.current + 1;
  const earned = current % REST_DAY_EARN_INTERVAL === 0 ? 1 : 0;
  return {
    state: {
      current,
      longest: Math.max(state.longest, current),
      lastActiveDay: day,
      restDaysAvailable: Math.min(MAX_REST_DAYS, state.restDaysAvailable - missed + earned),
    },
    outcome: missed > 0 ? "extended_using_rest_days" : "extended",
    restDaysUsed: missed,
  };
}

export type StreakStatus = "none" | "completed_today" | "active" | "lapsed";

/** Read-only view for display; does not mutate persisted state. */
export function getStreakStatus(
  state: StreakState,
  now: Date | string,
  tz: string,
): { status: StreakStatus; displayedCurrent: number } {
  if (state.lastActiveDay === null) return { status: "none", displayedCurrent: 0 };
  const gap = diffDays(state.lastActiveDay, toDayKey(now, tz));
  if (gap <= 0) return { status: "completed_today", displayedCurrent: state.current };
  if (gap - 1 <= state.restDaysAvailable)
    return { status: "active", displayedCurrent: state.current };
  return { status: "lapsed", displayedCurrent: 0 };
}
