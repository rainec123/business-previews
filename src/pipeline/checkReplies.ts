/**
 * Polls the Gmail inbox every 5 minutes looking for replies to emails we sent.
 * Matches by subject line ("Re: We built X a website") and marks them in SQLite.
 * Triggers a Telegram notification for each new reply found.
 */
import { ImapFlow } from 'imapflow';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { getSentRecordByEmail, markReplied } from './sendEmail';
import { updateStatus } from './logToSheets';
import { notifyReply } from '../webhook/telegramNotify';

/** Extract the plain email address from a "Name <email>" string. */
function parseAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : raw.toLowerCase().trim();
}

/**
 * Connect to Gmail via IMAP, scan the inbox for reply emails,
 * and process any that match a business we've contacted.
 */
export async function checkGmailReplies(): Promise<void> {
  logger.info('Checking Gmail for replies...');

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: config.gmailUser,
      pass: config.gmailAppPassword,
    },
    logger: false, // suppress imapflow's verbose logs
  });

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Search for unread emails with "Re:" in the subject from the last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const messages = client.fetch(
      { seen: false, since },
      { envelope: true, flags: true },
    );

    const repliesFound: string[] = [];

    for await (const msg of messages) {
      if (!msg.envelope) continue;
      const subject = msg.envelope.subject ?? '';
      const fromAddr = msg.envelope.from?.[0];
      if (!fromAddr) continue;

      const fromEmail = parseAddress(fromAddr.address ?? '');

      // Match: subject starts with "Re:" and we have a record for this sender
      if (!subject.toLowerCase().startsWith('re:')) continue;

      const record = getSentRecordByEmail(fromEmail);
      if (!record) continue;
      if (record.status === 'REPLIED') continue; // already processed

      logger.info(`Reply detected from ${fromEmail} — "${record.businessName}"`);
      repliesFound.push(fromEmail);

      // Update SQLite
      markReplied(fromEmail);

      // Update Google Sheets
      await updateStatus(
        record.businessName,
        'REPLIED',
        `Reply received from ${fromEmail}`,
      ).catch((err) => logger.warn(`Sheets update failed: ${(err as Error).message}`));

      // Telegram notification
      await notifyReply({
        businessName: record.businessName,
        city: record.city,
        category: record.category,
        fromEmail,
        previewUrl: record.previewUrl,
      });
    }

    if (repliesFound.length === 0) {
      logger.info('No new replies found.');
    } else {
      logger.info(`Processed ${repliesFound.length} new reply/replies.`);
    }
  } catch (err) {
    logger.error(`Gmail reply check failed: ${(err as Error).message}`);
  } finally {
    await client.logout().catch(() => null);
  }
}
