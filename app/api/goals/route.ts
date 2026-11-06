import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { enrichGoal } from '@/lib/stats/goals';
import { localDateStr, normalizeTimeZone } from '@/lib/utils/day';

export const dynamic = 'force-dynamic';

/** GET /api/goals?tz=<IANA zone> — days_remaining is counted from the user's local today. */
export async function GET(request: Request) {
  try {
    const { data: goals, error } = await supabase
      .from('goals')
      .select('*')
      .order('deadline', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    const tz = normalizeTimeZone(new URL(request.url).searchParams.get('tz'));
    const todayStr = localDateStr(new Date(), tz);
    const enriched = (goals || []).map((g) => enrichGoal(g, todayStr, tz));

    return NextResponse.json({ goals: enriched });
  } catch (err) {
    console.error('[GET /api/goals]', err);
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
  }
}


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, deadline, parent_goal_id } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const { data: goal, error } = await supabase
      .from('goals')
      .insert({
        title: title.trim(),
        deadline: deadline ?? null,
        parent_goal_id: parent_goal_id ?? null,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ goal }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/goals]', err);
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}
