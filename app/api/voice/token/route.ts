/**
 * POST /api/voice/token
 *
 * Mints a single-use Gemini Live ephemeral token for a Sensei check-in call.
 * The whole session config (persona, live data, tools, voice) is LOCKED into the token,
 * so the phone never sees GEMINI_API_KEY and can't repurpose the token for anything else.
 */

import { NextResponse } from 'next/server';
import { EndSensitivity, GoogleGenAI, Modality } from '@google/genai';
import { buildAccountabilityContext } from '@/lib/telegram-agent/checkin';
import { loadHistory } from '@/lib/telegram-agent/pipeline';
import { buildCallInstruction, buildCallTools } from '@/lib/voice/prompt';
import { END_OF_SPEECH_SILENCE_MS, LIVE_API_VERSION, LIVE_MODEL, LIVE_VOICE, MAX_CALL_MS } from '@/lib/voice/constants';

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
  }

  try {
    const [context, history] = await Promise.all([buildAccountabilityContext(), loadHistory(6)]);

    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: LIVE_API_VERSION } });
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,                                                          // one call per token
        newSessionExpireTime: new Date(now + 60_000).toISOString(),       // must connect within 60s
        expireTime: new Date(now + MAX_CALL_MS + 60_000).toISOString(),   // hard stop for the session
        // NOTE: don't add `lockAdditionalFields: []` — the API rejects it ("field_mask is invalid").
        // Setting liveConnectConstraints already locks every field set below.
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: buildCallInstruction(context.text, history),
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: LIVE_VOICE } } },
            inputAudioTranscription: {},   // subtitles for what the user says
            outputAudioTranscription: {},  // subtitles for what Sensei says
            // Patience: wait longer before treating a pause as "done talking" (see constant)
            realtimeInputConfig: {
              automaticActivityDetection: {
                endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
                silenceDurationMs: END_OF_SPEECH_SILENCE_MS,
              },
            },
            tools: [{ functionDeclarations: buildCallTools() }],
          },
        },
      },
    });

    if (!token.name) throw new Error('Token response had no name');
    return NextResponse.json({ token: token.name, focusInProgress: context.focusInProgress });
  } catch (err) {
    console.error('[Voice] Token mint failed:', err);
    return NextResponse.json({ error: 'Could not start the call' }, { status: 500 });
  }
}
