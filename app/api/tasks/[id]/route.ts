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
      'due_date', 'is_recurring', 'recurrence_rule', 'recurrence_end_date', 'position', 'goal_id',
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
      .select('status, goal_id, is_recurring, recurrence_end_date, due_date, title, priority, estimated_pomodoros, recurrence_rule, notes')
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
      await supabase.from('task_tags').delete().eq('task_id', id);
      if (body.tagIds.length > 0) {
        const tagLinks = body.tagIds.map((tid: string) => ({ task_id: id, tag_id: tid }));
        const { error: tagError } = await supabase.from('task_tags').insert(tagLinks);
        if (tagError) throw tagError;
      }
    }

    // Handle completion (only on status transition to 'done')
    if (updates.status === 'done' && existingTask?.status !== 'done') {
      await addXP(20);

      // Increment completed_task_count for the linked goal
      const targetGoalId = updates.goal_id !== undefined ? updates.goal_id : existingTask?.goal_id;
      if (targetGoalId) {
        const { error: counterErr } = await supabase.rpc('increment_goal_completed', { goal_id_input: targetGoalId });
        if (counterErr) {
          const { data: g } = await supabase.from('goals').select('completed_task_count').eq('id', targetGoalId).single();
          if (g) {
            await supabase.from('goals').update({ completed_task_count: (g.completed_task_count ?? 0) + 1 }).eq('id', targetGoalId);
          }
        }
      }

      // ── Recurring Task: Spawn next occurrence ────────────────────────────
      const isRecurring = updates.is_recurring !== undefined ? updates.is_recurring : existingTask?.is_recurring;
      if (isRecurring) {
        const rule = existingTask?.recurrence_rule ?? 'days:1';
        const currentDueDate = existingTask?.due_date ? new Date(existingTask.due_date) : new Date();
        const nextDueDate = new Date(currentDueDate);

        if (rule.startsWith('days:')) {
          const days = rule.replace('days:', '').split(',').map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
          if (days.length > 0) {
            const currentDay = currentDueDate.getDay();
            let minOffset = 7;
            for (let offset = 1; offset <= 7; offset++) {
              if (days.includes((currentDay + offset) % 7)) {
                minOffset = offset;
                break;
              }
            }
            nextDueDate.setDate(nextDueDate.getDate() + minOffset);
          } else {
            nextDueDate.setDate(nextDueDate.getDate() + 7);
          }
        } else {
          // Legacy fallback for Nx-weekly or weekly
          const match = rule.match(/^(\d+)x-weekly$/);
          const timesPerWeek = match ? parseInt(match[1], 10) : 1;
          const intervalDays = Math.round(7 / Math.max(1, timesPerWeek));
          nextDueDate.setDate(nextDueDate.getDate() + intervalDays);
        }

        const recEndDate = existingTask?.recurrence_end_date;
        const shouldSpawn = !recEndDate || nextDueDate <= new Date(recEndDate);

        if (shouldSpawn) {
          const nextDueDateStr = nextDueDate.toISOString().slice(0, 10);

          // Get max position in current task list
          const { data: lastTask } = await supabase
            .from('tasks')
            .select('position')
            .is('parent_task_id', null)
            .order('position', { ascending: false })
            .limit(1)
            .single();
          const nextPosition = (lastTask?.position ?? -1) + 1;

          await supabase.from('tasks').insert({
            title: existingTask?.title,
            notes: existingTask?.notes ?? null,
            priority: existingTask?.priority ?? 'none',
            estimated_pomodoros: existingTask?.estimated_pomodoros ?? 1,
            due_date: nextDueDateStr,
            is_recurring: true,
            recurrence_rule: rule, // preserve exact rule (e.g. '2x-weekly')
            recurrence_end_date: existingTask?.recurrence_end_date ?? null,
            status: 'todo',
            position: nextPosition,
            goal_id: targetGoalId ?? null,
          });

          // If goal is linked AND has a bounded end date, increment total_task_count for the new spawned task
          if (targetGoalId && recEndDate) {
            const { error: totalErr } = await supabase.rpc('increment_goal_total', { goal_id_input: targetGoalId });
            if (totalErr) {
              const { data: g } = await supabase.from('goals').select('total_task_count').eq('id', targetGoalId).single();
              if (g) {
                await supabase.from('goals').update({ total_task_count: (g.total_task_count ?? 0) + 1 }).eq('id', targetGoalId);
              }
            }
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
