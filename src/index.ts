/**
 * Entry point — starts the Express webhook server and the nightly cron scheduler
 * in the same Node.js process.
 *
 * Run with: npm start
 */
import { logger } from './utils/logger';

// Validate all required env vars before anything else
import './utils/config';

import { startServer } from './server/index';
import { startScheduler } from './scheduler/cron';

async function main(): Promise<void> {
  logger.info('Starting automated website business pipeline...');

  // Start the webhook server (handles Resend inbound replies)
  startServer();

  // Register the nightly 2am cron job
  startScheduler();

  logger.info('System is live. Webhook server + cron scheduler running.');
  logger.info('To trigger a manual run, call runPipeline() from scheduler/cron.ts');
}

main().catch((err: Error) => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
