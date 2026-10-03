/**
 * lib/telegram.ts
 *
 * Zero-dependency Telegram Bot API utility.
 * Uses native `fetch` — no heavy SDK required.
 *
 * Usage:
 *   import { sendTelegramMessage } from '@/lib/telegram';
 *   await sendTelegramMessage('Hello *world*!');
 */

export type ParseMode = 'Markdown' | 'MarkdownV2' | 'HTML';

export interface TelegramMessageOptions {
  /** Overrides the default TELEGRAM_CHAT_ID env var */
  chatId?: string;
  parseMode?: ParseMode;
  /** Set to false to disable link previews */
  disableWebPagePreview?: boolean;
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

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode ?? 'Markdown',
  };

  if (options.disableWebPagePreview) {
    payload.disable_web_page_preview = true;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

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
