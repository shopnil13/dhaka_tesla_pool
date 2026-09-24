import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';

const server = createApp().listen(env.PORT, (err) => {
  if (err) {
    logger.fatal({ err }, 'API failed to start');
    process.exit(1);
  }
  logger.info({ port: env.PORT }, 'Tesla Pool API listening');
});

// Let in-flight requests finish when Docker/Render stops the container.
function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'Shutting down');
  server.close((err) => process.exit(err ? 1 : 0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
