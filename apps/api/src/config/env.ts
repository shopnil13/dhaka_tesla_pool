import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN_HOURS: z.coerce.number().int().positive().default(12),
  // true in production (HTTPS only); false locally where the app runs on plain http.
  COOKIE_SECURE: z.stringbool().default(false),
  // Proxies in front of the API whose X-Forwarded-For we trust (to see the real
  // client IP): 0 = none, 1 = the Next.js proxy, 2 = Vercel + Render's router.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  // Login/register attempts per IP per 15 minutes.
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof envSchema>;

// Fail fast: a server with bad configuration should refuse to start
// instead of failing later on the first request that needs the value.
function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const env = loadEnv();
