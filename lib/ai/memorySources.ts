/**
 * Turns mem0 search hits into dated, verifiable sources: which journal entry each fact came
 * from and that entry's local date. Used to (a) give the model dated facts it can cite and
 * (b) show "Sensei remembered: <date>" under answers so the user can check the evidence.
 */
import { supabase } from '@/lib/supabase';
import { localDateStr } from '@/lib/utils/day';
export { formatDayLabel as formatSourceDate } from '@/lib/utils/day';

export interface MemorySource {
  entryId: string;
  date: string;   // entry's local YYYY-MM-DD
  fact: string;
  score: number;
}

/**
 * Minimum mem0 similarity for a fact to be shown as evidence. Every retrieved fact still goes
 * to the model; this only decides what the UI claims Sensei "remembered". Tuned on this
 * journal: on-topic facts score ≥ ~0.6, off-topic retrievals (e.g. for "hi") score lower.
 */
export const EVIDENCE_MIN_SCORE = 0.6;

export async function toMemorySources(
  results: { memory: string; score?: number; metadata?: Record<string, unknown> }[],
  timeZone: string,
): Promise<MemorySource[]> {
  const ids = [...new Set(results.map((r) => r.metadata?.entry_id).filter((x): x is string => typeof x === 'string'))];
  if (!ids.length) return [];
  const { data } = await supabase.from('entries').select('id, created_at').in('id', ids);
  const created = new Map((data ?? []).map((e) => [e.id as string, e.created_at as string]));

  const sources: MemorySource[] = [];
  for (const r of results) {
    const entryId = r.metadata?.entry_id;
    if (typeof entryId !== 'string' || !created.has(entryId)) continue; // entry deleted
    sources.push({ entryId, date: localDateStr(new Date(created.get(entryId)!), timeZone), fact: r.memory, score: r.score ?? 0 });
  }
  return sources;
}

/** Facts from journal entries written in the last `days` days, newest first (no search). */
export async function recentMemorySources(days: number, timeZone: string, limit = 6): Promise<MemorySource[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('memories')
    .select('metadata, created_at')
    .gte('created_at', since)
    // Filter in the DB: mem0 entity fragments (no entry_id) are the newest rows and would
    // otherwise fill the window before any real journal fact.
    .not('metadata->>entry_id', 'is', null)
    .is('metadata->>entityType', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? [])
    .map((r) => r.metadata as { data?: string; entry_id?: string; entityType?: string } | null)
    .filter((m): m is { data: string; entry_id: string } => !!m?.data && !!m.entry_id && !m.entityType);
  return toMemorySources(rows.map((m) => ({ memory: m.data, score: 1, metadata: { entry_id: m.entry_id } })), timeZone);
}
