import axios from 'axios';
import * as cheerio from 'cheerio';
import { PlaceDetail, PlaceReview } from './scrapeInfo';
import { logger } from '../utils/logger';
import { sleep } from '../utils/logger';

export interface EnrichedBusiness extends PlaceDetail {
  // Inferred vibe
  vibeKeywords: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];
  subcategory: string;
  priceSymbol: string;

  // Content
  menuItems: string[];
  signatureItems: string[];
  services: string[];
  topReviewQuotes: string[];

  // Social
  instagramHandle: string | null;
  instagramBio: string;
  recentCaptions: string[];
  facebookUrl: string | null;

  // Visual
  instagramAesthetic: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Instagram Discovery ─────────────────────────────────────────────────────

/** Derive candidate Instagram handles from a business name. */
function candidateHandles(name: string, city: string): string[] {
  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cityClean = city.toLowerCase().replace(/[^a-z]/g, '');
  return [
    clean,
    `${clean}${cityClean}`,
    `the${clean}`,
    `${clean}nz`,
    `${clean}_${cityClean}`,
  ];
}

/**
 * Try to find the business's Instagram handle.
 * Returns the handle (without @) if found, null otherwise.
 */
async function findInstagram(name: string, city: string): Promise<string | null> {
  for (const handle of candidateHandles(name, city)) {
    try {
      const res = await axios.head(`https://www.instagram.com/${handle}/`, {
        timeout: 6_000,
        maxRedirects: 0,
        validateStatus: (s) => s < 400,
        headers: { 'User-Agent': USER_AGENT },
      });
      if (res.status === 200) {
        logger.info(`Found Instagram: @${handle}`);
        return handle;
      }
    } catch {
      // Not found or blocked — continue
    }
  }
  return null;
}

/** Scrape the public Instagram profile page for bio and recent captions. */
async function scrapeInstagram(
  handle: string,
): Promise<{ bio: string; captions: string[]; hashtags: string[] }> {
  try {
    const res = await axios.get(`https://www.instagram.com/${handle}/`, {
      timeout: 10_000,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
      },
    });
    const $ = cheerio.load(res.data as string);

    // Instagram buries data in JSON inside <script> tags
    let bio = '';
    const captions: string[] = [];
    const hashtags: string[] = [];

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() ?? '{}') as Record<string, unknown>;
        if (typeof json.description === 'string') bio = json.description;
      } catch { /* skip */ }
    });

    // Fallback: grab meta description
    if (!bio) {
      bio = $('meta[property="og:description"]').attr('content') ?? '';
    }

    // Extract hashtags from bio
    const hashtagMatches = bio.match(/#\w+/g) ?? [];
    hashtags.push(...hashtagMatches);

    return { bio: bio.slice(0, 500), captions, hashtags };
  } catch {
    return { bio: '', captions: [], hashtags: [] };
  }
}

// ─── Google Search Scrape ────────────────────────────────────────────────────

/** Scrape first 3 Google results for a query, returning text excerpts. */
async function googleSearchScrape(query: string): Promise<string[]> {
  const excerpts: string[] = [];
  try {
    const res = await axios.get('https://www.google.com/search', {
      params: { q: query, num: 5 },
      timeout: 10_000,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
        'Accept-Language': 'en-NZ,en;q=0.9',
      },
    });
    const $ = cheerio.load(res.data as string);

    // Extract snippet text from Google result cards
    $('div.VwiC3b, span.aCOpRe, div.s').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 30) excerpts.push(text.slice(0, 300));
    });
  } catch {
    // Google may CAPTCHA us — graceful fallback
  }
  return excerpts.slice(0, 6);
}

// ─── Review Analysis ─────────────────────────────────────────────────────────

const VIBE_WORDS = [
  'cozy', 'cosy', 'friendly', 'authentic', 'fresh', 'fast', 'clean', 'trendy',
  'family', 'upscale', 'casual', 'traditional', 'modern', 'rustic', 'warm',
  'professional', 'efficient', 'reliable', 'affordable', 'quality',
  'delicious', 'amazing', 'excellent', 'great', 'best', 'hidden gem',
];

