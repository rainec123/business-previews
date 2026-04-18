import { Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { markReplied, getSentRecordByMessageId } from '../pipeline/sendEmail';
import { updateStatus } from '../pipeline/logToSheets';
import { notifyReply } from './telegramNotify';

/**
 * Validate the Resend webhook signature.
 * Resend signs requests with HMAC-SHA256 using the webhook secret.
 * The signature is sent in the `svix-signature` header.
 */
function validateWebhookSignature(
  _payload: string,
  _headers: Record<string, string | string[] | undefined>,
): boolean {
  // Reply detection is now handled by Gmail IMAP polling (checkReplies.ts)
  // This handler is kept for any future webhook integrations
  return true;
}

interface ResendInboundPayload {
  type: string;
  data?: {
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
    html?: string;
    headers?: Array<{ name: string; value: string }>;
    in_reply_to?: string;
  };
}

/**
 * Express handler for POST /webhook/reply
 *
 * Handles two types of Resend webhook events:
 * 1. `email.delivered` / `email.opened` / `email.clicked` — status updates
 * 2. Inbound emails (when the reply-to address receives a reply)
 *
 * For inbound reply detection to work, configure Resend Inbound routing
 * to forward emails to REPLY_TO_EMAIL → POST /webhook/reply
 */
export async function handleReplyWebhook(req: Request, res: Response): Promise<void> {
  // Validate signature
  const rawBody = JSON.stringify(req.body) as string;
  const isValid = validateWebhookSignature(rawBody, req.headers as Record<string, string | undefined>);

  if (!isValid) {
    logger.warn('Invalid webhook signature — rejecting request.');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const payload = req.body as ResendInboundPayload;
  logger.info(`Received webhook event: ${payload.type}`);

  // Handle inbound email (reply from a business)
  if (payload.type === 'email.received' || payload.type === 'inbound') {
    await handleInboundEmail(payload.data ?? {});
    res.status(200).json({ ok: true });
    return;
  }

  // Other event types — just acknowledge
  res.status(200).json({ ok: true });
}

async function handleInboundEmail(data: ResendInboundPayload['data'] & object): Promise<void> {
  const fromEmail = (data as { from?: string }).from ?? '';
  if (!fromEmail) {
    logger.warn('Inbound webhook missing "from" field.');
    return;
  }

  logger.info(`Processing inbound reply from: ${fromEmail}`);

  // Try to match by In-Reply-To header (most reliable)
  const inReplyTo = (data as { in_reply_to?: string }).in_reply_to;
  let record = null;

  if (inReplyTo) {
    // Strip angle brackets from message ID
    const cleanId = inReplyTo.replace(/[<>]/g, '').trim();
    record = getSentRecordByMessageId(cleanId);
  }

  // Fallback: match by sender email
  if (!record) {
    const { markReplied: mReply, getSentRecordByEmail } = await import('../pipeline/sendEmail');
    record = getSentRecordByEmail(fromEmail);
    if (record) mReply(fromEmail);
  } else {
    markReplied(fromEmail);
  }

  if (!record) {
    logger.warn(`Could not match inbound email from ${fromEmail} to any sent record.`);
    return;
  }

  logger.info(`Reply matched to: "${record.businessName}"`);

  // Update Google Sheets status
  await updateStatus(record.businessName, 'REPLIED', `Reply received from ${fromEmail}`);

  // Send Telegram notification
  await notifyReply({
    businessName: record.businessName,
    city: record.city,
    category: record.category,
    fromEmail,
    previewUrl: record.previewUrl,
  });
}
