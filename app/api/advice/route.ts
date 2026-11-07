import { NextResponse } from 'next/server';
import { searchMemories } from '@/lib/ai/memory';
import { generateAdvice } from '@/lib/ai/groq';
import { getUserStats } from '@/lib/gamification';
import { buildExecutionSummary } from '@/lib/stats/execution';
import { normalizeTimeZone } from '@/lib/utils/day';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'General';
    const question = body.question;

    // --- Determine Mem0 embedding query based on mode ---
    let query = 'life progress habits goals struggles';
    if (question && question.trim() !== '') {
      query = question;
    } else if (mode === 'Pattern') {
      query = 'repeated behavior habits loop stuck same situation';
    } else if (mode === 'Momentum') {
      query = 'progress working improving growth discipline success';
    } else if (mode === 'Jarvis') {
      query = 'avoidance procrastination goals discipline execution failure';
    } else if (mode === 'Task-Audit') {
      query = 'task avoidance ignore delay incomplete important work';
    }

    console.log(`[Advice Engine] Mode: ${mode}, Query: "${query}"`);

    // --- Mem0 + stats + execution data (shared builder, user's local day) ---
    const [memResults, stats, executionData] = await Promise.all([
      searchMemories(query, 10),
      getUserStats(),
      buildExecutionSummary(normalizeTimeZone(body.tz)),
    ]);

    // --- Journal memories from Mem0 ---
    const safeEntries =
      memResults?.results && memResults.results.length > 0
        ? memResults.results.map((res) => ({ content: res.memory }))
        : [];

    if (safeEntries.length === 0 && !question && mode === 'General') {
      return NextResponse.json({
        advice:
          'Not enough journal data yet. Write a few more entries so I can find meaningful patterns and give you useful insights.',
      });
    }

    console.log(
      `[Advice Engine] Found ${safeEntries.length} journal memories. Execution data assembled. Connecting to LLM...`
    );

    const advice = await generateAdvice(safeEntries, question, stats ?? undefined, executionData);

    return NextResponse.json({ advice, executionData });
  } catch (error) {
    console.error('Advice API Error:', error);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}
