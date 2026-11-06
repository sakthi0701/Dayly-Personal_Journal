/**
 * POST /api/voice/tool
 *
 * Body: { id: string, name: string, args: object }
 * Runs one Gemini Live tool call through the same executor the Telegram agent uses.
 */

import { NextResponse, after } from 'next/server';
import { executeTools } from '@/lib/telegram-agent/executor';
import { appendToTodayJournal, processJournalBackground } from '@/lib/telegram-agent/pipeline';
import type { ToolName } from '@/lib/telegram-agent/tools';
import { VOICE_AGENT_TOOLS } from '@/lib/voice/constants';

export async function POST(request: Request) {
  const { id, name, args } = await request.json().catch(() => ({}));

  // Allowlist: the voice call may only run the tools it was given — never timer tools etc.
  if (typeof name !== 'string' || !(VOICE_AGENT_TOOLS as readonly string[]).includes(name)) {
    return NextResponse.json({ error: `Tool not allowed: ${name}` }, { status: 400 });
  }

  // executeTools() only echoes log_journal back (Telegram's pipeline does the saving), so
  // the voice call saves it here — same entry, same background embedding + Mem0 as Telegram.
  if (name === 'log_journal') {
    const content = typeof args?.content === 'string' ? args.content.trim() : '';
    if (!content) return NextResponse.json({ success: false, summary: 'Nothing to save — the journal text was empty.' });
    try {
      const { entryId } = await appendToTodayJournal(content);
      after(() => processJournalBackground(entryId, content));
      const preview = content.length > 70 ? `${content.slice(0, 70)}…` : content;
      return NextResponse.json({ success: true, summary: `Saved to today's journal: "${preview}"` });
    } catch (err) {
      console.error('[Voice] Journal save failed:', err);
      return NextResponse.json({ success: false, summary: 'Journal save failed.' });
    }
  }

  const [result] = await executeTools([
    { id: String(id ?? 'voice'), function: { name: name as ToolName, arguments: JSON.stringify(args ?? {}) } },
  ]);

  return NextResponse.json({ success: result.success, summary: result.summary });
}
