/**
 * app/api/telegram/route.ts
 *
 * Telegram webhook entry point — intentionally thin.
 * All AI logic lives in lib/telegram-agent/.
 *
 * Flow:
 *   1. Parse update
 *   2. Idempotency check (drop Telegram retries)
 *   3. Auth guard (only respond to owner's chat)
 *   4. Voice? → Whisper transcription
 *   5. Load pipeline context + run agent
 *   6. Send reply to Telegram
 *   7. after() → save history, background embedding (non-blocking)
 */

import { NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { transcribeAudio } from '@/lib/ai/groq';
import { sendTelegramMessage } from '@/lib/telegram';
import { runAgentPipeline, saveHistory, processJournalBackground } from '@/lib/telegram-agent/pipeline';

export const dynamic = 'force-dynamic';
// Extend function timeout for LLM calls (Vercel Pro: up to 300s; Hobby: 60s)
export const maxDuration = 60;

// ─── Telegram types ────────────────────────────────────────────────────────────

interface TelegramVoice {
  file_id: string;
  duration: number;
  mime_type?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number };
  text?: string;
  voice?: TelegramVoice;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ─── Auth guard ────────────────────────────────────────────────────────────────

function isAuthorized(chatId: number): boolean {
  const allowed = process.env.TELEGRAM_CHAT_ID;
  return allowed ? String(chatId) === String(allowed) : false;
}

// ─── IST datetime string ───────────────────────────────────────────────────────

function getISTDateTimeString(): string {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Voice: download and transcribe ───────────────────────────────────────────

async function transcribeVoiceMessage(voice: TelegramVoice): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;

  // Step 1: Get file path from Telegram
  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${voice.file_id}`);
  const fileData = await fileRes.json();
  if (!fileData.ok || !fileData.result?.file_path) {
    throw new Error('Failed to get voice file path from Telegram');
  }

  // Step 2: Download the audio
  const audioUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error('Failed to download voice audio');

  const audioBuffer = await audioRes.arrayBuffer();
  const mimeType = voice.mime_type ?? 'audio/ogg';
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'ogg';

  // Step 3: Create File and transcribe via Whisper
  const audioFile = new File([audioBuffer], `voice.${ext}`, { type: mimeType });
  return await transcribeAudio(audioFile);
}

// ─── Main POST handler ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true }); // Malformed body — silently ignore
  }

  const msg = update.message;

  // Only handle messages
  if (!msg) return NextResponse.json({ ok: true });

  const chatId = msg.chat.id;
  const updateId = update.update_id;

  // ── 1. Idempotency: drop duplicate webhook deliveries ─────────────────────
  try {
    const { error: dupError } = await supabase
      .from('telegram_processed_updates')
      .insert({ update_id: updateId });

    if (dupError?.code === '23505') {
      // Unique violation → already processed this update
      console.log(`[Telegram] Duplicate update_id ${updateId} — skipping`);
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    console.error('[Telegram] Idempotency check error:', e);
    // Don't block — continue processing
  }

  // ── 2. Auth ───────────────────────────────────────────────────────────────
  if (!isAuthorized(chatId)) {
    console.warn(`[Telegram] Unauthorized message from chat ${chatId}`);
    return NextResponse.json({ ok: true });
  }

  // ── 3. Extract text (or transcribe voice) ─────────────────────────────────
  let userText: string | null = null;
  let wasVoice = false;

  if (msg.text?.trim()) {
    userText = msg.text.trim();
  } else if (msg.voice) {
    try {
      userText = await transcribeVoiceMessage(msg.voice);
      wasVoice = true;
      console.log(`[Telegram] Voice transcribed: "${userText?.slice(0, 80)}"`);
    } catch (err) {
      console.error('[Telegram] Voice transcription failed:', err);
      await sendTelegramMessage('❌ Could not transcribe your voice message. Please try again or type it.', { chatId: String(chatId) });
      return NextResponse.json({ ok: true });
    }
  }

  if (!userText) {
    // Photo/sticker/other — silently ignore
    return NextResponse.json({ ok: true });
  }

  console.log(`[Telegram] [${chatId}] ${wasVoice ? '🎤' : '💬'} "${userText.slice(0, 80)}"`);

  // ── 4. Run agent pipeline ─────────────────────────────────────────────────
  const istDateTime = getISTDateTimeString();
  let agentResult: Awaited<ReturnType<typeof runAgentPipeline>>;

  try {
    agentResult = await runAgentPipeline(userText, istDateTime);
  } catch (err) {
    console.error('[Telegram] Agent pipeline failed:', err);
    await sendTelegramMessage('❌ Something went wrong. Please try again.', { chatId: String(chatId) });
    return NextResponse.json({ ok: true });
  }

  // ── 5. Send reply ──────────────────────────────────────────────────────────
  const replyText = wasVoice
    ? `🎤 _Heard: "${userText.slice(0, 60)}${userText.length > 60 ? '...' : ''}"_\n\n${agentResult.response}`
    : agentResult.response;

  await sendTelegramMessage(replyText, { chatId: String(chatId) });

  // ── 6. Background work (non-blocking via after()) ──────────────────────────
  // This runs AFTER the response is returned to Telegram, preventing timeouts.
  after(async () => {
    try {
      // Save conversation history
      await Promise.all([
        saveHistory('user', userText!),
        saveHistory('assistant', agentResult.response),
      ]);

      // Background journal embedding (slow — Mem0 + vector)
      if (agentResult.journalEntryId) {
        await processJournalBackground(agentResult.journalEntryId, userText!);
      }
    } catch (err) {
      console.error('[Telegram] Background work failed:', err);
    }
  });

  return NextResponse.json({ ok: true });
}

// ─── GET handler — health check ───────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'Dayly Telegram AI Agent',
    version: '2.0',
    architecture: 'two-tier LLM (gpt-oss-20b router + gpt-oss-120b sensei)',
    features: ['natural-language', 'voice-journaling', 'habit-logging', 'task-management', 'dynamic-reminders'],
  });
}
