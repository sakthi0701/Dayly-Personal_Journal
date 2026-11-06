/**
 * lib/voice/constants.ts
 *
 * Shared (client + server) constants for the Sensei voice check-in call.
 * Pure data only — no server imports, safe to bundle in the browser.
 */

/**
 * Gemini 3.8 Live, NOT 3.8 Live Extended Thinking: the extended model adds background-reasoning
 * delay per turn and only supports NON_BLOCKING tools, so it can claim "done" before the DB write
 * lands. A check-in call needs fast turns + reliable tool results. Don't swap without re-testing.
 */
export const LIVE_MODEL = 'gemini-3.8-live';

/** Ephemeral tokens are v1alpha-only in @google/genai 1.42 (verified: v1alpha works end to end). */
export const LIVE_API_VERSION = 'v1alpha';

/** Prebuilt voice — "Informative" male voice; closest to a calm AI-butler delivery. */
export const LIVE_VOICE = 'Charon';

/**
 * Agent tools Sensei may use on a call. Timer + read_journal tools are Telegram-only on purpose.
 * log_journal is NOT run by executeTools (it only echoes content) — /api/voice/tool saves it itself.
 */
export const VOICE_AGENT_TOOLS = [
  'log_journal',
  'log_habits',
  'complete_tasks',
  'complete_pressure_tasks',
  'add_tasks',
  'add_pressure_tasks',
  'get_stats',
  'set_reminder',
] as const;

/** Voice-only tool: lets Sensei hang up after saying goodbye. Handled on the client. */
export const END_CALL_TOOL = 'end_call';

/**
 * Silence Gemini waits for before deciding you've finished speaking. Raised on user request:
 * at the default, Sensei kept cutting in while they paused to find the next English word.
 * Higher = more patience but a slower reply after every turn. Don't lower without asking.
 */
export const END_OF_SPEECH_SILENCE_MS = 1500;

/** Hard cap so a forgotten call can't run up the bill (Live audio sessions max out at 15 min). */
export const MAX_CALL_MS = 12 * 60 * 1000;
