import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mem0 } from '@/lib/ai/memory';
import { generateEmbedding } from '@/lib/embeddings';
import { generateGoDeeperQuestion } from '@/lib/ai/groq';
import { updateUserStatsOnEntry } from '@/lib/gamification';
import { stripHtml } from '@/lib/utils/text';

/**
 * POST /api/whatsapp
 *
 * Receives a journal message from the local WhatsApp bot bridge.
 * All messages sent in the same IST calendar day are appended to ONE entry.
 * Context passed to Zoro includes explicit relative dates so it always knows
 * WHEN past memories happened (e.g. "2 weeks ago" vs "Yesterday").
 *
 * Single-user MVP: auth via shared secret (WHATSAPP_BOT_SECRET).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, secret } = body as { message?: string; secret?: string };

    // ── 1. Security ───────────────────────────────────────────────────────────
    if (!process.env.WHATSAPP_BOT_SECRET) {
      console.error('[WhatsApp] WHATSAPP_BOT_SECRET is not configured.');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    if (secret !== process.env.WHATSAPP_BOT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Input validation ───────────────────────────────────────────────────
    const cleanMessage = message?.trim() ?? '';
    if (!cleanMessage) {
      return NextResponse.json({ error: 'Empty message' }, { status: 400 });
    }

    console.log(`[WhatsApp] Received: "${cleanMessage.substring(0, 60)}"`);

    // ── 3. Compute today's IST window in UTC ──────────────────────────────────
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);

    const todayMidnightIST = new Date(nowIST);
    todayMidnightIST.setUTCHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayMidnightIST.getTime() - IST_OFFSET_MS);
    const tomorrowUTC = new Date(todayMidnightIST.getTime() + 24 * 60 * 60 * 1000 - IST_OFFSET_MS);

    // ── 4. Find today's WhatsApp entry (non-HTML plain text) ──────────────────
    const { data: todayEntries } = await supabase
      .from('entries')
      .select('id, content')
      .gte('created_at', todayStartUTC.toISOString())
      .lt('created_at', tomorrowUTC.toISOString())
      .order('created_at', { ascending: true });

    const existingEntry = (todayEntries ?? []).find(
      (e) => e.content && !e.content.trimStart().startsWith('<')
    ) ?? null;

    // ── 5. Format the new message with an IST timestamp ───────────────────────
    // Use new Date() (UTC) + timeZone option — do NOT manually add IST_OFFSET_MS
    // here, or toLocaleTimeString would double-shift by +11h.
    const timeIST = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });

    let entryId: string;
    let fullContent: string;

    if (existingEntry) {
      fullContent = `${existingEntry.content}\n\n${timeIST} · ${cleanMessage}`;

      const { error: updateError } = await supabase
        .from('entries')
        .update({ content: fullContent })
        .eq('id', existingEntry.id);

      if (updateError) throw new Error(`DB update failed: ${updateError.message}`);

      entryId = existingEntry.id;
      console.log(`[WhatsApp] Appended to entry ${entryId} (${fullContent.length} chars total)`);
    } else {
      fullContent = `${timeIST} · ${cleanMessage}`;

      const { data: newEntry, error: insertError } = await supabase
        .from('entries')
        .insert({ content: fullContent, created_at: new Date().toISOString() })
        .select('id')
        .single();

      if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

      entryId = newEntry.id;
      console.log(`[WhatsApp] Created new entry ${entryId} for today`);

      try { await updateUserStatsOnEntry(); } catch (e) {
        console.error('[WhatsApp] Stats update failed:', e);
      }
    }

    // ── 6. Background: re-embed + sync Mem0 ──────────────────────────────────
    (async () => {
      try {
        const embedding = await generateEmbedding(fullContent);
        await supabase.from('entries').update({ embedding }).eq('id', entryId);
        console.log(`[WhatsApp] Embedding updated for entry ${entryId}`);
      } catch (e) { console.error('[WhatsApp] Embedding failed:', e); }

      try {
        await mem0.add(cleanMessage, { userId: 'default_user', metadata: { entry_id: entryId } });
        console.log(`[WhatsApp] Memory stored for entry ${entryId}`);
      } catch (e) { console.error('[WhatsApp] Mem0 add failed:', e); }
    })();

    // ── 7. Build DATED context for Zoro ───────────────────────────────────────
    // Pull real Supabase entries (last 30 days) with created_at timestamps.
    // This is the source of truth for WHEN things happened.
    // mem0 is used for semantic relevance; Supabase gives us accurate dates.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentEntries } = await supabase
      .from('entries')
      .select('content, created_at')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    // Build dated context — this is what Zoro actually reads
    const datedContext: { content: string; date: string }[] = (recentEntries ?? [])
      .map((e) => ({
        content: e.content?.trimStart().startsWith('<')
          ? stripHtml(e.content)   // strip Tiptap HTML from app journal entries
          : (e.content ?? ''),     // WhatsApp entries are already plain text
        date: toRelativeDate(e.created_at),
      }))
      .filter((e) => e.content.trim().length > 10)  // skip near-empty entries
      .slice(0, 15);  // cap at 15 for prompt size

    console.log(`[WhatsApp] Built dated context with ${datedContext.length} entries. Generating Go Deeper...`);

    // ── 8. Generate Zoro's Go Deeper question ──────────────────────────────────
    // Zoro receives fullContent (the whole day's thread) + dated past entries
    const question = await generateGoDeeperQuestion(fullContent, datedContext);

    console.log('[WhatsApp] Zoro replied. Sending to bot.');
    return NextResponse.json({ reply: question });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[WhatsApp] Unhandled error:', error);
    return NextResponse.json({ error: `Internal Server Error: ${msg}` }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts an ISO timestamp to a human-readable relative date string.
 * Uses IST for the "today" boundary so day-breaks are user-aligned.
 */
function toRelativeDate(isoString: string): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

  const entryDateIST = new Date(new Date(isoString).getTime() + IST_OFFSET_MS);
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);

  // Compare calendar dates in IST
  const entryDay = new Date(entryDateIST);
  entryDay.setUTCHours(0, 0, 0, 0);

  const todayDay = new Date(nowIST);
  todayDay.setUTCHours(0, 0, 0, 0);

  const diffDays = Math.round((todayDay.getTime() - entryDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 10) return '1 week ago';
  if (diffDays < 17) return '2 weeks ago';
  if (diffDays < 24) return '3 weeks ago';
  if (diffDays < 45) return '1 month ago';
  return `${Math.floor(diffDays / 30)} months ago`;
}
