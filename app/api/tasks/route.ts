import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get('tag');
    const statusFilter = searchParams.get('status');

    // Only join tags when filtering by tag (inner join needed for correct filtering).
    // For the normal list view we skip tag/time_blocks joins for speed.
    const selectStr = tagId
      ? `*, subtasks:tasks!parent_task_id(*), task_tags!inner(tag_id, tags(id, name))`
      : `*, subtasks:tasks!parent_task_id(*), task_tags(tags(id, name))`;

    let query = supabase
      .from('tasks')
      .select(selectStr)
      .is('parent_task_id', null)
      .order('priority', { ascending: false })
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });

    if (tagId) {
      query = query.eq('task_tags.tag_id', tagId);
    }

    const { data: tasks, error } = await query;

    if (error) throw error;

    // Flatten tags, and apply JS-level status filtering to support subtasks correctly
    let normalized = (tasks || []).map((task) => {
      let filteredSubtasks = task.subtasks || [];
      if (statusFilter && statusFilter !== 'all') {
        filteredSubtasks = filteredSubtasks.filter((st: any) => st.status === statusFilter);
      }
      return {
        ...task,
        subtasks: filteredSubtasks,
        tags: task.task_tags?.map((tt: any) => tt.tags).filter(Boolean) ?? [],
        task_tags: undefined,
      };
    });

    if (statusFilter && statusFilter !== 'all') {
      normalized = normalized.filter(t => t.status === statusFilter || t.subtasks.length > 0);
    }

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
      recurrence_end_date,
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
        recurrence_end_date: recurrence_end_date ?? null,
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

    // Increment goal total_task_count when a task is linked to a goal.
    if (goal_id) {
      const { error: counterErr } = await supabase.rpc('increment_goal_total', { goal_id_input: goal_id });
      if (counterErr) {
        // Fallback: manual read-increment if RPC not available
        const { data: g } = await supabase.from('goals').select('total_task_count').eq('id', goal_id).single();
        if (g) {
          await supabase.from('goals').update({ total_task_count: (g.total_task_count ?? 0) + 1 }).eq('id', goal_id);
        }
      }
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tasks]', err);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
