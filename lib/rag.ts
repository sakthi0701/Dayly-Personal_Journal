import { supabase } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/embeddings';

export async function findRelevantEntries(query: string) {
    try {
        // 1. Generate Query Embedding
        const query_embedding = await generateEmbedding(query);

        // 2. Call Supabase RPC
        const { data, error } = await supabase.rpc('match_documents', {
            query_embedding,
            match_threshold: 0.1, // Adjust as needed
            match_count: 5
        });

        if (error) {
            console.error('RAG Error:', error);
            return [];
        }

        return data;

    } catch (err) {
        console.error('Unexpected RAG Error:', err);
        return [];
    }
}
