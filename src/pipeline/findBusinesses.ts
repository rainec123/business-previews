import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

export interface BusinessListing {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  rating: number;
  photoReference: string | null;
  category: string;
  website: string | null;
}

const CONTACTED_FILE = path.join(process.cwd(), 'data', 'already-contacted.json');

// OpenStreetMap niche -> OSM tag mappings
const NICHE_MAP: Record<string, Array<[string, string]>> = {
  cafe:        [['amenity', 'cafe']],
  coffee:      [['amenity', 'cafe']],
  restaurant:  [['amenity', 'restaurant']],
  plumber:     [['craft', 'plumber']],
  electrician: [['craft', 'electrician']],
  hairdresser: [['shop', 'hairdresser']],
  barber:      [['shop', 'barber']],
  gym:         [['leisure', 'fitness_centre']],
  bakery:      [['shop', 'bakery']],
  florist:     [['shop', 'florist']],
  dentist:     [['amenity', 'dentist']],
  bar:         [['amenity', 'bar']],
  pub:         [['amenity', 'pub']],
  beauty:      [['shop', 'beauty']],
  butcher:     [['shop', 'butcher']],
  optician:    [['shop', 'optician']],
};

function loadContacted(): Set<string> {
  try {
    if (!fs.existsSync(CONTACTED_FILE)) return new Set();
    const raw = fs.readFileSync(CONTACTED_FILE, 'utf-8');
    return new Set((JSON.parse(raw) as { placeIds: string[] }).placeIds);
  } catch {
    return new Set();
  }
}

export function markContacted(placeId: string): void {
  const set = loadContacted();
  set.add(placeId);
  fs.mkdirSync(path.dirname(CONTACTED_FILE), { recursive: true });
  fs.writeFileSync(CONTACTED_FILE, JSON.stringify({ placeIds: [...set] }, null, 2));
}

interface NominatimResult {
  boundingbox: [string, string, string, string]; // [minlat, maxlat, minlon, maxlon]
  display_name: string;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Use Nominatim to get a bounding box for a city name. */
async function getCityBbox(city: string): Promise<[number, number, number, number]> {
  const res = await axios.get<NominatimResult[]>('https://nominatim.openstreetmap.org/search', {
    params: { q: city, format: 'json', limit: 1 },
    headers: { 'User-Agent': 'business-pipeline/1.0 (rainesstudio71@gmail.com)' },
    timeout: 10_000,
  });

  if (!res.data.length) throw new Error(`Could not geocode city: ${city}`);

  const [minlat, maxlat, minlon, maxlon] = res.data[0].boundingbox.map(Number);
  logger.info(`Bounding box for ${city}: ${minlat},${minlon} → ${maxlat},${maxlon}`);
  return [minlat, maxlat, minlon, maxlon];
}

/** Build an Overpass QL query using a bounding box. */
function buildBboxQuery(
  tags: Array<[string, string]>,
  bbox: [number, number, number, number],
  limit: number,
): string {
  const [minlat, maxlat, minlon, maxlon] = bbox;
  const bboxStr = `${minlat},${minlon},${maxlat},${maxlon}`;

  const filters = tags.map(([key, value]) => `
  node["${key}"="${value}"][!"website"]["name"](${bboxStr});
  way["${key}"="${value}"][!"website"]["name"](${bboxStr});`).join('');

  return `[out:json][timeout:30];(${filters});out body center ${limit * 4};`;
}

/** Format address from OSM tags. */
function formatAddress(tags: Record<string, string>, city: string): string {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'],
    tags['addr:city'] ?? city,
  ].filter(Boolean);
  return parts.length > 1 ? parts.join(', ') : city;
}

/**
 * Search OpenStreetMap via the Overpass API for businesses without websites.
 * No API key required. Uses Nominatim for geocoding the city bounding box.
 */
export async function findBusinesses(
  niche: string,
  city: string,
  limit = config.dailyLimit,
): Promise<BusinessListing[]> {
  logger.info(`Searching OpenStreetMap for "${niche}" in ${city}...`);

  const contacted = loadContacted();

  // Step 1: Get city bounding box
  const bbox = await getCityBbox(city);

  // Step 2: Build tag filters
  const tags = NICHE_MAP[niche.toLowerCase()] ?? [['amenity', niche], ['shop', niche]];

  // Step 3: Query Overpass
  const query = buildBboxQuery(tags, bbox, limit);
  const res = await axios.post(
    'https://overpass-api.de/api/interpreter',
    query,
    { headers: { 'Content-Type': 'text/plain' }, timeout: 40_000 },
  );

  const elements: OverpassElement[] = res.data?.elements ?? [];
  logger.info(`Overpass returned ${elements.length} raw results for "${niche}" in ${city}.`);

  const seen = new Set<string>();
  const results: BusinessListing[] = [];

  for (const el of elements) {
    if (results.length >= limit) break;

    const tags = el.tags ?? {};
    const name = tags.name;
    if (!name) continue;

    const placeId = `osm-${el.type}-${el.id}`;
    if (contacted.has(placeId)) continue;

    const address = formatAddress(tags, city);
    const key = `${name.toLowerCase()}|${address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      placeId,
      name,
      address,
      phone: tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile'] ?? '',
      rating: 0,
      photoReference: null,
      category: tags.amenity ?? tags.shop ?? tags.craft ?? tags.leisure ?? niche,
      website: null,
    });
  }

  logger.info(`Found ${results.length} businesses without websites.`);
  return results;
}
