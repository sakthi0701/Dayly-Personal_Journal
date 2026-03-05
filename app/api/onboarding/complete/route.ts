import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST() {
    try {
        const { error } = await supabase
            .from('user_stats')
            .update({ has_onboarded: true })
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Update the single MVP row

        if (error) {
            console.error("Error updating onboarding status:", error);
            return NextResponse.json({ error: 'Failed to update onboarding status' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Internal server error:", error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
