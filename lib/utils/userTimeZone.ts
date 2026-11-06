/**
 * Client-only: the user's IANA time zone, as chosen in Settings → Timezone.
 *
 * Stored values: missing / 'auto' → the device's zone (Intl). Any IANA zone → that zone.
 * Legacy: the old settings pre-selected 'UTC' and labelled it "Default", so a stored 'UTC'
 * is treated as "never chosen" → auto. An explicit UTC choice is now stored as 'Etc/UTC'.
 * 'IST' (legacy) → Asia/Kolkata.
 */
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from './day';

export const TIMEZONE_STORAGE_KEY = 'dayly_timezone';
export const TIMEZONE_AUTO = 'auto';

export function detectDeviceTimeZone(): string {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Raw setting: 'auto' or an IANA zone. */
export function getTimeZoneSetting(): string {
  let stored: string | null = null;
  try { stored = localStorage.getItem(TIMEZONE_STORAGE_KEY); } catch { /* blocked storage */ }
  if (!stored || stored === TIMEZONE_AUTO || stored === 'UTC') return TIMEZONE_AUTO;
  return normalizeTimeZone(stored);
}

/** Resolved IANA zone to use for every day boundary and greeting. */
export function getUserTimeZone(): string {
  if (typeof window === 'undefined') return DEFAULT_TIME_ZONE;
  const setting = getTimeZoneSetting();
  return setting === TIMEZONE_AUTO ? detectDeviceTimeZone() : setting;
}
