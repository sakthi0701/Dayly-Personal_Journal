import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/pressure-tasks — list all (optionally filter today or all)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') ?? 'all'; // 'today' | 'all' | 'active'

    let query = supabase
      .from('pressure_tasks')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('priority', { ascending: true })
      .order('deadline', { ascending: true, nullsFirst: false });

    if (filter === 'active') {
      query = query.in('status', ['todo', 'snoozed']);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ tasks: data ?? [] });
  } catch (err) {
    console.error('[GET /api/pressure-tasks]', err);
    return NextResponse.json({ error: 'Failed to fetch pressure tasks' }, { status: 500 });
  }
}

// POST /api/pressure-tasks — create a new pressure task
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, priority = 1, deadline, estimated_minutes } = body;
    if (!title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('pressure_tasks')
      .insert({
        title: title.trim(),
        priority,
        deadline: deadline ?? null,
        estimated_minutes: estimated_minutes ?? null,
        status: 'todo',
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/pressure-tasks]', err);
    return NextResponse.json({ error: 'Failed to create pressure task' }, { status: 500 });
  }
}
