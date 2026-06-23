import { NextResponse } from 'next/server';
import { mem0 } from '@/lib/ai/memory';
import { supabase } from '@/lib/supabase';
import { generateGoDeeperQuestion } from '@/lib/ai/groq';
import { toRelativeDate } from '@/lib/utils/date';
import { stripHtml } from '@/lib/utils/text';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const content = body.content || '';

        console.log(`[Go Deeper API] Analyzing draft of length ${content.length}`);

        // ── Layer 1: Semantic memories from Mem0 ─────────────────────────────
        // Retrieve past behavioral patterns relevant to what the user is currently writing.
        // Filter out Today (already the current draft) and Future (edited entries with future timestamps).
        type ContextEntry = { content: string; date: string };
        let semanticEntries: ContextEntry[] = [];
        try {
            const searchResults = await mem0.search(
                content || 'general reflections on life',
                { userId: 'default_user', limit: 12 }
            );
            if (searchResults?.results?.length > 0) {
                semanticEntries = searchResults.results
                    .map(res => ({
                        content: res.memory as string,
                        date: toRelativeDate(res.createdAt),
                    }))
                    .filter(e => e.date !== 'Today' && e.date !== 'Future' && e.content.trim().length > 10);
            }
        } catch (e) {
            console.error('[Go Deeper API] mem0 search failed:', e);
        }

        // ── Layer 2: Last 2 days from Supabase ───────────────────────────────
        // Guaranteed chronological anchor — ensures very recent entries (yesterday, 2 days ago)
        // are always included even if mem0 doesn't surface them semantically.
        // Today's entry is already the current draft, so we start from yesterday.
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(Date.now() + IST_OFFSET_MS);
        const todayMidnightIST = new Date(nowIST);
        todayMidnightIST.setUTCHours(0, 0, 0, 0);
        const todayStartUTC = new Date(todayMidnightIST.getTime() - IST_OFFSET_MS);

        let recentEntries: ContextEntry[] = [];
        const { data: rawRecent } = await supabase
            .from('entries')
            .select('content, created_at')
            .gte('created_at', twoDaysAgo)
            .lt('created_at', todayStartUTC.toISOString()) // exclude today
            .order('created_at', { ascending: false })
            .limit(6);

        if (rawRecent?.length) {
            recentEntries = rawRecent
                .map(e => ({
                    content: e.content?.trimStart().startsWith('<')
                        ? stripHtml(e.content)
                        : (e.content ?? ''),
                    date: toRelativeDate(e.created_at),
                }))
                .filter(e => e.date !== 'Today' && e.date !== 'Future' && e.content.trim().length > 10);
        }

        // ── Merge: recent entries first (chronological anchor), then semantic ─
        // Deduplicate by content so a recent entry that also appears in mem0 isn't repeated.
        const seenContent = new Set(recentEntries.map(e => e.content));
        const deduplicatedSemantic = semanticEntries.filter(e => !seenContent.has(e.content));
        const combinedContext = [...recentEntries, ...deduplicatedSemantic].slice(0, 15);

        console.log(
            `[Go Deeper API] Context: ${recentEntries.length} recent + ${deduplicatedSemantic.length} semantic = ${combinedContext.length} total entries`
        );

        // ── Generate the question ─────────────────────────────────────────────
        const question = await generateGoDeeperQuestion(content, combinedContext);

        return NextResponse.json({ question });
    } catch (error) {
        console.error("Go Deeper API Error:", error);
        const errMessage = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : '';
        return NextResponse.json({ error: "Failed to generate a question", details: errMessage, stack: errStack }, { status: 500 });
    }
}
