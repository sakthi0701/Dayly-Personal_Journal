import { NextResponse } from 'next/server';
import { mem0 } from '@/lib/ai/memory';
import { generateGoDeeperQuestion } from '@/lib/ai/groq';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const content = body.content || '';

        console.log(`[Go Deeper API] Analyzing draft of length ${content.length}`);

        // 1. Fetch relevant past memories using Mem0
        // Search Mem0 for related semantic memories
        const searchResults = await mem0.search(content || "general reflections on life", { userId: 'default_user', limit: 10 });

        // Mem0 search result structure is different from our old RAG result
        // We need to map it to { content: string } format that `generateGoDeeperQuestion` expects
        const safeEntries = searchResults?.results && searchResults.results.length > 0
            ? searchResults.results.map(res => ({ content: res.memory }))
            : [];

        console.log(`[Go Deeper API] Found ${safeEntries.length} relevant past entries. Generating question...`);

        // 2. Generate the thought-provoking question
        const question = await generateGoDeeperQuestion(content, safeEntries);

        return NextResponse.json({ question });
    } catch (error) {
        console.error("Go Deeper API Error:", error);
        const errMessage = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : '';
        return NextResponse.json({ error: "Failed to generate a question", details: errMessage, stack: errStack }, { status: 500 });
    }
}
