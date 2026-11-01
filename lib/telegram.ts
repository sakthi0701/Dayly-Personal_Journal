/**
 * lib/telegram.ts
 *
 * Zero-dependency Telegram Bot API utility.
 * Uses native `fetch` — no heavy SDK required.
 *
 * Callers (and the LLM) write light Markdown: *bold*, **bold**, _italic_, `code`,
 * "- " bullets. It is converted to Telegram HTML before sending.
 *
 * Usage:
 *   import { sendTelegramMessage } from '@/lib/telegram';
 *   await sendTelegramMessage('Hello *world*!');
 */

export interface TelegramMessageOptions {
  /** Overrides the default TELEGRAM_CHAT_ID env var */
  chatId?: string;
  /** Set to false to disable link previews */
  disableWebPagePreview?: boolean;
}

// ── Markdown → Telegram HTML ───────────────────────────────────────────────────
// Legacy `parse_mode: 'Markdown'` rejects the WHOLE message (HTTP 400) on a single
// unmatched `_` or `*` — e.g. a task titled "ER_model" or LLM output using **bold**.
// HTML only needs <, >, & escaped, so we escape first and then convert the few
// markers we support. Do not switch back to 'Markdown' parse mode.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function markdownToTelegramHtml(md: string): string {
  // Pull code spans out first so nothing inside them gets formatted
  const codes: string[] = [];
  let s = md.replace(/`([^`\n]+)`/g, (_, code: string) => `\u0000${codes.push(code) - 1}\u0000`);

  s = escapeHtml(s);
  s = s.replace(/^[ \t]*[-*•][ \t]+/gm, '• ');                          // bullets (before * → bold)
  s = s.replace(/^#{1,6}[ \t]+(.+)$/gm, '<b>$1</b>');                   // stray LLM headers
  s = s.replace(/\*\*(?!\s)(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<b>$2</b>');
  s = s.replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1<i>$2</i>');  // word-bounded: snake_case stays
  s = s.replace(/\n{3,}/g, '\n\n');                                       // collapse runaway blank lines

  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// ── Send ───────────────────────────────────────────────────────────────────────

async function postMessage(token: string, payload: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Sends a message to the configured Telegram chat.
 * Resolves to `true` on success, `false` on failure (never throws).
 */
export async function sendTelegramMessage(
  text: string,
  options: TelegramMessageOptions = {}
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId ?? process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env vars.');
    return false;
  }

  const html = markdownToTelegramHtml(text);
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
  };

  if (options.disableWebPagePreview) {
    payload.disable_web_page_preview = true;
  }

  try {
    let res = await postMessage(token, payload);

    // Formatting rejected (malformed entities) → resend as plain text rather than
    // dropping the message. Without this a bad LLM reply silently never arrives.
    if (res.status === 400) {
      console.warn(`[Telegram] HTML rejected, retrying as plain text: ${await res.text()}`);
      delete payload.parse_mode;
      res = await postMessage(token, { ...payload, text: htmlToPlainText(html) });
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Telegram] API error ${res.status}: ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Telegram] Network error:', err);
    return false;
  }
}

/**
 * Sends a notification-style message asynchronously (fire-and-forget).
 * Useful for background notifications that should not block the main response.
 */
export function notifyTelegram(text: string, options?: TelegramMessageOptions): void {
  sendTelegramMessage(text, options).catch(() => {
    // Swallow — logging already handled inside sendTelegramMessage
  });
}
