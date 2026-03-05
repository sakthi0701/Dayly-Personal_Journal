import { Memory } from 'mem0ai/oss';

const apiKeyGroq = process.env.GROQ_API_KEY;
const apiKeyGemini = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!apiKeyGroq || !apiKeyGemini || !supabaseUrl || !supabaseKey) {
    console.warn("Mem0 initialization: Missing environment variables.");
}

export const mem0 = new Memory({
    llm: {
        provider: "groq",
        config: {
            model: "llama-3.3-70b-versatile",
            apiKey: apiKeyGroq,
        }
    },
    embedder: {
        provider: "gemini",
        config: {
            // Using the current Gemini embeddings model
            model: "gemini-embedding-001",
            apiKey: apiKeyGemini,
            // CRITICAL: Must match the vectorStore dimension (768 for Gemini).
            // Without this, GoogleEmbedder defaults to 1536 (OpenAI's dimension).
            embeddingDims: 768,
        }
    },
    vectorStore: {
        provider: "supabase",
        config: {
            collectionName: "memories",
            tableName: "memories",
            dimension: 768, // Target dimension for Gemini
            supabaseUrl: supabaseUrl,
            supabaseKey: supabaseKey,
        }
    },
    historyStore: {
        provider: "supabase",
        config: {
            tableName: "history",
            supabaseUrl: supabaseUrl,
            supabaseKey: supabaseKey,
        }
    }
});
