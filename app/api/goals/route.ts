import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: goals, error } = await supabase
      .from('goals')
      .select('*, tasks(id, status)')
      .order('deadline', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with days_remaining and real task progress
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enriched = (goals || []).map((g) => {
      // Calculate real task progress
      const linkedTasks = g.tasks || [];
      const totalTasks = linkedTasks.length;
      const completedTasks = linkedTasks.filter((t: any) => t.status === 'done').length;
      const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      if (!g.deadline) return { ...g, days_remaining: null, progress_pct: progressPct };
      
      const deadline = new Date(g.deadline);
      deadline.setHours(0, 0, 0, 0);
      const daysRemaining = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      return { ...g, days_remaining: daysRemaining, progress_pct: progressPct };
    });

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
