/**
 * Converts an ISO timestamp to a human-readable relative date string.
 * Uses IST for the "today" boundary so day-breaks are user-aligned.
 * Returns 'Future' for entries timestamped ahead of today (e.g. edited with a future date),
 * so callers can filter them out before building AI context.
 */
export function toRelativeDate(isoString?: string | null): string {
  if (!isoString) return '';
  const parsed = Date.parse(isoString);
  if (isNaN(parsed)) return '';

  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const entryDateIST = new Date(parsed + IST_OFFSET_MS);
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);

  // Compare calendar dates in IST
  const entryDay = new Date(entryDateIST);
  entryDay.setUTCHours(0, 0, 0, 0);

  const todayDay = new Date(nowIST);
  todayDay.setUTCHours(0, 0, 0, 0);

  const diffDays = Math.round((todayDay.getTime() - entryDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Future';   // edited with a future timestamp
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 10) return '1 week ago';
  if (diffDays < 17) return '2 weeks ago';
  if (diffDays < 24) return '3 weeks ago';
  if (diffDays < 45) return '1 month ago';
  return `${Math.floor(diffDays / 30)} months ago`;
}
