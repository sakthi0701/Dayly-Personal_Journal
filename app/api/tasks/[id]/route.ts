import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addXP } from '@/lib/gamification';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const allowed = [
      'title', 'notes', 'status', 'priority',
      'estimated_pomodoros', 'elapsed_pomodoros',
      'due_date', 'is_recurring', 'recurrence_rule', 'position', 'goal_id',
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Handle tag replacement if provided
    if (Array.isArray(body.tagIds)) {
      // Remove existing tag links
      await supabase.from('task_tags').delete().eq('task_id', id);
      // Insert new ones
      if (body.tagIds.length > 0) {
        const tagLinks = body.tagIds.map((tid: string) => ({ task_id: id, tag_id: tid }));
        const { error: tagError } = await supabase.from('task_tags').insert(tagLinks);
        if (tagError) throw tagError;
      }
    }

    // Grant XP when task is completed
    if (updates.status === 'done') {
      await addXP(20);
    }

    return NextResponse.json({ task });
  } catch (err) {
    console.error('[PATCH /api/tasks/[id]]', err);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/tasks/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
