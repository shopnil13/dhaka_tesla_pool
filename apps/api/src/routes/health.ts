import { Router } from 'express';
import { pgPool } from '../db/client';

export const healthRouter = Router();

// Used by Docker and Render: 200 only when the API can actually reach Postgres.
healthRouter.get('/health', async (req, res) => {
  const uptimeSeconds = Math.round(process.uptime());
  try {
    await pgPool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', uptimeSeconds });
  } catch (err) {
    req.log.warn({ err }, 'Health check: database unreachable');
    res.status(503).json({ status: 'degraded', db: 'down', uptimeSeconds });
  }
});
