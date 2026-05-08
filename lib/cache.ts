/**
 * lib/cache.ts — Dayly Local Cache Engine
 *
 * Strategy: Stale-While-Revalidate (SWR)
 * 1. Return cached data immediately (zero wait for the user)
 * 2. Re-fetch from network silently in the background
 * 3. Update the cache with fresh data
 *
 * On Android: maps to native SharedPreferences via @capacitor/preferences
 * On Web:     falls back to localStorage transparently
 */

import { Preferences } from '@capacitor/preferences';

interface CacheEntry<T> {
  data: T;
  timestamp: number; // Unix ms
  version: number;
}

// ─── TTL CONFIGURATION ────────────────────────────────────────────────────────
// Tune these to balance freshness vs. API call frequency.
export const CACHE_TTL = {
  USER_STATS: 5 * 60 * 1000,       // 5 min  — streak/XP (changes after journaling)
  ENTRIES_LIST: 15 * 60 * 1000,    // 15 min — entry list (changes rarely mid-session)
  TASKS: 10 * 60 * 1000,           // 10 min — tasks
  HABITS: 10 * 60 * 1000,          // 10 min — habits
  ANALYTICS: 30 * 60 * 1000,       // 30 min — charts/heatmaps (heavy, rarely changes)
  SENSEI_ADVICE: 60 * 60 * 1000,   // 60 min — AI advice (expensive to generate)
} as const;

// ─── CACHE VERSION ────────────────────────────────────────────────────────────
// Bump this when data shape changes to auto-invalidate all stale caches.
const CACHE_VERSION = 1;

// ─── KEYS ─────────────────────────────────────────────────────────────────────
export const CACHE_KEYS = {
  USER_STATS: 'cache:user_stats',
  ENTRIES_LIST: 'cache:entries_list',
  TASKS: 'cache:tasks',
  HABITS: 'cache:habits',
  ANALYTICS: 'cache:analytics',
  SENSEI_ADVICE: 'cache:sensei_advice',
  PENDING_ENTRIES: 'cache:pending_entries', // Offline queue
} as const;

// ─── CORE PRIMITIVES ─────────────────────────────────────────────────────────

async function _get<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const { value } = await Preferences.get({ key });
    if (!value) return null;
    const parsed: CacheEntry<T> = JSON.parse(value);
    // Invalidate if cache version changed (schema migration)
    if (parsed.version !== CACHE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function _set<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    };
    await Preferences.set({ key, value: JSON.stringify(entry) });
  } catch (err) {
    console.warn('[Cache] Failed to write:', key, err);
  }
}

async function _remove(key: string): Promise<void> {
  try {
    await Preferences.remove({ key });
  } catch (err) {
    console.warn('[Cache] Failed to remove:', key, err);
  }
}

function _isStale(entry: CacheEntry<unknown>, ttlMs: number): boolean {
  return Date.now() - entry.timestamp > ttlMs;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Read from cache. Returns null if cache is empty or expired.
 */
export async function cacheGet<T>(key: string, ttlMs: number): Promise<T | null> {
  const entry = await _get<T>(key);
  if (!entry) return null;
  if (_isStale(entry, ttlMs)) return null;
  return entry.data;
}

/**
 * Write data to cache.
 */
export async function cacheSet<T>(key: string, data: T): Promise<void> {
  await _set(key, data);
}

/**
 * Delete a specific cache entry (call after mutations to force refresh).
 */
export async function cacheInvalidate(key: string): Promise<void> {
  await _remove(key);
}

/**
 * Nuke all Dayly caches. Use on logout or data reset.
 */
export async function cacheClear(): Promise<void> {
  await Promise.all(Object.values(CACHE_KEYS).map((k) => _remove(k)));
}

/**
 * Stale-While-Revalidate fetch wrapper.
 *
 * Returns cached data immediately if available (even if stale),
 * then fetches fresh data in the background and calls onFresh() with it.
 *
 * Usage:
 * ```ts
 * const stats = await swrFetch(
 *   CACHE_KEYS.USER_STATS,
 *   CACHE_TTL.USER_STATS,
 *   () => fetch('/api/stats/user').then(r => r.json()),
 *   (fresh) => setUserStats(fresh)
 * );
 * ```
 */
export async function swrFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  onFresh?: (data: T) => void
): Promise<T> {
  const entry = await _get<T>(key);
  const isCacheUsable = entry !== null && !_isStale(entry, ttlMs);

  if (isCacheUsable) {
    // Return cached immediately, revalidate in background
    (async () => {
      try {
        const fresh = await fetcher();
        await _set(key, fresh);
        onFresh?.(fresh);
      } catch {
        // Background refresh failed — cached data remains, no error surfaced
      }
    })();
    return entry.data;
  }

  // Cache miss or expired — fetch and block until we have data
  const fresh = await fetcher();
  await _set(key, fresh);
  onFresh?.(fresh);
  return fresh;
}

