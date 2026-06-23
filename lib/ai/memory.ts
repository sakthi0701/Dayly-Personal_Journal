import { Memory } from 'mem0ai/oss';

const apiKeyGroq = process.env.GROQ_API_KEY;
const apiKeyGemini = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!apiKeyGroq || !apiKeyGemini || !supabaseUrl || !supabaseKey) {
    console.warn("Mem0 initialization: Missing environment variables.");
}

/**
 * Scopes Mem0's LLM-based fact extraction to behaviorally useful signals only.
 * Prevents trivial facts ("weather is great", "woke up on Sunday") from polluting
 * the vector store and degrading Zoro's context quality.
 *
 * Must return JSON with a 'facts' key — Mem0 requires this format.
 */
const MEMORY_EXTRACTION_PROMPT = `You are extracting behavioral memory from a personal journal entry.

Only extract facts that belong to ONE of these categories:
1. COMMITMENTS — explicit plans, goals, or challenges declared (e.g. "will complete Node JS today", "challenge myself to finish 50% by 5pm")
2. OUTCOMES — whether a past commitment was completed or failed (e.g. "completed JavaScript course", "fell asleep instead of studying", "relapsed on no-fap streak")
3. PATTERNS — recurring behaviors or habits started/broken (e.g. "used Pomodoro technique", "dopamine chain:YouTube reels → hentai → regret → repeat", "gym on Monday Wednesday Saturday")
4. LEARNING GOALS — specific skills or topics being studied (e.g. "learning Node JS from Scrimba", "practicing sliding window algorithm problems")
5. KEY DECISIONS — choices made with clear consequences (e.g. "started meditating daily")

DO NOT extract:
- Weather, time of day, or location
- Pure emotions with no linked action
- Social events with no goal relevance
- Generic observations
- One-off trivial facts

Each extracted fact must be a complete, self-contained sentence that would still make sense weeks later without re-reading the original entry.

You MUST return a valid JSON object with a 'facts' key containing an array of strings.`;

export const mem0 = new Memory({
    customPrompt: MEMORY_EXTRACTION_PROMPT,
    llm: {
        provider: "groq",
        config: {
            model: "openai/gpt-oss-120b",
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

