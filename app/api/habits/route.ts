import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: habits, error } = await supabase
      .from('habits')
      .select(`
        *,
        habit_logs (
          id,
          logged_at,
          status
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ habits });
  } catch (err) {
    console.error('[GET /api/habits]', err);
    return NextResponse.json({ error: 'Failed to fetch habits' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, icon, color, frequency, habit_type } = body;

    const { data: habit, error } = await supabase
      .from('habits')
      .insert({
        name,
        icon: icon ?? '✨',
        color: color ?? 'indigo',
        frequency: frequency ?? { type: 'daily' },
        habit_type: habit_type ?? 'good',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ habit }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/habits]', err);
    return NextResponse.json({ error: 'Failed to create habit' }, { status: 500 });
  }
}
