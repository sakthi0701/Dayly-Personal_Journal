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

    // Get existing task to check previous status for goal progress tracking
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('status, goal_id')
      .eq('id', id)
      .single();

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

    // Grant XP when task is completed (only on transition)
    if (updates.status === 'done' && existingTask?.status !== 'done') {
      await addXP(20);

      // Increment completed_task_count for the goal
      const targetGoalId = updates.goal_id !== undefined ? updates.goal_id : existingTask?.goal_id;
      if (targetGoalId) {
        const { error: counterErr } = await supabase.rpc('increment_goal_completed', { goal_id_input: targetGoalId });
        if (counterErr) {
          // Fallback: manual read-increment
          const { data: g } = await supabase.from('goals').select('completed_task_count').eq('id', targetGoalId).single();
          if (g) {
            await supabase.from('goals').update({ completed_task_count: (g.completed_task_count ?? 0) + 1 }).eq('id', targetGoalId);
          }
        }
      }
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
