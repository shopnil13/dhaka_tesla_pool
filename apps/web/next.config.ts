import path from 'node:path';
import type { NextConfig } from 'next';

// The browser only ever talks to this Next.js server. /api/* is proxied to the
// Express API, so the session cookie stays first-party and no CORS is needed.
// Rewrites are resolved at build time: API_URL must be set when building.
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // Minimal self-contained server for the Docker image. Tracing starts at the
  // monorepo root so the shared workspace package is included.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // The shared package ships TypeScript source; Next compiles it with the app.
  transpilePackages: ['@teslapool/shared'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
