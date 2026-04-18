import nodemailer from 'nodemailer';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { EnrichedBusiness } from './researchBusiness';
import { FoundEmail } from './findEmail';
import { buildSubject, buildPlainText, buildHtml } from '../prompts/emailTemplate';

// ─── Database setup ───────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'emails.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS sent_emails (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id      TEXT    UNIQUE NOT NULL,
    business_name TEXT    NOT NULL,
    email         TEXT    NOT NULL,
    message_id    TEXT,
    sent_at       TEXT    DEFAULT (datetime('now')),
    preview_url   TEXT,
    status        TEXT    DEFAULT 'SENT',
    reply_received_at TEXT,
    city          TEXT,
    category      TEXT
  )
`);

// ─── Database helpers ─────────────────────────────────────────────────────────

export interface SentRecord {
  id: number;
  placeId: string;
  businessName: string;
  email: string;
  messageId: string | null;
  sentAt: string;
  previewUrl: string | null;
  status: string;
  replyReceivedAt: string | null;
  city: string;
  category: string;
}

/** Check if we've already sent an email for this place. */
export function alreadySent(placeId: string): boolean {
  const row = db.prepare('SELECT id FROM sent_emails WHERE place_id = ?').get(placeId);
  return !!row;
}

/** Record a successfully sent email. */
function recordSent(
  placeId: string,
  businessName: string,
  email: string,
  messageId: string | null,
  previewUrl: string,
  city: string,
  category: string,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO sent_emails
      (place_id, business_name, email, message_id, preview_url, city, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(placeId, businessName, email, messageId, previewUrl, city, category);
}

/** Mark an email as replied and record the timestamp. */
export function markReplied(email: string): SentRecord | null {
  db.prepare(`
    UPDATE sent_emails
    SET status = 'REPLIED', reply_received_at = datetime('now')
    WHERE email = ?
  `).run(email);

  return getSentRecordByEmail(email);
}

/** Retrieve a sent record by the recipient email address. */
export function getSentRecordByEmail(email: string): SentRecord | null {
  const row = db.prepare('SELECT * FROM sent_emails WHERE email = ?').get(email) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as number,
    placeId: row.place_id as string,
    businessName: row.business_name as string,
    email: row.email as string,
    messageId: row.message_id as string | null,
    sentAt: row.sent_at as string,
    previewUrl: row.preview_url as string | null,
    status: row.status as string,
    replyReceivedAt: row.reply_received_at as string | null,
    city: row.city as string,
    category: row.category as string,
  };
}

/** Retrieve a sent record by message ID (for reply matching). */
export function getSentRecordByMessageId(messageId: string): SentRecord | null {
  const row = db.prepare('SELECT * FROM sent_emails WHERE message_id = ?').get(messageId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as number,
    placeId: row.place_id as string,
    businessName: row.business_name as string,
    email: row.email as string,
    messageId: row.message_id as string | null,
    sentAt: row.sent_at as string,
    previewUrl: row.preview_url as string | null,
    status: row.status as string,
    replyReceivedAt: row.reply_received_at as string | null,
    city: row.city as string,
    category: row.category as string,
  };
}

// ─── Email sending ────────────────────────────────────────────────────────────

/** Create a reusable Gmail SMTP transporter. */
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.gmailUser,
      pass: config.gmailAppPassword,
    },
  });
}

/**
 * Send a personalised cold email to a business using Gmail SMTP.
 * Skips if an email has already been sent for this placeId.
 * Returns true if the email was sent, false if skipped.
 */
export async function sendEmail(
  business: EnrichedBusiness,
  contact: FoundEmail,
  previewUrl: string,
): Promise<boolean> {
  if (alreadySent(business.placeId)) {
    logger.info(`Skipping "${business.name}" — email already sent.`);
    return false;
  }

  const emailData = {
    businessName: business.name,
    firstName: contact.firstName,
    previewUrl,
    city: business.address.split(',').pop()?.trim() ?? config.targetCity,
    fromName: config.fromName,
  };

  const subject = buildSubject(business.name);
  const text = buildPlainText(emailData);
  const html = buildHtml(emailData);

  logger.info(`Sending email to ${contact.email} for "${business.name}"...`);

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: `${config.fromName} <${config.gmailUser}>`,
    to: contact.email,
    subject,
    text,
    html,
    headers: {
      'X-Business-Id': business.placeId,
    },
  });

  const messageId = (info.messageId as string) ?? null;

  recordSent(
    business.placeId,
    business.name,
    contact.email,
    messageId,
    previewUrl,
    config.targetCity,
    business.subcategory,
  );

  logger.info(`Email sent to ${contact.email} — message ID: ${messageId}`);
  return true;
}
