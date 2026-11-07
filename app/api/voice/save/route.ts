/**
 * POST /api/voice/save
 *
 * Body: { durationSec: number, lines: { role: 'user' | 'Jarvis' | 'action', text: string }[] }
 *
 * Stores ONE condensed recap of the call in telegram_messages, so the next Telegram
 * check-in can follow up on what was promised on the call.
 * Deliberately one row, not one per turn: saveHistory keeps only the last 50 rows and
 * loadHistory reads the last 6 — per-turn rows would wipe out the Telegram context.
 */

import { NextResponse } from 'next/server';
import { saveHistory } from '@/lib/telegram-agent/pipeline';

const MAX_CHARS = 1500;

export async function POST(request: Request) {
  const { durationSec, lines } = await request.json().catch(() => ({}));
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ saved: false });
  }

  const label = { user: 'Them', Jarvis: 'You', action: 'Done' } as Record<string, string>;
  const body = lines
    .filter((l) => typeof l?.text === 'string' && l.text.trim() && label[l.role])
    .map((l) => `${label[l.role]}: ${l.text.trim()}`)
    .join('\n');

  const mins = Math.max(1, Math.round((Number(durationSec) || 0) / 60));
  const header = `[Voice check-in call, ~${mins} min]\n`;
  // Keep the END of long calls: that's where commitments and saved updates are.
  // (Cutting the tail dropped "mark it done + journal" from a real 3-min call.)
  const room = MAX_CHARS - header.length;
  const recap = header + (body.length > room ? `…${body.slice(-(room - 1))}` : body);

  try {
    await saveHistory('assistant', recap);
    return NextResponse.json({ saved: true });
  } catch (err) {
    console.error('[Voice] Save failed:', err);
    return NextResponse.json({ saved: false }, { status: 500 });
  }
}
