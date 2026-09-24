import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { healthRouter } from './routes/health';

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp() {
  const app = express();

  app.use(requestLogger);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/v1', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
