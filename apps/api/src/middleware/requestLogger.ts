import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger';

const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

// One id per request, reused from an upstream proxy when it sends a sane
// one, echoed back in the response and attached to every log line.
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Docker and Render probe /health every few seconds; keep it out of the logs.
  autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
});
