import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { requireJsonBody } from './middleware/security';
import { createAuthRouter } from './modules/auth/auth.routes';
import { faresRouter } from './modules/fares/fares.routes';
import { zonesRouter } from './modules/zones/zones.routes';
import { healthRouter } from './routes/health';

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // No CORS middleware on purpose: browsers reach the API only through the
  // same-origin Next.js proxy, so cross-origin reads stay blocked by default.
  app.use(requestLogger);
  app.use(helmet());
  app.use(requireJsonBody);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/v1', healthRouter);
  app.use('/api/v1', createAuthRouter());
  app.use('/api/v1', zonesRouter);
  app.use('/api/v1', faresRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
