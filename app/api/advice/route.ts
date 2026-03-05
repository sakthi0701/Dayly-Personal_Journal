
import { NextResponse } from 'next/server';
import { mem0 } from '@/lib/ai/memory';
import { generateAdvice } from '@/lib/ai/groq';

import { getUserStats } from '@/lib/gamification';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const mode = body.mode || 'General';
        const question = body.question;

        // Fetch stats to pass to AI
        const stats = await getUserStats();

        // Determine embedding search query based on mode
        let query = "life progress habits goals struggles";
        if (question && question.trim() !== '') {
            query = question;
        } else if (mode === 'Pattern') {
            query = "repeated behavior habits loop stuck same situation";
        } else if (mode === 'Momentum') {
            query = "progress working improving growth discipline success";
        }

        console.log(`[Advice Engine] Mode: ${mode}, Query: "${query}"`);

        // Search Mem0 for memory facts related to the query
        const searchResults = await mem0.search(query, { userId: 'default_user', limit: 10 });

        const safeEntries = searchResults?.results && searchResults.results.length > 0
            ? searchResults.results.map(res => ({ content: res.memory }))
            : [];
        if (safeEntries.length === 0 && !question) {
            // Provide fallback if we have *no* entries and no specific question
            return NextResponse.json({
                advice: "Not enough journal data yet. Write a few more entries so I can find meaningful patterns and give you useful insights."
            });
        }

        console.log(`[Advice Engine] Found ${safeEntries.length} entries. Connecting...`);
        const advice = await generateAdvice(safeEntries, mode, question, stats);

        return NextResponse.json({ advice });
    } catch (error) {
        console.error("Advice API Error:", error);
        return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 });
    }
}
