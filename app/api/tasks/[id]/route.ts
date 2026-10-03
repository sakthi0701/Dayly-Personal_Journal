import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addXP } from '@/lib/gamification';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseDateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function formatDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUTC(d: Date, days: number): Date {
  const res = new Date(d);
  res.setUTCDate(res.getUTCDate() + days);
  return res;
}

function getTodayDateStr(clientDate?: string | null): string {
  if (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
    return clientDate;
  }
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
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

    let spawnedTask = null;

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

      // ── Recurring Task: Advance / Spawn next occurrence ──────────────────
      const isRecurring = updates.is_recurring !== undefined ? updates.is_recurring : existingTask?.is_recurring;
      if (isRecurring && existingTask?.title) {
        // Mark the completed task's is_recurring to false so historical completed records
        // do not re-spawn tasks if toggled later. (recurrence_rule is preserved for badge display)
        await supabase.from('tasks').update({ is_recurring: false }).eq('id', id);

        const rule = existingTask?.recurrence_rule ?? 'days:1';
        const todayStr = getTodayDateStr(body.today);
        const currentDueDateStr = existingTask?.due_date ? existingTask.due_date.slice(0, 10) : todayStr;

        let nextDueDateStr = todayStr;

        if (rule.startsWith('days:')) {
          const days = rule
            .replace('days:', '')
            .split(',')
            .map((n: string) => parseInt(n, 10))
            .filter((n: number) => !isNaN(n) && n >= 0 && n <= 6);

          if (days.length > 0) {
            if (currentDueDateStr < todayStr) {
              // Task was overdue. Completion is happening today.
              // The next occurrence CANNOT be in the past.
              const todayDate = parseDateUTC(todayStr);
              const todayDayOfWeek = todayDate.getUTCDay();

              if (days.includes(todayDayOfWeek)) {
                nextDueDateStr = todayStr;
              } else {
                let minOffset = 7;
                for (let offset = 1; offset <= 7; offset++) {
                  if (days.includes((todayDayOfWeek + offset) % 7)) {
                    minOffset = offset;
                    break;
                  }
                }
                nextDueDateStr = formatDateUTC(addDaysUTC(todayDate, minOffset));
              }
            } else {
              // Task was due today or in the future.
              // That occurrence is completed; next occurrence MUST be strictly after currentDueDateStr.
              const baseDate = parseDateUTC(currentDueDateStr);
              const baseDayOfWeek = baseDate.getUTCDay();
              let minOffset = 7;
              for (let offset = 1; offset <= 7; offset++) {
                if (days.includes((baseDayOfWeek + offset) % 7)) {
                  minOffset = offset;
                  break;
                }
              }
              nextDueDateStr = formatDateUTC(addDaysUTC(baseDate, minOffset));
            }
          } else {
            const baseStr = currentDueDateStr >= todayStr ? currentDueDateStr : todayStr;
            nextDueDateStr = formatDateUTC(addDaysUTC(parseDateUTC(baseStr), 7));
          }
        } else {
          // Legacy fallback for Nx-weekly or weekly
          const match = rule.match(/^(\d+)x-weekly$/);
          const timesPerWeek = match ? parseInt(match[1], 10) : 1;
          const intervalDays = Math.round(7 / Math.max(1, timesPerWeek));
          const baseStr = currentDueDateStr >= todayStr ? currentDueDateStr : todayStr;
          nextDueDateStr = formatDateUTC(addDaysUTC(parseDateUTC(baseStr), intervalDays));
        }

        const recEndDate = existingTask?.recurrence_end_date;
        const shouldSpawn = !recEndDate || nextDueDateStr <= recEndDate.slice(0, 10);

        if (shouldSpawn) {
          // ── DEDUPLICATION CHECK: Check if an active task for this series already exists ──
          const { data: existingActiveTasks } = await supabase
            .from('tasks')
            .select('id, due_date, status, position')
            .eq('title', existingTask.title.trim())
            .neq('id', id)
            .in('status', ['todo', 'in-progress']);

          if (existingActiveTasks && existingActiveTasks.length > 0) {
            // An active instance already exists! Do NOT insert a duplicate row.
            // If the existing active task has an older due date, advance it to nextDueDateStr.
            const primaryActive = existingActiveTasks[0];
            if (primaryActive.due_date && primaryActive.due_date < nextDueDateStr) {
              const { data: updatedActive } = await supabase
                .from('tasks')
                .update({ due_date: nextDueDateStr })
                .eq('id', primaryActive.id)
                .select()
                .single();
              spawnedTask = updatedActive;
            } else {
              spawnedTask = primaryActive;
            }
          } else {
            // No active task exists. Insert the new occurrence.
            const { data: lastTask } = await supabase
              .from('tasks')
              .select('position')
              .is('parent_task_id', null)
              .order('position', { ascending: false })
              .limit(1)
              .single();
            const nextPosition = (lastTask?.position ?? -1) + 1;

            const { data: newTask, error: insertErr } = await supabase
              .from('tasks')
              .insert({
                title: existingTask.title.trim(),
                notes: existingTask.notes ?? null,
                priority: existingTask.priority ?? 'none',
                estimated_pomodoros: existingTask.estimated_pomodoros ?? 1,
                due_date: nextDueDateStr,
                is_recurring: true,
                recurrence_rule: rule,
                recurrence_end_date: existingTask.recurrence_end_date ?? null,
                status: 'todo',
                position: nextPosition,
                goal_id: targetGoalId ?? null,
              })
              .select()
              .single();

            if (!insertErr && newTask) {
              spawnedTask = newTask;

              // Copy tags from existing task if any
              const { data: existingTags } = await supabase
                .from('task_tags')
                .select('tag_id')
                .eq('task_id', id);

              if (existingTags && existingTags.length > 0) {
                const newTagLinks = existingTags.map((t: { tag_id: string }) => ({
                  task_id: newTask.id,
                  tag_id: t.tag_id,
                }));
                await supabase.from('task_tags').insert(newTagLinks);
              }

              // Increment goal total_task_count if bounded
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
      }
    }

    return NextResponse.json({ task, spawnedTask });
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
