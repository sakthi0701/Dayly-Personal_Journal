import { NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { earnCoins } from '@/lib/gamification';
import { notifyTelegram } from '@/lib/telegram';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      blockId,
      duration,
      total_duration,   // planned session length in seconds (sent by store)
      task_id,
      // Free-text focus label (e.g. "DSA" from a Telegram-started session) used when
      // task_id doesn't resolve to a task/pressure task.
      task_title: fallbackTaskTitle = null,
      // Phase 13: session review fields (all optional)
      not_to_do_selected = [],   // [{label, emoji}]
      triggered_distractions = [],
      completion_note,
    } = body;

    if (!blockId) {
      return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
    }

    // ── 20% minimum threshold ─────────────────────────────────────────────────
    // If less than 20% of the planned session was elapsed, treat as abandoned:
    // delete the block so it doesn't pollute focus stats or task pomodoro counts.
    const plannedSeconds = total_duration ?? (25 * 60); // fallback: full pomodoro
    if (duration != null && duration < plannedSeconds * 0.2) {
      await supabase.from('time_blocks').delete().eq('id', blockId);
      return NextResponse.json({ success: true, abandoned: true, reason: 'below_minimum_threshold' });
    }

    // Check idempotency: If already completed, handle review update / return existing stats
    const { data: existingBlock } = await supabase
      .from('time_blocks')
      .select('completed, task_id, mode')
      .eq('id', blockId)
      .single();

    if (existingBlock?.completed) {
      const { data: existingReview } = await supabase
        .from('session_reviews')
        .select('*')
        .eq('time_block_id', blockId)
        .single();

      const coinsEarned = existingReview?.xp_earned ?? 30;
      const coinsDeducted = existingReview?.xp_deducted ?? 0;
      const distractionCount = triggered_distractions.length;
      const hadNotToDoSelected = not_to_do_selected.length > 0;

      let newCoinsEarned = 30;
      let newCoinsDeducted = 0;
      if (hadNotToDoSelected && distractionCount === 0) {
        newCoinsEarned += 15;
      } else if (distractionCount >= 2) {
        newCoinsDeducted = 5;
      }

      const oldNet = coinsEarned - coinsDeducted;
      const newNet = newCoinsEarned - newCoinsDeducted;
      const diff = newNet - oldNet;

      if (diff !== 0) {
        await earnCoins(diff, 'Focus session review updated');
      }

      if (existingReview) {
        await supabase
          .from('session_reviews')
          .update({
            triggered_distractions,
            xp_earned: newCoinsEarned,
            xp_deducted: newCoinsDeducted,
            completion_note: completion_note ?? existingReview.completion_note,
          })
          .eq('id', existingReview.id);
      } else {
        let taskTitle: string | null = null;
        if (task_id) {
          const { data: t } = await supabase.from('tasks').select('title').eq('id', task_id).single();
          if (t) taskTitle = t.title;
          else {
            const { data: pt } = await supabase.from('pressure_tasks').select('title').eq('id', task_id).single();
            if (pt) taskTitle = pt.title;
          }
        }
        await supabase.from('session_reviews').insert({
          time_block_id: blockId,
          task_title: taskTitle ?? fallbackTaskTitle,
          selected_not_to_dos: not_to_do_selected,
          triggered_distractions,
          xp_earned: newCoinsEarned,
          xp_deducted: newCoinsDeducted,
          completion_note: completion_note ?? null,
          session_duration_seconds: duration ?? null,
        });
      }

      return NextResponse.json({
        success: true,
        coinsEarned: newCoinsEarned,
        coinsDeducted: newCoinsDeducted,
        cleanSession: hadNotToDoSelected && distractionCount === 0,
        message: 'Already completed, review updated',
      });
    }

    const end_time = new Date().toISOString();

    // Mark the block as completed
    const { error: blockError } = await supabase
      .from('time_blocks')
      .update({ end_time, duration, completed: true })
      .eq('id', blockId);

    if (blockError) throw blockError;

    // Increment elapsed_pomodoros on the linked task if mode was pomodoro
    if (task_id) {
      const { data: task } = await supabase
        .from('tasks')
        .select('elapsed_pomodoros, title')
        .eq('id', task_id)
        .single();

      if (task) {
        await supabase
          .from('tasks')
          .update({ elapsed_pomodoros: (task.elapsed_pomodoros ?? 0) + 1 })
          .eq('id', task_id);
      }
    }

    // ── Coin Calculation ────────────────────────────────────────────────────
    // Base: +30 coins for completing a focus session.
    // (session_reviews.xp_earned/xp_deducted columns now hold coin amounts — XP was retired.)
    let coinsEarned = 30;
    let coinsDeducted = 0;

    const distractionCount = triggered_distractions.length;
    const hadNotToDoSelected = not_to_do_selected.length > 0;

    if (hadNotToDoSelected && distractionCount === 0) {
      // Clean session! User committed to not-to-dos and held the line
      coinsEarned += 15;
    } else if (distractionCount >= 2) {
      // Soft deduction — honest reporting is rewarded, but repeated slips are noted
      coinsDeducted = 5;
    }

    await earnCoins(coinsEarned - coinsDeducted, coinsDeducted > 0 ? 'Focus session (distracted)' : 'Focus session');

    // ── Save Session Review ──────────────────────────────────────────────────
    // Fetch task title for the review record
    let taskTitle: string | null = null;
    if (task_id) {
      const { data: t } = await supabase
        .from('tasks')
        .select('title')
        .eq('id', task_id)
        .single();
      if (t) {
        taskTitle = t.title;
      } else {
        const { data: pt } = await supabase
          .from('pressure_tasks')
          .select('title')
          .eq('id', task_id)
          .single();
        if (pt) {
          taskTitle = pt.title;
        }
      }
    }

    taskTitle = taskTitle ?? fallbackTaskTitle;

    await supabase.from('session_reviews').insert({
      time_block_id: blockId,
      task_title: taskTitle,
      selected_not_to_dos: not_to_do_selected,
      triggered_distractions,
      xp_earned: coinsEarned,
      xp_deducted: coinsDeducted,
      completion_note: completion_note ?? null,
      session_duration_seconds: duration ?? null,
    });

    // ── Telegram pomodoro notification (fire-and-forget, non-blocking) ──────
    after(async () => {
      try {
        // Count pomodoros completed today
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(Date.now() + IST_OFFSET_MS);
        const midnightIST = new Date(nowIST);
        midnightIST.setUTCHours(0, 0, 0, 0);
        const todayStart = new Date(midnightIST.getTime() - IST_OFFSET_MS).toISOString();
        const todayEnd = new Date(midnightIST.getTime() + 24 * 60 * 60 * 1000 - IST_OFFSET_MS).toISOString();

        const { data: todayBlocks } = await supabase
          .from('time_blocks')
          .select('id')
          .eq('completed', true)
          .gte('created_at', todayStart)
          .lt('created_at', todayEnd);

        const pomoCount = todayBlocks?.length ?? 1;
        const durationMins = Math.round((duration ?? 25 * 60) / 60);
        const cleanStr = hadNotToDoSelected && distractionCount === 0 ? ' 🏆 _Clean session!_' : '';
        const coinsStr = `+${coinsEarned - coinsDeducted} 🪙`;

        // Fetch next pending task
        const { data: nextTasks } = await supabase
          .from('tasks')
          .select('title')
          .in('status', ['todo', 'in-progress'])
          .is('parent_task_id', null)
          .order('priority', { ascending: false })
          .limit(2);

        const nextTask = nextTasks?.find((t: { title: string }) => t.title !== taskTitle);
        const nextStr = nextTask
          ? `\nNext up → *${nextTask.title}*. Starting now or taking a break?`
          : `\n_No more tasks queued. Take a breath._`;

        const msg = [
          `🍅 *Session complete* — ${durationMins} min${taskTitle ? ` on "${taskTitle}"` : ''}`,
          `That's *${pomoCount} session${pomoCount !== 1 ? 's' : ''}* today. ${coinsStr}${cleanStr}`,
          nextStr,
        ].join('\n');

        notifyTelegram(msg);
      } catch (err) {
        console.error('[Timer] Telegram notification failed:', err);
      }
    });

    // Force the tasks list to re-fetch so the Pomodoro count updates instantly
    return NextResponse.json({ 
      success: true, 
      coinsEarned, 
      coinsDeducted, 
      cleanSession: hadNotToDoSelected && distractionCount === 0 
    });
  } catch (err) {
    console.error('[POST /api/timer/complete]', err);
    return NextResponse.json({ error: 'Failed to complete timer session' }, { status: 500 });
  }
}

