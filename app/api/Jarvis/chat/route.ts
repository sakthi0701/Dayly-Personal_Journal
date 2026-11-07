import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { searchMemories } from '@/lib/ai/memory';
import { generateAdvice } from '@/lib/ai/groq';
import { getUserStats } from '@/lib/gamification';
import { buildExecutionSummary } from '@/lib/stats/execution';
import { normalizeTimeZone } from '@/lib/utils/day';
import { EVIDENCE_MIN_SCORE, formatSourceDate, toMemorySources } from '@/lib/ai/memorySources';

/**
 * POST /api/Jarvis/chat
 *
 * Body: { threadId?: string, message: string, tz?: string (IANA zone for 'today') }
 *
 * Two-state AI logic:
 *   - If `message` is provided → treated as the user's question (Q&A mode)
 *   - The AI autonomously picks the most critical insight angle when no question is sent
 *
 * Layered context strategy:
 *   1. User's current message
 *   2. Last 10 messages from current thread
 *   3. Mem0 journal memory retrieval (semantic)
 *   4. 7-day execution data (tasks, habits, time_blocks, goals)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message } = body;
    let { threadId } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // ── 1. Resolve or create thread ───────────────────────────────────────────
    if (!threadId) {
      const titlePreview = message.trim().slice(0, 60);
      const { data: newThread, error: threadErr } = await supabase
        .from('sensei_threads')
        .insert({ title: titlePreview })
        .select()
        .single();
      if (threadErr) throw threadErr;
      threadId = newThread.id;
    } else {
      // Update thread timestamp
      await supabase
        .from('sensei_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', threadId);
    }

    // ── 2. Persist user message ────────────────────────────────────────────────
    await supabase.from('sensei_messages').insert({
      thread_id: threadId,
      role: 'user',
      content: message.trim(),
    });

    // ── 3. Fetch recent thread context (last 10 messages) ─────────────────────
    const { data: recentMessages } = await supabase
      .from('sensei_messages')
      .select('role, content, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(10);

    const threadContext = (recentMessages ?? [])
      .reverse()
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');

    // ── 4. Parallel: journal memories + execution data (shared builder, user's local day) ──
    const timeZone = normalizeTimeZone(body.tz);
    const [memResults, stats, executionData] = await Promise.all([
      searchMemories(message, 6).catch((e) => { console.error('[Jarvis chat] mem0 search failed:', e); return null; }),
      getUserStats(),
      buildExecutionSummary(timeZone),
    ]);
    const memorySources = await toMemorySources(memResults?.results ?? [], timeZone);

    // ── 6. Build augmented question with thread context ───────────────────────
    const augmentedQuestion = threadContext
      ? `[Recent conversation context]\n${threadContext}\n\n[New question]\n${message}`
      : message;

    // ── 7. Journal memories, dated so the model can cite which entry it used ──
    const safeEntries = memorySources.map((m) => ({ content: `[journal entry ${formatSourceDate(m.date)}] ${m.fact}` }));
    // What the UI shows as "Jarvis remembered" — on-topic facts only, one per entry
    const sources = memorySources
      .filter((m) => m.score >= EVIDENCE_MIN_SCORE)
      .filter((m, i, all) => all.findIndex((x) => x.entryId === m.entryId) === i);

    // ── 8. Generate response (two-state: Q&A vs Autonomous Insight) ───────────
    const advice = await generateAdvice(
      safeEntries,
      augmentedQuestion,
      stats ?? undefined,
      executionData,
    );

    // ── 9. Persist assistant message ───────────────────────────────────────────
    await supabase.from('sensei_messages').insert({
      thread_id: threadId,
      role: 'assistant',
      content: advice,
      metadata: { executionSummary: executionData, sources },
    });

    // Update thread last_message_at
    await supabase
      .from('sensei_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId);

    return NextResponse.json({ advice, threadId, executionData, sources });
  } catch (err) {
    console.error('[POST /api/Jarvis/chat]', err);
    return NextResponse.json({ error: 'Failed to generate Jarvis response' }, { status: 500 });
  }
}
