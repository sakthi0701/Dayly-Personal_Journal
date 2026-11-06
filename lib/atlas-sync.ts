/**
 * lib/atlas-sync.ts
 *
 * One-way mirror of TODAY's Atlas study tasks into Dayly `tasks` (user decision 2026-11-07).
 * Runs from the 07:00 IST cron slot (app/api/cron/tick) and the "Sync from Atlas" button
 * (POST /api/atlas-sync). Needs supabase/atlas_sync.sql applied.
 *
 * Source: GET {ATLAS_URL}/api/export/today with `Authorization: Bearer ATLAS_EXPORT_SECRET`.
 * Dayly never talks to Atlas's database directly; do not swap this for Atlas's service key.
 *
 * Rules:
 *  - Each Atlas task maps to exactly one Dayly task via the UNIQUE `atlas_task_id`.
 *  - An "untouched" mirror (todo, 0 pomodoros, no goal, no subtasks) follows Atlas: it is
 *    updated, or deleted when Atlas no longer schedules it today / already completed it.
 *  - Anything you started, finished, linked or split in Dayly is never edited or deleted.
 *  - Nothing is written back to Atlas; log hours there.
 */

import { supabase } from '@/lib/supabase';

const DEFAULT_ATLAS_URL = 'https://atlas07.vercel.app';
const POMODORO_MINUTES = 25;
const ATLAS_TAG = 'atlas';

interface AtlasTask {
  id: string;
  track: string;
  title: string;
  priority_tier: number;
  status: string;
  allocated_minutes: number;
  completed_minutes: number;
  items: string[];
  notes: string | null;
  links: { label: string; url: string }[];
}

interface AtlasExport {
  date: string;
  tasks: AtlasTask[];
}

export interface AtlasSyncResult {
  date: string;
  added: number;
  updated: number;
  removed: number;
}

async function fetchAtlasToday(): Promise<AtlasExport> {
  const secret = process.env.ATLAS_EXPORT_SECRET?.trim();
  if (!secret) throw new Error('ATLAS_EXPORT_SECRET is not set');
  const base = (process.env.ATLAS_URL?.trim() || DEFAULT_ATLAS_URL).replace(/\/+$/, '');

  const res = await fetch(`${base}/api/export/today`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Atlas export failed: HTTP ${res.status} ${await res.text().catch(() => '')}`.trim());
  return (await res.json()) as AtlasExport;
}

/** Atlas P0/P1 → high, P2 → medium, P3 → none. */
function priorityOf(tier: number): 'high' | 'medium' | 'none' {
  if (tier <= 1) return 'high';
  if (tier === 2) return 'medium';
  return 'none';
}

function notesOf(t: AtlasTask): string | null {
  const parts: string[] = [];
  if (t.items.length) parts.push(`Study: ${t.items.join(', ')}`);
  else if (t.notes) parts.push(t.notes.trim());
  for (const l of t.links) parts.push(`• ${l.label} — ${l.url}`);
  return parts.length ? parts.join('\n') : null;
}

/** The fields Atlas owns on a mirrored task. */
function fieldsOf(t: AtlasTask, date: string) {
  const remaining = Math.max(0, t.allocated_minutes - t.completed_minutes);
  return {
    title: `${t.track} · ${t.title}`,
    notes: notesOf(t),
    priority: priorityOf(t.priority_tier),
    estimated_pomodoros: Math.max(1, Math.ceil(remaining / POMODORO_MINUTES)),
    due_date: date,
  };
}

export async function syncAtlasToday(): Promise<AtlasSyncResult> {
  const { date, tasks } = await fetchAtlasToday();
  const open = new Map(tasks.filter((t) => t.status !== 'COMPLETED').map((t) => [t.id, t]));

  // Untouched mirrors only: these are the rows Atlas is allowed to change or remove.
  const { data: mirrors, error: mirrorErr } = await supabase
    .from('tasks')
    .select('id, atlas_task_id, subtasks:tasks!parent_task_id(id)')
    .not('atlas_task_id', 'is', null)
    .is('parent_task_id', null)
    .is('goal_id', null)
    .eq('status', 'todo')
    .eq('elapsed_pomodoros', 0);
  if (mirrorErr) throw new Error(`Reading Atlas mirrors failed (apply supabase/atlas_sync.sql?): ${mirrorErr.message}`);

  const untouched = (mirrors ?? []).filter((m) => !(m.subtasks as unknown[] | null)?.length);
  const stale = untouched.filter((m) => !open.has(m.atlas_task_id as string));
  const live = untouched.filter((m) => open.has(m.atlas_task_id as string));

  if (stale.length) {
    const { error } = await supabase.from('tasks').delete().in('id', stale.map((m) => m.id));
    if (error) throw new Error(`Removing stale Atlas tasks failed: ${error.message}`);
  }

  const updates = await Promise.all(
    live.map((m) => supabase.from('tasks').update(fieldsOf(open.get(m.atlas_task_id as string)!, date)).eq('id', m.id)),
  );
  const updateErr = updates.find((r) => r.error)?.error;
  if (updateErr) throw new Error(`Updating Atlas tasks failed: ${updateErr.message}`);

  // New ones go to the end of the list. ignoreDuplicates: an Atlas task already mirrored
  // (e.g. one you finished in Dayly) is skipped instead of being re-added. Do not remove.
  const { data: last } = await supabase
    .from('tasks')
    .select('position')
    .is('parent_task_id', null)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (last?.position ?? -1) + 1;

  const known = new Set(live.map((m) => m.atlas_task_id as string));
  const rows = [...open.values()]
    .filter((t) => !known.has(t.id))
    .map((t) => ({ ...fieldsOf(t, date), atlas_task_id: t.id, position: position++ }));

  let added = 0;
  if (rows.length) {
    const { data: inserted, error } = await supabase
      .from('tasks')
      .upsert(rows, { onConflict: 'atlas_task_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`Adding Atlas tasks failed: ${error.message}`);
    added = inserted?.length ?? 0;

    if (added) {
      const { data: tag, error: tagErr } = await supabase
        .from('tags')
        .upsert({ name: ATLAS_TAG }, { onConflict: 'name' })
        .select('id')
        .single();
      if (tagErr) throw new Error(`Creating the "${ATLAS_TAG}" tag failed: ${tagErr.message}`);
      const { error: linkErr } = await supabase
        .from('task_tags')
        .insert(inserted!.map((t) => ({ task_id: t.id, tag_id: tag.id })));
      if (linkErr) throw new Error(`Tagging Atlas tasks failed: ${linkErr.message}`);
    }
  }

  return { date, added, updated: live.length, removed: stale.length };
}
