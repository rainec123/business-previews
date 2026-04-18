import express, { Request, Response, NextFunction } from 'express';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { handleReplyWebhook } from '../webhook/replyHandler';

const app = express();

// Parse JSON bodies — needed for Resend webhooks
app.use(express.json({ limit: '5mb' }));

// ─── Routes ────────────────────────────────────────────────────────────────────

/** Health check endpoint */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/** Resend inbound / reply webhook */
app.post('/webhook/reply', async (req: Request, res: Response) => {
  await handleReplyWebhook(req, res);
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled server error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

export function startServer(): void {
  app.listen(config.port, () => {
    logger.info(`Webhook server running on port ${config.port}`);
    logger.info(`Health: http://localhost:${config.port}/health`);
    logger.info(`Webhook: POST http://localhost:${config.port}/webhook/reply`);
  });
}

export { app };
