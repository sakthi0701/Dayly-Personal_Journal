/**
 * Single source of truth for "what day / what part of the day is it for the user".
 * Isomorphic (no window/DB access) — safe in API routes and client components.
 *
 * Every "today", "due today", "overdue", greeting and day bucket must go through these
 * helpers with the user's IANA time zone. Do NOT reintroduce `toISOString().slice(0,10)` or
 * `new Date().getHours()` for user-facing day logic: on Vercel those are UTC, which is why
 * screens disagreed between 00:00 and 05:30 IST.
 */

/** Fallback when no valid zone is supplied. Server-only paths (cron, Telegram) also run on IST. */
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Accepts an IANA zone or the legacy 'IST'/'UTC' values the old settings stored. */
export function normalizeTimeZone(tz?: string | null): string {
  if (!tz) return DEFAULT_TIME_ZONE;
  if (tz === 'IST') return 'Asia/Kolkata';
  if (tz === 'UTC') return 'Etc/UTC';
  return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

/** YYYY-MM-DD of `date` as seen in `tz`. */
export function localDateStr(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Local YYYY-MM-DD for a stored date value. Plain dates ('2026-11-07', e.g. tasks.due_date) are
 * already calendar days and are returned as-is; full timestamps are converted into `tz`.
 */
export function toLocalDateStr(value: string, tz: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateStr(new Date(value), tz);
}

/** "Nov 5, 2026" for a YYYY-MM-DD calendar day (no zone shift). */
export function formatDayLabel(date: string): string {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** 0–23 hour of `date` as seen in `tz`. */
export function localHour(date: Date, tz: string): number {
  const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(date), 10);
  return Number.isNaN(h) ? date.getHours() : h % 24;
}

/** Whole calendar days from `fromStr` to `toStr` (both YYYY-MM-DD). Negative = `toStr` is in the past. */
export function daysBetween(fromStr: string, toStr: string): number {
  return Math.round((Date.parse(`${toStr.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromStr.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export type PartOfDay = 'night' | 'morning' | 'afternoon' | 'evening';

/** 00–04 night, 05–11 morning, 12–16 afternoon, 17–20 evening, 21–23 night. */
export function partOfDay(hour: number): PartOfDay {
  if (hour < 5 || hour >= 21) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function greeting(hour: number, name: string): string {
  switch (partOfDay(hour)) {
    case 'morning': return `Good morning ${name}.`;
    case 'afternoon': return `Good afternoon ${name}.`;
    case 'evening': return `Good evening ${name}.`;
    default: return hour < 5 ? `Up late, ${name}.` : 'Still at it.';
  }
}
