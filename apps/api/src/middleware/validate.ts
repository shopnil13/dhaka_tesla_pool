import type { RequestHandler } from 'express';
import type { z } from 'zod';

/**
 * Parses the JSON body with a shared Zod schema. The parsed value (trimmed,
 * lower-cased, defaulted) replaces req.body, so handlers only ever see valid
 * input. A ZodError becomes a 400 in the error handler.
 */
export const validateBody =
  (schema: z.ZodType): RequestHandler =>
  (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