function extractVibeKeywords(reviews: PlaceReview[]): string[] {
  const combined = reviews.map((r) => r.text.toLowerCase()).join(' ');
  return VIBE_WORDS.filter((w) => combined.includes(w)).slice(0, 6);
}

function extractSignatureItems(reviews: PlaceReview[], menuItems: string[]): string[] {
  if (!menuItems.length) return [];
  const combined = reviews.map((r) => r.text.toLowerCase()).join(' ');
  return menuItems.filter((item) => combined.includes(item.toLowerCase())).slice(0, 4);
}

function extractQuotes(reviews: PlaceReview[]): string[] {
  return reviews
    .filter((r) => r.rating >= 4 && r.text.length > 40 && r.text.length < 200)
    .map((r) => r.text.replace(/["\n]/g, ' ').trim())
    .slice(0, 3);
}

// ─── Category Helpers ────────────────────────────────────────────────────────

function inferSubcategory(types: string[], vibe: string[]): string {
  if (types.some((t) => t.includes('fine_dining') || t.includes('restaurant'))) {
    if (vibe.some((v) => ['upscale', 'elegant', 'fine'].includes(v))) return 'Fine Dining';
    if (vibe.some((v) => ['family', 'casual'].includes(v))) return 'Family Restaurant';
    return 'Restaurant';
  }
  if (types.includes('cafe')) return 'Café';
  if (types.includes('bar')) return 'Bar & Lounge';
  if (types.includes('gym')) return 'Gym';
  if (types.includes('beauty_salon')) return 'Beauty Salon';
  if (types.includes('hair_care')) return 'Hair Salon';
  if (types.includes('plumber')) return 'Plumbing Services';
  return types[0]?.replace(/_/g, ' ') ?? 'Local Business';
}

function inferServices(types: string[], name: string): string[] {
  const t = types.join(' ');
  if (t.includes('plumber')) return ['Emergency Plumbing', 'Hot Water Systems', 'Drain Clearing', 'Leak Repairs', 'Bathroom Renovations', 'Gas Fitting'];
  if (t.includes('electrician')) return ['Electrical Installations', 'Switchboard Upgrades', 'Fault Finding', 'LED Lighting', 'EV Charger Installation', 'Safety Inspections'];
  if (t.includes('hair')) return ['Cut & Style', 'Colour & Highlights', 'Balayage', 'Keratin Treatments', 'Wedding Hair', 'Kids Cuts'];
  if (t.includes('gym') || t.includes('fitness')) return ['Personal Training', 'Group Classes', 'Strength & Conditioning', 'Nutrition Coaching', 'Online Programs'];
  if (t.includes('beauty')) return ['Facials', 'Waxing', 'Brow Shaping', 'Lash Extensions', 'Skin Consultations', 'Massage'];
  if (t.includes('dentist')) return ['General Dentistry', 'Teeth Whitening', 'Invisalign', 'Dental Implants', 'Emergency Dental', 'Children\'s Dentistry'];
  if (t.includes('lawyer') || t.includes('legal')) return ['Contract Law', 'Property Law', 'Employment Law', 'Family Law', 'Business Advisory'];
  if (t.includes('accounting')) return ['Tax Returns', 'Business Advisory', 'GST & PAYE', 'Xero Setup', 'Financial Planning'];
  if (t.includes('landscap')) return ['Garden Design', 'Lawn Care', 'Irrigation Systems', 'Retaining Walls', 'Tree Services', 'Section Clearing'];
  return ['Consultation', 'Services', 'Bookings Available'];
}

function inferTargetAudience(types: string[], vibe: string[]): string {
  if (types.some((t) => t.includes('childcare') || t.includes('school'))) return 'families with young children';
  if (types.some((t) => t.includes('gym') || t.includes('fitness'))) return 'fitness enthusiasts and health-conscious locals';
  if (types.some((t) => t.includes('bar'))) return 'young professionals and locals looking for a great night out';
  if (vibe.includes('family')) return 'families and locals of all ages';
  if (vibe.includes('upscale') || vibe.includes('elegant')) return 'discerning diners and special occasion guests';
  return 'locals and visitors to the area';
}

function priceLevelSymbol(level: number | null): string {
  if (!level) return '';
  return '$'.repeat(level);
}

// ─── Main Enrichment Function ─────────────────────────────────────────────────

/**
 * Enrich a PlaceDetail with social media, search results, and inferred intelligence.
 * Designed to be resilient — any sub-step can fail without breaking the pipeline.
 */
export async function researchBusiness(place: PlaceDetail, city = ''): Promise<EnrichedBusiness> {
  logger.info(`Researching business: ${place.name}...`);

  // 1. Instagram
  let instagramHandle: string | null = null;
  let instagramBio = '';
  let recentCaptions: string[] = [];
  const instagramHashtags: string[] = [];
  const instagramAesthetic = '';

  try {
    instagramHandle = await findInstagram(place.name, city);
    if (instagramHandle) {
      const igData = await scrapeInstagram(instagramHandle);
      instagramBio = igData.bio;
      recentCaptions = igData.captions;
      instagramHashtags.push(...igData.hashtags);
    }
    await sleep(1000);
  } catch (err) {
    logger.warn(`Instagram research failed: ${(err as Error).message}`);
  }

  // 2. Google search scrape
  let searchExcerpts: string[] = [];
  try {
    searchExcerpts = await googleSearchScrape(`"${place.name}" ${city}`);
    await sleep(1500);
  } catch (err) {
    logger.warn(`Google search scrape failed: ${(err as Error).message}`);
  }

  // 3. Facebook URL guess
  let facebookUrl: string | null = null;
  try {
    const slug = place.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const candidates = [`https://www.facebook.com/${slug}`, `https://www.facebook.com/${slug}${city.toLowerCase().replace(/[^a-z]/g, '')}`];
    for (const url of candidates) {
      const res = await axios.head(url, {
        timeout: 5_000,
        maxRedirects: 1,
        validateStatus: (s) => s < 400,
        headers: { 'User-Agent': USER_AGENT },
      });
      if (res.status === 200) {
        facebookUrl = url;
        break;
      }
    }
  } catch {
    // Not found — fine
  }

  // 4. Derive intelligence
  const vibeKeywords = extractVibeKeywords(place.reviews);
  const services = inferServices(place.types, place.name);
  const menuItems = extractMenuItems(searchExcerpts, recentCaptions);
  const signatureItems = extractSignatureItems(place.reviews, menuItems);
  const topReviewQuotes = extractQuotes(place.reviews);
  const uniqueSellingPoints = buildUSPs(place, vibeKeywords, signatureItems);
  const subcategory = inferSubcategory(place.types, vibeKeywords);
  const targetAudience = inferTargetAudience(place.types, vibeKeywords);
  const priceSymbol = priceLevelSymbol(place.priceLevel);

  return {
    ...place,
    vibeKeywords,
    targetAudience,
    uniqueSellingPoints,
    subcategory,
    priceSymbol,
    menuItems,
    signatureItems,
    services,
    topReviewQuotes,
    instagramHandle,
    instagramBio,
    recentCaptions,
    facebookUrl,
    instagramAesthetic,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractMenuItems(excerpts: string[], captions: string[]): string[] {
  const combined = [...excerpts, ...captions].join(' ');
  // Very simple extraction: look for Title Case phrases that could be dish names
  const matches = combined.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g) ?? [];
  const stopWords = new Set(['The', 'And', 'With', 'Our', 'We', 'Are', 'From', 'For', 'New', 'This', 'More', 'All', 'Best', 'Made', 'Get', 'Your']);
  return [...new Set(matches)]
    .filter((m) => !stopWords.has(m) && m.length > 4 && m.length < 40)
    .slice(0, 12);
}

function buildUSPs(
  place: PlaceDetail,
  vibeKeywords: string[],
  signatureItems: string[],
): string[] {
  const usps: string[] = [];
  if (place.rating >= 4.5) usps.push(`Rated ${place.rating}★ by ${place.reviewCount}+ customers`);
  if (signatureItems.length > 0) usps.push(`Known for: ${signatureItems.slice(0, 2).join(', ')}`);
  if (vibeKeywords.length > 0) usps.push(`Described as: ${vibeKeywords.slice(0, 3).join(', ')}`);
  if (place.editorialSummary) usps.push(place.editorialSummary);
  return usps.slice(0, 4);
}
