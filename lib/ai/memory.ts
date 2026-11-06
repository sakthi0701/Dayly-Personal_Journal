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
    // mem0ai v3 renamed `customPrompt` -> `customInstructions`; the old key is silently ignored.
    customInstructions: MEMORY_EXTRACTION_PROMPT,
    // Extraction runs on Gemini, NOT Groq. mem0 v3's built-in extraction prompt is ~8.6k tokens
    // per call, which exceeds Groq's 8k tokens/minute on-demand cap for gpt-oss-120b — every
    // journal ingestion 413'd from the v3 upgrade until this change. Don't move it back to Groq
    // without checking the model's TPM limit against that request size. gemini-3.8-flash (not 2.5-flash):
    // the free tier caps gemini-2.5-flash at 20 requests/day, and Telegram/WhatsApp add per message.
    llm: {
        provider: "gemini",
        config: {
            model: "gemini-3.8-flash",
            apiKey: apiKeyGemini,
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

export const MEM0_USER_ID = 'default_user';

/**
 * Semantic search over the journal memory store, scoped to the single app user.
 *
 * mem0ai v3 contract: search() THROWS if given a top-level `userId`/`limit`, and filters by
 * `metadata.user_id` (snake_case) via JSONB containment. DO NOT revert to the old
 * `{ userId, limit } as any` shape — it threw on every call after the v3 upgrade and every
 * caller silently fell back to "no memories". Rows written before v3 only had `userId`; they
 * were migrated to also carry `user_id` (supabase/mem0_v3_user_id.sql).
 */
export async function searchMemories(query: string, topK: number) {
    // Over-fetch, then drop mem0 v3 "entity" rows (keyword fragments like "band to their waist",
    // payload has `entityType`). mem0's Supabase adapter writes its entity store into the SAME
    // `memories` table (it honours `tableName`, not the `_entities` collectionName), so without
    // this filter fragments crowd real journal facts out of the top results.
    const res = await mem0.search(query, { filters: { user_id: MEM0_USER_ID }, topK: topK * 3 });
    res.results = res.results.filter((r) => !r.metadata?.entityType).slice(0, topK);
    return res;
}

