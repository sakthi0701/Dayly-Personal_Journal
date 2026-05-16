import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/session-review — list recent session reviews (for Journal)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    const { data, error } = await supabase
      .from('session_reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return NextResponse.json({ reviews: data ?? [] });
  } catch (err) {
    console.error('[GET /api/session-review]', err);
    return NextResponse.json({ error: 'Failed to fetch session reviews' }, { status: 500 });
  }
}

// POST /api/session-review — save a session review
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      time_block_id,
      task_title,
      selected_not_to_dos = [],
      triggered_distractions = [],
      xp_earned = 0,
      xp_deducted = 0,
      completion_note,
      session_duration_seconds,
    } = body;

    const { data, error } = await supabase
      .from('session_reviews')
      .insert({
        time_block_id: time_block_id ?? null,
        task_title: task_title ?? null,
        selected_not_to_dos,
        triggered_distractions,
        xp_earned,
        xp_deducted,
        completion_note: completion_note ?? null,
        session_duration_seconds: session_duration_seconds ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ review: data }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/session-review]', err);
    return NextResponse.json({ error: 'Failed to save session review' }, { status: 500 });
  }
}
