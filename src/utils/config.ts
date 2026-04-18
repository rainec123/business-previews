import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optionalEnv(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // Business search: OpenStreetMap — no key needed

  // Anthropic
  anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),

  // GitHub Pages (preview site hosting — uses existing GitHub account)
  githubToken: requireEnv('GITHUB_TOKEN'),
  githubOwner: requireEnv('GITHUB_OWNER'),
  githubRepo: requireEnv('GITHUB_REPO'),

  // Email finding: free scraping — no key needed

  // Gmail
  gmailUser: requireEnv('GMAIL_USER'),
  gmailAppPassword: requireEnv('GMAIL_APP_PASSWORD'),

  // Telegram
  telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  telegramChatId: requireEnv('TELEGRAM_CHAT_ID'),

  // Google Sheets — optional, falls back to SQLite-only logging
  googleSheetsId: optionalEnv('GOOGLE_SHEETS_ID'),
  googleServiceAccountJson: optionalEnv('GOOGLE_SERVICE_ACCOUNT_JSON'),

  // Sending identity
  fromName: requireEnv('FROM_NAME'),

  // Pipeline
  targetNiche: optionalEnv('TARGET_NICHE', 'cafe'),
  targetCity: optionalEnv('TARGET_CITY', 'Auckland'),
  dailyLimit: parseInt(optionalEnv('DAILY_LIMIT', '50'), 10),

  // Server
  port: parseInt(optionalEnv('PORT', '3000'), 10),
};

export type Config = typeof config;
