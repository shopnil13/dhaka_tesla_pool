# syntax=docker/dockerfile:1
# Build context: the repository root (npm workspaces share one lockfile).

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @teslapool/web

# The /api rewrite target is resolved at build time, so it is a build argument.
ARG API_URL=http://api:4000
ENV API_URL=${API_URL}
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace @teslapool/web

# --- runtime: Next.js standalone server only (no node_modules tree, no sources) ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
