import cron from 'node-cron';
import { config } from '../utils/config';
import { logger, sleep } from '../utils/logger';
import { findBusinesses, markContacted } from '../pipeline/findBusinesses';
import { scrapeInfo } from '../pipeline/scrapeInfo';
import { researchBusiness } from '../pipeline/researchBusiness';
import { generateSite } from '../pipeline/generateSite';
import { deploySite } from '../pipeline/deploySite';
import { findEmail } from '../pipeline/findEmail';
import { sendEmail, alreadySent } from '../pipeline/sendEmail';
import { logBusiness } from '../pipeline/logToSheets';
import { notifyRunSummary, notifyAlert } from '../webhook/telegramNotify';
import { checkGmailReplies } from '../pipeline/checkReplies';

// ─── Pipeline orchestration ───────────────────────────────────────────────────

/**
 * Run the full pipeline for one niche + city.
 * Each business is processed sequentially with a 2s delay to respect rate limits.
 */
export async function runPipeline(
  niche = config.targetNiche,
  city = config.targetCity,
): Promise<void> {
  const startTime = Date.now();
  logger.info(`=== Pipeline run starting: "${niche}" in ${city} ===`);

  const summary = {
    found: 0,
    emailsSent: 0,
    skippedNoEmail: 0,
    errors: 0,
  };

  // ── Step 1: Find businesses ────────────────────────────────────────────────
  let businesses;
  try {
    businesses = await findBusinesses(niche, city, config.dailyLimit);
    summary.found = businesses.length;
  } catch (err) {
    const msg = (err as Error).message;
    logger.error(`findBusinesses failed: ${msg}`);
    await notifyAlert(`Pipeline failed during business discovery: ${msg}`);
    return;
  }

  if (!businesses.length) {
    logger.info('No new businesses found — run complete.');
    await notifyRunSummary({ ...summary, durationSeconds: 0 });
    return;
  }

  // ── Step 2: Process each business ─────────────────────────────────────────
  for (const business of businesses) {
    logger.info(`\n── Processing: ${business.name} ──`);

    try {
      // Skip if already sent (belt and suspenders check)
      if (alreadySent(business.placeId)) {
        logger.info(`Already contacted — skipping.`);
        continue;
      }

      // 2a. Build place detail from listing data (OSM-based, no extra API call)
      const placeDetail = await scrapeInfo(business.placeId, business);
      await sleep(500);

      // 2b. Enrich with social + search data
      const enriched = await researchBusiness(placeDetail, city);
      await sleep(500);

      // 2c. Generate the preview website via Claude
      const html = await generateSite(enriched);
      await sleep(500);

      // 2d. Deploy to Vercel
      const previewUrl = await deploySite(business.name, html);
      await sleep(1000);

      // 2e. Find email
      const contactResult = await findEmail(business.name, city);

      // 2f. Send email (if found)
      let emailSent = false;
      if (contactResult) {
        emailSent = await sendEmail(enriched, contactResult, previewUrl);
        if (emailSent) summary.emailsSent++;
      } else {
        summary.skippedNoEmail++;
      }

      // 2g. Log to Google Sheets
      await logBusiness({
        businessName: business.name,
        city,
        category: enriched.subcategory,
        phone: enriched.phone,
        rating: enriched.rating,
        previewUrl,
        emailFound: !!contactResult,
        emailSent,
        status: emailSent ? 'EMAIL_SENT' : 'NO_EMAIL',
      });

      // Mark as contacted regardless (to avoid regenerating their site tomorrow)
      markContacted(business.placeId);

      logger.info(`✓ Done: ${business.name}`);
    } catch (err) {
      summary.errors++;
      logger.error(`Error processing "${business.name}": ${(err as Error).message}`);
      // Continue to next business
    }

    // Polite delay between businesses
    await sleep(2000);
  }

  // ── Step 3: Summary notification ──────────────────────────────────────────
  const durationSeconds = Math.round((Date.now() - startTime) / 1000);
  logger.info(`\n=== Pipeline complete in ${durationSeconds}s ===`);
  logger.info(`Found: ${summary.found} | Sent: ${summary.emailsSent} | Skipped: ${summary.skippedNoEmail} | Errors: ${summary.errors}`);

  await notifyRunSummary({ ...summary, durationSeconds });
}

// ─── Cron scheduler ──────────────────────────────────────────────────────────

/**
 * Schedule the pipeline to run at 2:00 AM every day.
 * The server and cron both run in the same process (see src/index.ts).
 */
export function startScheduler(): void {
  // '0 2 * * *' = every day at 2:00 AM (server local time)
  // Check Gmail for replies every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await checkGmailReplies();
    } catch (err) {
      logger.error(`Reply check error: ${(err as Error).message}`);
    }
  });
  logger.info('Reply polling scheduled every 5 minutes.');

  // '0 2 * * *' = every day at 2:00 AM (server local time)
  cron.schedule('0 2 * * *', async () => {
    logger.info('Cron triggered — starting nightly pipeline run...');
    try {
      await runPipeline();
    } catch (err) {
      logger.error(`Unhandled pipeline error: ${(err as Error).message}`);
      await notifyAlert(`Nightly pipeline crashed: ${(err as Error).message}`);
    }
  });

  logger.info('Nightly cron scheduled for 02:00 AM.');
}
