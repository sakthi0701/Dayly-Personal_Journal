import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get('tag');
    const statusFilter = searchParams.get('status');

    // Fetch top-level tasks (no parent) with their tags
    let query = supabase
      .from('tasks')
      .select(`
        *,
        subtasks:tasks!parent_task_id(*),
        task_tags (
          tags ( id, name )
        ),
        time_blocks ( duration, mode, completed )
      `)
      .is('parent_task_id', null)
      .order('priority', { ascending: false })
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: tasks, error } = await query;

    if (error) throw error;

    // Flatten tags from nested join
    const normalized = (tasks || []).map((task) => ({
      ...task,
      tags: task.task_tags?.map((tt: { tags: { id: string; name: string } | null }) => tt.tags).filter(Boolean) ?? [],
      task_tags: undefined,
    }));

    return NextResponse.json({ tasks: normalized });
  } catch (err) {
    console.error('[GET /api/tasks]', err);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      title,
      notes,
      priority = 'none',
      estimated_pomodoros = 1,
      due_date,
      parent_task_id,
      is_recurring,
      recurrence_rule,
      tagIds = [],
      goal_id,
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Get max position for ordering
    const { data: lastTask } = await supabase
      .from('tasks')
      .select('position')
      .is('parent_task_id', parent_task_id ?? null)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const position = (lastTask?.position ?? -1) + 1;

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title: title.trim(),
        notes: notes?.trim() ?? null,
        priority,
        estimated_pomodoros,
        due_date: due_date ?? null,
        parent_task_id: parent_task_id ?? null,
        is_recurring: is_recurring ?? false,
        recurrence_rule: recurrence_rule ?? null,
        position,
        goal_id: goal_id ?? null,
      })
      .select()
      .single();

    if (taskError) throw taskError;

    // Link tags if provided
    if (tagIds.length > 0) {
      const tagLinks = tagIds.map((tid: string) => ({ task_id: task.id, tag_id: tid }));
      const { error: tagError } = await supabase.from('task_tags').insert(tagLinks);
      if (tagError) throw tagError;
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tasks]', err);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
