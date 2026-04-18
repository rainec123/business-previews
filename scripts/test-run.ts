/**
 * Test run script — processes exactly ONE business through the full pipeline
 * so you can verify every step works before going live.
 *
 * Usage: npm run test-run
 *
 * Optional env overrides:
 *   TARGET_NICHE=cafe TARGET_CITY=Wellington npm run test-run
 */
import '../src/utils/config'; // validate env vars first
import { logger } from '../src/utils/logger';
import { findBusinesses } from '../src/pipeline/findBusinesses';
import { scrapeInfo } from '../src/pipeline/scrapeInfo';
import { researchBusiness } from '../src/pipeline/researchBusiness';
import { generateSite } from '../src/pipeline/generateSite';
import { deploySite } from '../src/pipeline/deploySite';
import { findEmail } from '../src/pipeline/findEmail';
import { config } from '../src/utils/config';
import fs from 'fs';
import path from 'path';

async function testRun(): Promise<void> {
  logger.info('=== TEST RUN STARTING ===');
  logger.info(`Niche: ${config.targetNiche} | City: ${config.targetCity}`);

  // Step 1: Find one business
  logger.info('\n[1/6] Searching for businesses...');
  const businesses = await findBusinesses(config.targetNiche, config.targetCity, 1);

  if (!businesses.length) {
    logger.warn('No businesses found without websites. Try a different niche or city.');
    logger.info('Tip: set TARGET_NICHE and TARGET_CITY in your .env');
    return;
  }

  const b = businesses[0];
  logger.info(`Found: ${b.name} (${b.address})`);

  // Step 2: Build place detail from listing
  logger.info('\n[2/6] Building place details...');
  const detail = await scrapeInfo(b.placeId, b);
  logger.info(`Details: ${detail.phone} | ${detail.openingHours.length} hours entries | ${detail.photos.length} photos`);

  // Step 3: Research business
  logger.info('\n[3/6] Researching business (social + search)...');
  const enriched = await researchBusiness(detail, config.targetCity);
  logger.info(`Vibe: ${enriched.vibeKeywords.join(', ')}`);
  logger.info(`Instagram: ${enriched.instagramHandle ?? 'not found'}`);
  logger.info(`Services: ${enriched.services.join(', ')}`);

  // Step 4: Generate site
  logger.info('\n[4/6] Generating preview site via Claude...');
  const html = await generateSite(enriched);
  logger.info(`Generated ${html.length} characters of HTML`);

  // Save the HTML locally for inspection
  const previewFile = path.join(process.cwd(), 'data', 'test-preview.html');
  fs.mkdirSync(path.dirname(previewFile), { recursive: true });
  fs.writeFileSync(previewFile, html);
  logger.info(`HTML saved to: ${previewFile}`);
  logger.info('Open it in your browser to review the design before deploying.');

  // Step 5: Deploy to Vercel
  logger.info('\n[5/6] Deploying to Vercel...');
  let previewUrl = '(deployment skipped)';
  try {
    previewUrl = await deploySite(b.name, html);
    logger.info(`Live at: ${previewUrl}`);
  } catch (err) {
    logger.warn(`Vercel deployment failed: ${(err as Error).message}`);
    logger.warn('Check VERCEL_TOKEN and VERCEL_PROJECT_NAME in your .env');
  }

  // Step 6: Find email (read-only — won't send)
  logger.info('\n[6/6] Looking up email via Apollo...');
  const contact = await findEmail(b.name, config.targetCity);
  if (contact) {
    logger.info(`Email found: ${contact.email} (${contact.firstName ?? 'no first name'})`);
    logger.info('Email NOT sent in test mode. To send, use the live pipeline.');
  } else {
    logger.info('No email found for this business.');
  }

  // Summary
  logger.info('\n=== TEST RUN COMPLETE ===');
  logger.info(`Business: ${b.name}`);
  logger.info(`Preview URL: ${previewUrl}`);
  logger.info(`Email: ${contact?.email ?? 'not found'}`);
  logger.info(`HTML preview: ${previewFile}`);
}

testRun().catch((err: Error) => {
  logger.error(`Test run failed: ${err.message}`);
  logger.error(err.stack ?? '');
  process.exit(1);
});
