import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addXP } from '@/lib/gamification';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      blockId,
      duration,
      task_id,
      // Phase 13: session review fields (all optional)
      not_to_do_selected = [],   // [{label, emoji}]
      triggered_distractions = [],
      completion_note,
    } = body;

    if (!blockId) {
      return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
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

      let xpEarned = existingReview?.xp_earned ?? 30;
      let xpDeducted = existingReview?.xp_deducted ?? 0;
      const distractionCount = triggered_distractions.length;
      const hadNotToDoSelected = not_to_do_selected.length > 0;

      let newXpEarned = 30;
      let newXpDeducted = 0;
      if (hadNotToDoSelected && distractionCount === 0) {
        newXpEarned += 15;
      } else if (distractionCount >= 2) {
        newXpDeducted = 5;
      }

      const oldNet = xpEarned - xpDeducted;
      const newNet = newXpEarned - newXpDeducted;
      const diff = newNet - oldNet;

      if (diff !== 0) {
        await addXP(diff);
      }

      if (existingReview) {
        await supabase
          .from('session_reviews')
          .update({
            triggered_distractions,
            xp_earned: newXpEarned,
            xp_deducted: newXpDeducted,
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
          task_title: taskTitle,
          selected_not_to_dos: not_to_do_selected,
          triggered_distractions,
          xp_earned: newXpEarned,
          xp_deducted: newXpDeducted,
          completion_note: completion_note ?? null,
          session_duration_seconds: duration ?? null,
        });
      }

      return NextResponse.json({
        success: true,
        xpEarned: newXpEarned,
        xpDeducted: newXpDeducted,
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

    // ── XP Calculation ──────────────────────────────────────────────────────
    // Base: +30 XP for completing a focus session
    let xpEarned = 30;
    let xpDeducted = 0;

    const distractionCount = triggered_distractions.length;
    const hadNotToDoSelected = not_to_do_selected.length > 0;

    if (hadNotToDoSelected && distractionCount === 0) {
      // Clean session! User committed to not-to-dos and held the line
      xpEarned += 15;
    } else if (distractionCount >= 2) {
      // Soft deduction — honest reporting is rewarded, but repeated slips are noted
      xpDeducted = 5;
    }

    await addXP(xpEarned - xpDeducted);

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

    await supabase.from('session_reviews').insert({
      time_block_id: blockId,
      task_title: taskTitle,
      selected_not_to_dos: not_to_do_selected,
      triggered_distractions,
      xp_earned: xpEarned,
      xp_deducted: xpDeducted,
      completion_note: completion_note ?? null,
      session_duration_seconds: duration ?? null,
    });

    // Force the tasks list to re-fetch so the Pomodoro count updates instantly
    return NextResponse.json({ 
      success: true, 
      xpEarned, 
      xpDeducted, 
      cleanSession: hadNotToDoSelected && distractionCount === 0 
    });
  } catch (err) {
    console.error('[POST /api/timer/complete]', err);
    return NextResponse.json({ error: 'Failed to complete timer session' }, { status: 500 });
  }
}

