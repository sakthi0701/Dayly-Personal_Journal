import { supabase } from '@/lib/supabase';

// Use the enum type from DB
export type AvatarState = 'sun' | 'ice' | 'dormant';

export interface UserStats {
    id: string;
    streak_days: number;
    longest_streak: number;
    streak_start_date: string | null;
    total_entries: number;
    coins: number;
    shields: number;
    shield_month: string | null;
    shield_bought: number;
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
 * Coins earned for a journal entry.
 */
export function calculateEntryCoins(isNewStreakDay: boolean, isContinuedStreak: boolean): number {
    let gained = 50; // Base coins for an entry
    if (isNewStreakDay && isContinuedStreak) {
        gained += 50; // Streak bonus
    } else if (!isNewStreakDay) {
        gained = 10; // Small reward for multiple entries in a day
    }
    return gained;
}

// ── Coins economy ─────────────────────────────────────────────────────────────
// Coins are the only currency: earned from focus, tasks and journaling; lost to
// habit penalties and spent in the shop. XP/levels were removed on purpose (coins
// are enough) — don't reintroduce them. user_stats.xp stays in the DB but is no
// longer written. All changes go through the apply_coin_tx SQL function
// (supabase/coins.sql) so the ledger and balance stay in sync.

export const COIN_RULES = {
  /** Per check-in short of a good habit's weekly goal */
  missPenalty: 40,
  /** Per day a bad habit was logged as failed */
  failPenalty: 40,
  /** Skipped days that reduce a week's goal (more skips are treated as misses) */
  maxExcusedSkips: 1,
  /** Multiplier by consecutive missed weeks for the same habit: 1st, 2nd, 3rd+ */
  missStreakMultiplier: [1, 1.5, 2],
  /** Habit Shield base price; doubles per purchase within a month */
  shieldBasePrice: 150,
} as const;

export interface CoinTxResult {
  ok: boolean;
  duplicate?: boolean;
  insufficient?: boolean;
  shielded?: boolean;
  coins?: number;
  error?: string;
}

export async function applyCoinTx(params: {
  amount: number;
  source: string;
  reason: string;
  refId?: string;
  meta?: Record<string, unknown>;
  requireFunds?: boolean;
  shieldable?: boolean;
}): Promise<CoinTxResult> {
  const { data, error } = await supabase.rpc('apply_coin_tx', {
    p_amount: params.amount,
    p_xp_delta: 0, // XP retired — kept only because the SQL signature requires it
    p_source: params.source,
    p_reason: params.reason,
    p_ref_id: params.refId ?? null,
    p_meta: params.meta ?? {},
    p_require_funds: params.requireFunds ?? false,
    p_shieldable: params.shieldable ?? false,
  });
  if (error) throw error;
  return data as CoinTxResult;
}

/**
 * Award (or correct) coin earnings.
 * Used by Pomodoro completion, task done and journal entries.
 */
export async function earnCoins(amount: number, reason = 'Earned coins'): Promise<void> {
  try {
    await applyCoinTx({ amount, source: 'earn', reason });
  } catch (err) {
    console.error('[earnCoins] failed:', err);
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

    const gainedCoins = calculateEntryCoins(isNewStreakDay, isContinuedStreak);
    const newTotalEntries = stats.total_entries + 1;
    const newState = updateAvatarState(newStreak);

    const { error } = await supabase
        .from('user_stats')
        .update({
            streak_days: newStreak,
            longest_streak: newLongest,
            streak_start_date: newStartDate,
            total_entries: newTotalEntries,
            last_entry_date: nowIso,
            user_timezone: timezone,
            current_avatar_state: newState,
            updated_at: nowIso
        })
        .eq('id', stats.id);

    if (error) {
        console.error("Stats update error:", error);
    }

    await earnCoins(gainedCoins, isContinuedStreak ? 'Journal entry (streak day)' : 'Journal entry');

    return {
        gainedCoins,
        newStreak,
        isNewStreakDay,
        milestone: isNewStreakDay && [3, 7, 30].includes(newStreak) ? newStreak : null
    };
}
