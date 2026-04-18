import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';
import { BusinessListing } from './findBusinesses';

export interface PlaceDetail {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string | null;
  rating: number;
  reviewCount: number;
  priceLevel: number | null;
  openingHours: string[];
  types: string[];
  editorialSummary: string;
  photos: string[];
  reviews: PlaceReview[];
}

export interface PlaceReview {
  author: string;
  rating: number;
  text: string;
  time: number;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * For OSM businesses we don't have a rich detail API, so we build a
 * PlaceDetail directly from the BusinessListing data that findBusinesses
 * already collected. The researchBusiness step then enriches this further
 * via Instagram, Google search scraping, and review mining.
 */
export async function scrapeInfo(
  placeId: string,
  listing?: BusinessListing,
): Promise<PlaceDetail> {
  logger.info(`Building place detail for ${placeId}...`);

  // If we have the listing data, use it directly
  if (listing) {
    return {
      placeId,
      name: listing.name,
      address: listing.address,
      phone: listing.phone,
      website: listing.website,
      rating: listing.rating,
      reviewCount: 0,
      priceLevel: null,
      openingHours: [],
      types: [listing.category],
      editorialSummary: '',
      photos: [],
      reviews: [],
    };
  }

  // Fallback: shouldn't normally reach here
  return {
    placeId,
    name: '',
    address: '',
    phone: '',
    website: null,
    rating: 0,
    reviewCount: 0,
    priceLevel: null,
    openingHours: [],
    types: [],
    editorialSummary: '',
    photos: [],
    reviews: [],
  };
}

/**
 * Try to find a photo for a business by scraping its Google search result.
 * Returns a base64 data URI or null.
 */
export async function fetchBusinessPhoto(name: string, city: string): Promise<string | null> {
  try {
    const res = await axios.get('https://www.google.com/search', {
      params: { q: `${name} ${city}`, tbm: 'isch', num: 1 },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10_000,
    });

    const $ = cheerio.load(res.data as string);
    // Look for the first image src in search results
    let imgUrl: string | null = null;
    $('img').each((_, el) => {
      const src = $(el).attr('src') ?? '';
      if (!imgUrl && src.startsWith('http') && !src.includes('google.com/images')) {
        imgUrl = src;
      }
    });

    if (!imgUrl) return null;

    const imgRes = await axios.get(imgUrl, {
      responseType: 'arraybuffer',
      timeout: 10_000,
      headers: { 'User-Agent': USER_AGENT },
    });
    const mime = (imgRes.headers['content-type'] as string) || 'image/jpeg';
    return `data:${mime};base64,${Buffer.from(imgRes.data as ArrayBuffer).toString('base64')}`;
  } catch {
    return null;
  }
}
