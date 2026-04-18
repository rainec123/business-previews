import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

export interface FoundEmail {
  email: string;
  firstName: string | null;
  lastName: string | null;
  source: 'scrape' | 'google';
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const IGNORED_DOMAINS = new Set([
  'example.com', 'sentry.io', 'wixpress.com', 'squarespace.com',
  'shopify.com', 'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
]);

/** Extract emails from raw HTML/text, filtering out generic/platform addresses. */
function extractEmails(text: string, businessName: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  return [...new Set(matches)].filter((email) => {
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    if (IGNORED_DOMAINS.has(domain)) return false;
    if (email.includes('noreply') || email.includes('no-reply')) return false;
    return true;
  });
}

/** Scrape a URL and return any emails found on it. */
async function scrapeUrlForEmail(url: string, businessName: string): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      timeout: 10_000,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 3,
    });
    const text = res.data as string;
    const emails = extractEmails(text, businessName);
    return emails[0] ?? null;
  } catch {
    return null;
  }
}

/** Search Google for the business and scrape the top results for contact emails. */
async function searchGoogleForEmail(businessName: string, city: string): Promise<string | null> {
  try {
    const query = `"${businessName}" "${city}" contact email`;
    const res = await axios.get('https://www.google.com/search', {
      params: { q: query, num: 5 },
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-NZ,en;q=0.9' },
      timeout: 10_000,
    });

    const $ = cheerio.load(res.data as string);

    // Extract URLs from search results
    const urls: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const match = href.match(/\/url\?q=([^&]+)/);
      if (match) {
        const url = decodeURIComponent(match[1]);
        if (url.startsWith('http') && !url.includes('google.com')) {
          urls.push(url);
        }
      }
    });

    // Also check for emails directly in Google snippet text
    const pageText = $.text();
    const directEmails = extractEmails(pageText, businessName);
    if (directEmails.length) return directEmails[0];

    // Scrape top 3 result URLs
    for (const url of urls.slice(0, 3)) {
      const email = await scrapeUrlForEmail(url, businessName);
      if (email) return email;
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (err) {
    logger.warn(`Google search failed for "${businessName}": ${(err as Error).message}`);
  }

  return null;
}

/** Try common email formats based on business name and city. */
async function tryCommonFormats(businessName: string): Promise<string | null> {
  // Build domain guesses from business name
  const slug = businessName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '');

  const domains = [`${slug}.co.nz`, `${slug}.com`, `${slug}.nz`];
  const prefixes = ['info', 'hello', 'contact', 'enquiries'];

  for (const domain of domains) {
    // Check if domain exists via a HEAD request
    try {
      await axios.head(`https://${domain}`, { timeout: 5_000, maxRedirects: 2 });
      // Domain exists — return most likely email
      return `${prefixes[0]}@${domain}`;
    } catch {
      // Domain doesn't exist — try next
    }
  }
  return null;
}

/**
 * Find a contact email for a business using free scraping techniques:
 * 1. Google search for their contact page
 * 2. Scrape top search results
 * 3. Guess common email formats if domain exists
 *
 * No API key required.
 */
export async function findEmail(
  businessName: string,
  city: string,
): Promise<FoundEmail | null> {
  logger.info(`Looking up email for "${businessName}"...`);

  // Step 1: Google search + scrape
  const googleEmail = await searchGoogleForEmail(businessName, city);
  if (googleEmail) {
    logger.info(`Found email via Google scrape: ${googleEmail}`);
    return { email: googleEmail, firstName: null, lastName: null, source: 'google' };
  }

  // Step 2: Try common email format guesses
  const guessedEmail = await tryCommonFormats(businessName);
  if (guessedEmail) {
    logger.info(`Guessed email via domain check: ${guessedEmail}`);
    return { email: guessedEmail, firstName: null, lastName: null, source: 'scrape' };
  }

  logger.info(`No email found for "${businessName}" — skipping outreach.`);
  return null;
}