// ─── OFFLINE QUEUE ────────────────────────────────────────────────────────────

export interface PendingEntry {
  id: string;           // Local UUID
  content: string;      // Entry text
  createdAt: string;    // ISO timestamp
  attempts: number;     // Retry count
}

/**
 * Queue a journal entry when offline. Will be synced on next online event.
 */
export async function queueOfflineEntry(content: string): Promise<void> {
  const entry = await _get<PendingEntry[]>(CACHE_KEYS.PENDING_ENTRIES);
  const queue: PendingEntry[] = entry?.data ?? [];
  queue.push({
    id: crypto.randomUUID(),
    content,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await _set(CACHE_KEYS.PENDING_ENTRIES, queue);
}

/**
 * Get all queued offline entries.
 */
export async function getOfflineQueue(): Promise<PendingEntry[]> {
  const entry = await _get<PendingEntry[]>(CACHE_KEYS.PENDING_ENTRIES);
  return entry?.data ?? [];
}

/**
 * Remove a successfully synced entry from the queue.
 */
export async function removeFromOfflineQueue(id: string): Promise<void> {
  const entry = await _get<PendingEntry[]>(CACHE_KEYS.PENDING_ENTRIES);
  const queue = (entry?.data ?? []).filter((e) => e.id !== id);
  await _set(CACHE_KEYS.PENDING_ENTRIES, queue);
}

// ─── ANDROID HOME SCREEN WIDGET SYNC ──────────────────────────────────────────

/**
 * Syncs specific datasets (Tasks, Habits, Goals) into flat JSON strings
 * inside Preferences so the native Android widgets can parse them easily.
 */
export async function syncWidgetsToNative(
  tasks: Array<{ title: string; progress: number }>,
  habits: Array<{ title: string }>,
  goals: Array<{ title: string; icon: string; progress: number }>
): Promise<void> {
  try {
    await Preferences.set({ key: 'widget_tasks', value: JSON.stringify(tasks) });
    await Preferences.set({ key: 'widget_habits', value: JSON.stringify(habits) });
    await Preferences.set({ key: 'widget_goals', value: JSON.stringify(goals) });

    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
      // Native widget handles its own update schedules, but data is now ready.
    }
  } catch (e) {
    console.error('[WidgetSync] Failed to sync widgets to native preferences', e);
  }
}

/**
 * Fetches the latest data from the API and pushes it to the native Android widgets.
 * Call this function whenever tasks, habits, or goals change.
 */
export async function triggerWidgetDataSync(): Promise<void> {
  if (typeof window === 'undefined') return; // Client only
  
  try {
    const [tasksRes, habitsRes, goalsRes] = await Promise.all([
      fetch('/api/tasks?status=todo').then(r => r.json()).catch(() => ({ tasks: [] })),
      fetch('/api/habits').then(r => r.json()).catch(() => ({ habits: [] })),
      fetch('/api/goals').then(r => r.json()).catch(() => ({ goals: [] }))
    ]);

    const tasks = (tasksRes.tasks ?? []).slice(0, 5).map((t: any) => ({
      title: t.title,
      progress: t.status === 'in-progress' ? 50 : 0
    }));

    const habits = (habitsRes.habits ?? []).slice(0, 3).map((h: any) => ({
      title: h.name
    }));

    const goals = (goalsRes.goals ?? []).filter((g: any) => g.status === 'active').slice(0, 3).map((g: any) => ({
      title: g.title,
      icon: g.icon || '💻',
      progress: Math.min(100, Math.round(((g.current_value || 0) / (g.target_value || 1)) * 100))
    }));

    await syncWidgetsToNative(tasks, habits, goals);
  } catch (e) {
    console.error('[WidgetSync] Data fetch failed', e);
  }
}
