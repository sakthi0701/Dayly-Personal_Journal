/**
 * lib/voice/settings.ts
 *
 * Client-side settings + scheduling math for Sensei check-in calls.
 * Stored in localStorage (per device), like the other Dayly preferences.
 */

export interface CallSettings {
  enabled: boolean;
  /** Minutes between scheduled calls */
  intervalMin: number;
  /** Calls only ring inside [startHour, endHour) device-local time */
  startHour: number;
  endHour: number;
  /** Never ring while a Pomodoro focus session is running */
  skipDuringFocus: boolean;
}

export const DEFAULT_CALL_SETTINGS: CallSettings = {
  enabled: false,
  intervalMin: 60,
  startHour: 9,
  endHour: 21,
  skipDuringFocus: true,
};

const SETTINGS_KEY = 'dayly_call_settings';
const NEXT_AT_KEY = 'dayly_call_next_at';

/** Fired on window whenever settings or the next-call time change. */
export const CALL_SETTINGS_EVENT = 'dayly-call-settings';
/** Fire on window to start a call immediately (e.g. "Call me now"). */
export const CALL_NOW_EVENT = 'dayly-call-now';

/** For useSyncExternalStore: changes whenever settings or the next-call time change. */
export function subscribeCallSettings(cb: () => void): () => void {
  window.addEventListener(CALL_SETTINGS_EVENT, cb);
  return () => window.removeEventListener(CALL_SETTINGS_EVENT, cb);
}
export function callSettingsSnapshot(): string {
  return `${localStorage.getItem(SETTINGS_KEY) ?? ''}|${localStorage.getItem(NEXT_AT_KEY) ?? ''}`;
}

export function loadCallSettings(): CallSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_CALL_SETTINGS, ...JSON.parse(raw) } : DEFAULT_CALL_SETTINGS;
  } catch {
    return DEFAULT_CALL_SETTINGS;
  }
}

export function saveCallSettings(s: CallSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  // Settings changed → restart the countdown from now
  setNextCallAt(s.enabled ? alignToWindow(Date.now() + s.intervalMin * 60_000, s) : null);
}

export function getNextCallAt(): number | null {
  const v = parseInt(localStorage.getItem(NEXT_AT_KEY) ?? '', 10);
  return Number.isFinite(v) ? v : null;
}

export function setNextCallAt(at: number | null): void {
  if (at === null) localStorage.removeItem(NEXT_AT_KEY);
  else localStorage.setItem(NEXT_AT_KEY, String(at));
  window.dispatchEvent(new Event(CALL_SETTINGS_EVENT));
}

/** Push `at` forward into the next active window if it falls in quiet hours. */
export function alignToWindow(at: number, s: CallSettings): number {
  const d = new Date(at);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= s.startHour && h < s.endHour) return at;

  const next = new Date(d);
  next.setHours(s.startHour, 0, 0, 0);
  if (h >= s.endHour) next.setDate(next.getDate() + 1);
  return next.getTime();
}

/** Schedule the next call `minutes` from now (respecting quiet hours). */
export function scheduleCallIn(minutes: number, s: CallSettings = loadCallSettings()): number {
  const at = alignToWindow(Date.now() + minutes * 60_000, s);
  setNextCallAt(at);
  return at;
}
