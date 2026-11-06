import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function DELETE(req: Request) {
    // Refuse a bare DELETE: the client must send the confirmation the user typed/authorized.
    // This is a guard against accidental or stray calls, NOT authentication — the API has no auth.
    const body = await req.json().catch(() => null);
    if (body?.confirm !== 'DELETE') {
        return NextResponse.json({ error: 'Confirmation required' }, { status: 400 });
    }

    try {
        // 1. Delete all entries
        const { error: entriesError } = await supabase
            .from('entries')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Target all rows

        if (entriesError) {
            console.error("Error deleting entries:", entriesError.message, entriesError.details);
            return NextResponse.json({ error: 'Failed to delete entries', msg: entriesError.message }, { status: 500 });
        }

        // 2. Reset user_stats
        const { error: statsError } = await supabase
            .from('user_stats')
            .update({
                streak_days: 0,
                longest_streak: 0,
                streak_start_date: null,
                total_entries: 0,
                xp: 0,
                coins: 0,
                shields: 0,
                shield_month: null,
                shield_bought: 0,
                last_entry_date: null,
                current_avatar_state: 'dormant',
                has_onboarded: false // Optionally reset this, though maybe users want to skip onboarding again?
            })
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (statsError) {
            console.error("Error resetting stats:", statsError);
            return NextResponse.json({ error: 'Failed to reset user stats' }, { status: 500 });
        }

        // 3. Clear the coin ledger so Recent activity matches the reset balances
        const { error: ledgerError } = await supabase
            .from('coin_transactions')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (ledgerError) {
            console.error("Error clearing coin ledger:", ledgerError);
            return NextResponse.json({ error: 'Failed to clear coin ledger' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'All data cleared successfully' });
    } catch (error) {
        console.error("Internal server error during data clear:", error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
