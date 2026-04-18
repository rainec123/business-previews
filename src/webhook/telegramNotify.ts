import axios from 'axios';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

/**
 * Send a message to the configured Telegram chat via the Bot API.
 */
export async function sendTelegramMessage(text: string): Promise<void> {
  try {
    await axios.post(
      `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
      {
        chat_id: config.telegramChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      },
      { timeout: 10_000 },
    );
    logger.info('Telegram notification sent.');
  } catch (err) {
    logger.error(`Telegram notification failed: ${(err as Error).message}`);
  }
}

export interface ReplyNotification {
  businessName: string;
  city: string;
  category: string;
  fromEmail: string;
  previewUrl: string | null;
}

/** Notify about a new email reply from a business. */
export async function notifyReply(data: ReplyNotification): Promise<void> {
  const message = `🔥 <b>NEW REPLY</b> — ${data.businessName}
📍 ${data.city} | ${data.category}
📧 From: <code>${data.fromEmail}</code>
🌐 Preview: ${data.previewUrl ?? 'N/A'}

Reply to: <code>${data.fromEmail}</code>`;

  await sendTelegramMessage(message);
}

export interface RunSummary {
  found: number;
  emailsSent: number;
  skippedNoEmail: number;
  errors: number;
  durationSeconds: number;
}

/** Send a nightly run summary to Telegram. */
export async function notifyRunSummary(summary: RunSummary): Promise<void> {
  const message = `✅ <b>Nightly run complete</b>
Found: ${summary.found} businesses
Emails sent: ${summary.emailsSent}
Skipped (no email): ${summary.skippedNoEmail}
Errors: ${summary.errors}
Duration: ${summary.durationSeconds}s`;

  await sendTelegramMessage(message);
}

/** Send a critical alert (e.g. API quota exceeded). */
export async function notifyAlert(alertMessage: string): Promise<void> {
  await sendTelegramMessage(`⚠️ <b>ALERT</b>\n${alertMessage}`);
}
