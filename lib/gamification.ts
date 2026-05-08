import { supabase } from '@/lib/supabase';

// Use the enum type from DB
export type AvatarState = 'sun' | 'ice' | 'dormant';

export interface UserStats {
    id: string;
    streak_days: number;
    longest_streak: number;
    streak_start_date: string | null;
    total_entries: number;
    xp: number;
    last_entry_date: string | null;
    user_timezone: string;
    current_avatar_state: AvatarState;
    has_onboarded: boolean;
}

export async function getUserStats(): Promise<UserStats | null> {
    const { data, error } = await supabase
        .from('user_stats')
        .select('*')
        .limit(1)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // No rows found
            return null;
        }
        console.error("Error fetching stats:", error);
        return null;
    }

    const stats = data as UserStats;

    // Dynamically check if the streak is broken so the UI updates
    // passively without needing a new entry to trigger a database update.
    if (stats.last_entry_date && stats.streak_days > 0) {
        const timezone = stats.user_timezone || 'UTC';
        const { isBrokenStreak } = calculateStreak(stats.last_entry_date, timezone);
        if (isBrokenStreak) {
            stats.streak_days = 0;
            stats.current_avatar_state = 'ice';
        }
    }

    return stats;
}

/**
 * Gets the current date as a YYYY-MM-DD string in the specified timezone
 */
export function getLocalDateString(date: Date, timezone: string): string {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(date);
    } catch (e) {
        // Fallback to UTC if timezone is invalid
        console.warn(`Invalid timezone ${timezone}, falling back to UTC`);
        return date.toISOString().split('T')[0];
    }
}

/**
 * Calculates new streak based on the last entry date and the user's local timezone.
 * @returns { streakDays, isNewStreakDay, isBrokenStreak }
 */
export function calculateStreak(lastEntryDateIso: string | null, timezone: string) {
    const now = new Date();
    const todayStr = getLocalDateString(now, timezone);

    if (!lastEntryDateIso) {
        return { streakDays: 1, isNewStreakDay: true, isBrokenStreak: false };
    }

    const lastEntryDate = new Date(lastEntryDateIso);
    const lastEntryStr = getLocalDateString(lastEntryDate, timezone);

    if (todayStr === lastEntryStr) {
        // Already posted today in their local time
        return { streakDays: null, isNewStreakDay: false, isBrokenStreak: false }; // streak unchanged
    }

    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday, timezone);

    if (lastEntryStr === yesterdayStr) {
        // Continued streak
        return { streakDays: null, isNewStreakDay: true, isBrokenStreak: false }; // We'll increment outside
    }

    // Broken streak
    return { streakDays: 1, isNewStreakDay: true, isBrokenStreak: true };
}

/**
 * Calculates the Avatar State based on the streak.
 */
export function updateAvatarState(streakDays: number): AvatarState {
    if (streakDays > 0) return 'sun';
    return 'ice';
}

/**
 * Calculates additional XP based on entry conditions.
 */
export function calculateXP(isNewStreakDay: boolean, isContinuedStreak: boolean): number {
    let gainedXp = 50; // Base XP for an entry
    if (isNewStreakDay && isContinuedStreak) {
        gainedXp += 50; // Streak bonus
    } else if (!isNewStreakDay) {
        gainedXp = 10; // Small XP for multiple entries in a day
    }
    return gainedXp;
}

/**
 * Determine the user level based on an exponential XP curve.
 * Levels increase in cost to reward sustained engagement.
 */
export const LEVEL_THRESHOLDS = [
  { level: 1, title: 'Novice',      xp: 0 },
  { level: 2, title: 'Apprentice',  xp: 300 },
  { level: 3, title: 'Seeker',      xp: 750 },
  { level: 4, title: 'Voyager',     xp: 1500 },
  { level: 5, title: 'Adept',       xp: 3000 },
  { level: 6, title: 'Scholar',     xp: 6000 },
  { level: 7, title: 'Sage',        xp: 12000 },
  { level: 8, title: 'Master',      xp: 25000 },
];

export function calculateLevel(xp: number) {
  let currentTier = LEVEL_THRESHOLDS[0];
  let nextTier = LEVEL_THRESHOLDS[1];

  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i].xp) {
      currentTier = LEVEL_THRESHOLDS[i];
      nextTier = LEVEL_THRESHOLDS[i + 1] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
      break;
    }
  }

  const tierRange = nextTier.xp - currentTier.xp;
  const progressToNext = xp - currentTier.xp;
  const progressPercent = tierRange > 0
    ? Math.min(100, Math.max(0, (progressToNext / tierRange) * 100))
    : 100;

  return {
    level: currentTier.level,
    title: currentTier.title,
    currentTierXp: progressToNext,
    nextLevelXp: tierRange > 0 ? tierRange : nextTier.xp - currentTier.xp,
    progressPercent,
    nextTitle: nextTier.title,
  };
}

/**
 * Directly add XP to the user's stats. Used by Pomodoro completion and task done.
 */
export async function addXP(amount: number): Promise<void> {
  try {
    const stats = await getUserStats();
    if (!stats) return;
    await supabase
      .from('user_stats')
      .update({ xp: stats.xp + amount, updated_at: new Date().toISOString() })
      .eq('id', stats.id);
  } catch (err) {
    console.error('[addXP] failed:', err);
  }
}


export async function updateUserStatsOnEntry(clientTimezone: string = 'UTC') {
    let stats = await getUserStats();
    if (!stats) {
        // MVP: insert if missing
        const { data, error } = await supabase.from('user_stats').insert([{ user_timezone: clientTimezone }]).select().single();
        if (error || !data) {
            console.error("Failed to init stats", error);
            return;
        }
        stats = data as UserStats;
    }

    // Use requested timezone, or fallback to saved, or UTC
    const timezone = clientTimezone || stats.user_timezone || 'UTC';

    const { streakDays, isNewStreakDay, isBrokenStreak } = calculateStreak(stats.last_entry_date, timezone);

    let newStreak = stats.streak_days;
    let newLongest = stats.longest_streak;
    let newStartDate = stats.streak_start_date;
    const nowIso = new Date().toISOString();

    let isContinuedStreak = false;

    if (isNewStreakDay) {
        isContinuedStreak = !isBrokenStreak && stats.streak_days > 0;

        if (streakDays !== null) {
            newStreak = streakDays; // 1 (broken or first)
            newStartDate = nowIso;
        } else {
            newStreak += 1; // Continued
        }

        if (newStreak > newLongest) {
            newLongest = newStreak;
        }
    }

    const gainedXp = calculateXP(isNewStreakDay, isContinuedStreak);
    const newXp = stats.xp + gainedXp;
    const newTotalEntries = stats.total_entries + 1;
    const newState = updateAvatarState(newStreak);

    const { error } = await supabase
        .from('user_stats')
        .update({
            streak_days: newStreak,
            longest_streak: newLongest,
            streak_start_date: newStartDate,
            total_entries: newTotalEntries,
            xp: newXp,
            last_entry_date: nowIso,
            user_timezone: timezone,
            current_avatar_state: newState,
            updated_at: nowIso
        })
        .eq('id', stats.id);

    if (error) {
        console.error("Stats update error:", error);
    }

    return {
        gainedXp,
        newStreak,
        isNewStreakDay,
        milestone: isNewStreakDay && [3, 7, 30].includes(newStreak) ? newStreak : null
    };
}
