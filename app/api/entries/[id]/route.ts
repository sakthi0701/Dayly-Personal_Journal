import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mem0 } from '@/lib/ai/memory';
import { generateEmbedding } from '@/lib/embeddings';
import { stripHtml } from '@/lib/utils/text';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data: entry, error } = await supabase
            .from('entries')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !entry) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        return NextResponse.json({ entry });
    } catch (error) {
        console.error('Error fetching entry:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { content, mood, image_url } = body;

        if (!content) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        console.log(`Updating entry ${id}...`);

        // 0. Verify existence
        const { data: existing, error: fetchErr } = await supabase
            .from('entries')
            .select('id')
            .eq('id', id)
            .single();

        if (fetchErr || !existing) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        // 1. Update the Supabase entries table (content + metadata, embedding updated below)
        const { error: updateError } = await supabase
            .from('entries')
            .update({ content, mood, image_url })
            .eq('id', id);

        if (updateError) {
            console.error('Supabase update error:', updateError);
            return NextResponse.json({ error: 'Failed to update entry metadata' }, { status: 500 });
        }

        // 2, 3 & 4. Vector + Memory Operations (Non-blocking background task)
        (async () => {
            // Strip HTML to get clean plain text for embedding and memory
            const plainText = stripHtml(content);

            if (!plainText) {
                console.warn(`Entry ${id} has no plain text after stripping HTML. Skipping vector update.`);
                return;
            }

            // 2a. Regenerate and save embedding directly to the entries table
            try {
                const embedding = await generateEmbedding(plainText);
                const { error: embeddingError } = await supabase
                    .from('entries')
                    .update({ embedding })
                    .eq('id', id);

                if (embeddingError) {
                    console.error('Failed to update embedding on entries table:', embeddingError);
                } else {
                    console.log(`Embedding updated for entry ${id}.`);
                }
            } catch (e) {
                console.error('Embedding generation failed:', e);
            }

            // 2b. Delete old mem0 memory chunks for this entry
            let memoryDeleted = false;
            try {
                const { error: deleteError } = await supabase
                    .from('memories')
                    .delete()
                    .contains('metadata', { entry_id: id });

                if (deleteError) {
                    console.error('Background memory deletion failed:', deleteError);
                } else {
                    memoryDeleted = true;
                }
            } catch (e) {
                console.error('Background memory deletion exception:', e);
            }

            // 3. Re-add clean plain text to mem0
            if (memoryDeleted) {
                try {
                    await mem0.add(plainText, { userId: 'default_user', metadata: { entry_id: id } });
                    console.log(`Memory updated for entry ${id}.`);
                } catch (e) {
                    console.error('Background memory update exception:', e);
                }
            }
        })();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Processing error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
