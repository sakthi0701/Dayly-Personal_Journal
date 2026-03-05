
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mem0 } from '@/lib/ai/memory';
import { generateEmbedding } from '@/lib/embeddings';
import { updateUserStatsOnEntry } from '@/lib/gamification';
import { stripHtml } from '@/lib/utils/text';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { entry_id, content } = body;

        if (!entry_id || !content) {
            return NextResponse.json({ error: 'Missing entry_id or content' }, { status: 400 });
        }

        console.log(`Processing entry ${entry_id}...`);

        // Strip HTML tags to get clean plain text for embedding/memory
        const plainText = stripHtml(content);

        if (!plainText) {
            console.warn(`Entry ${entry_id} has no plain text content after stripping HTML. Skipping embedding.`);
            return NextResponse.json({ success: true });
        }

        // 1. Generate and save embedding to the entries table
        try {
            const embedding = await generateEmbedding(plainText);
            const { error: embeddingError } = await supabase
                .from('entries')
                .update({ embedding })
                .eq('id', entry_id);

            if (embeddingError) {
                console.error('Failed to update embedding on entries table:', embeddingError);
            } else {
                console.log(`Embedding saved for entry ${entry_id}.`);
            }
        } catch (e) {
            console.error('Embedding generation failed:', e);
        }

        // 2. Add clean plain text to Mem0 Memory Store
        try {
            await mem0.add(plainText, { userId: 'default_user', metadata: { entry_id } });
            console.log(`Memory stored for entry ${entry_id}.`);
        } catch (e) {
            console.error('Mem0 add failed:', e);
        }

        console.log(`Entry ${entry_id} processed successfully.`);

        // 3. Update Statistics (Streaks/XP)
        await updateUserStatsOnEntry();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Processing error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
