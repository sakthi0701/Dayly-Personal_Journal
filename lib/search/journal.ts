/**
 * Hybrid journal search — server only.
 *
 * Three ranked lists fused with Reciprocal Rank Fusion (RRF):
 *   1. keyword  — query terms (light stemming), weighted by rarity (IDF) across the journal
 *   2. memory   — mem0 facts mapped back to their entry; carries the fact as the "why"
 *   3. semantic — whole-entry Gemini embeddings (entries.embedding via match_documents RPC)
 *
 * Why hybrid and not embeddings alone: whole-entry embeddings of long, multi-topic entries score
 * in a narrow band (~0.50–0.63), so an entry that mentions "procrastination" once ranked 48/58
 * for "times I felt like procrastinating". Keyword + fact-level memory recover those hits.
 */
import { supabase } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/embeddings';
import { searchMemories } from '@/lib/ai/memory';
import { stripHtml } from '@/lib/utils/text';

export type MatchReason =
  | { kind: 'keyword'; terms: string[] }
  | { kind: 'memory'; fact: string }
  | { kind: 'semantic' };

export interface JournalHit {
  id: string;
  created_at: string;
  content: string;
  mood?: string | null;
  image_url?: string | null;
  reasons: MatchReason[];
}

const RRF_K = 60;
const LIST_DEPTH = 15;
const MEMORY_REASON_DEPTH = 3;

// Words that carry no search intent in a natural-language journal query.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'how',
  'that', 'this', 'with', 'about', 'have', 'had', 'has', 'been', 'from', 'into', 'just', 'like',
  'felt', 'feel', 'feeling', 'time', 'times', 'did', 'does', 'doing', 'day', 'days', 'my', 'me',
  'you', 'your', 'they', 'them', 'their', 'there', 'then', 'than', 'some', 'any', 'all', 'can',
  'could', 'would', 'should', 'will', 'not', 'but', 'out', 'get', 'got', 'really', 'thing', 'things',
  'entry', 'entries', 'wrote', 'write', 'journal',
]);

/** Crude suffix stripping so "procrastinating" also matches "procrastination". */
function stem(word: string): string {
  for (const suffix of ['ations', 'ation', 'ings', 'ing', 'edly', 'ed', 'es', 'ly', 's']) {
    if (word.length - suffix.length >= 4 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  // "procrastinate" → "procrastinat" so it also matches "procrastination"/"procrastinating"
  return word.length >= 6 && word.endsWith('e') ? word.slice(0, -1) : word;
}

/** Stemmed terms to match on, each with the word the user typed (shown in the "why" chip). */
function queryTerms(q: string): { stem: string; word: string }[] {
  const words = q.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const terms = new Map<string, string>();
  for (const w of words) if (w.length >= 3 && !STOPWORDS.has(w) && !terms.has(stem(w))) terms.set(stem(w), w);
  return [...terms].map(([s, word]) => ({ stem: s, word }));
}

export async function searchJournal(query: string, limit = 10): Promise<JournalHit[]> {
  const q = query.trim();
  if (!q) return [];

  const [entriesRes, memRes, semRes] = await Promise.all([
    supabase.from('entries').select('id, created_at, content, mood, image_url'),
    searchMemories(q, LIST_DEPTH).catch((e) => { console.error('[journal search] mem0 failed:', e); return null; }),
    generateEmbedding(q)
      .then((query_embedding) => supabase.rpc('match_documents', { query_embedding, match_threshold: 0, match_count: LIST_DEPTH }))
      .catch((e) => { console.error('[journal search] embedding failed:', e); return null; }),
  ]);

  const entries = entriesRes.data ?? [];
  const byId = new Map(entries.map((e) => [e.id as string, e]));
  const scores = new Map<string, number>();
  const reasons = new Map<string, MatchReason[]>();
  const add = (id: string, rank: number, reason: MatchReason | null) => {
    if (!byId.has(id)) return; // memory/vector rows for deleted entries
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
    if (reason) reasons.set(id, [...(reasons.get(id) ?? []), reason]);
  };

  // 1. Keyword list, IDF-weighted so "procrastinat" outweighs common words
  const terms = queryTerms(q);
  const fullMatch = new Set<string>(); // entries containing every query term
  if (terms.length) {
    const texts = entries.map((e) => ({ id: e.id as string, text: stripHtml(e.content ?? '').toLowerCase() }));
    const idf = new Map(terms.map((t) => {
      const df = texts.filter((x) => x.text.includes(t.stem)).length;
      return [t.stem, df === 0 ? 0 : Math.log(1 + texts.length / df)];
    }));
    texts
      .map((x) => {
        const hit = terms.filter((t) => x.text.includes(t.stem));
        return { id: x.id, hit, score: hit.reduce((s, t) => s + (idf.get(t.stem) ?? 0), 0) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, LIST_DEPTH)
      .forEach((x, i) => {
        add(x.id, i + 1, { kind: 'keyword', terms: x.hit.map((t) => t.word) });
        if (x.hit.length === terms.length) fullMatch.add(x.id);
      });
  }

  // 2. Memory list — first (best) fact per entry
  const seen = new Set<string>();
  let memRank = 0;
  for (const m of memRes?.results ?? []) {
    const entryId = m.metadata?.entry_id as string | undefined;
    if (!entryId || seen.has(entryId)) continue;
    seen.add(entryId);
    memRank++;
    // Every hit counts toward ranking, but only the top facts are shown as the "why": deeper
    // facts are often unrelated to the query (e.g. an "agent builder" fact for "procrastinating").
    add(entryId, memRank, memRank <= MEMORY_REASON_DEPTH ? { kind: 'memory', fact: m.memory } : null);
  }

  // 3. Semantic list
  ((semRes?.data ?? []) as { id: string }[]).forEach((d, i) => add(d.id, i + 1, { kind: 'semantic' }));

  // Entries that literally contain every search term come first (what someone typing a word
  // expects); fused score orders within each group.
  return [...scores.entries()]
    .sort((a, b) => Number(fullMatch.has(b[0])) - Number(fullMatch.has(a[0])) || b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => {
      const e = byId.get(id)!;
      return { id, created_at: e.created_at, content: e.content, mood: e.mood, image_url: e.image_url, reasons: reasons.get(id) ?? [] };
    });
}
