# syntax=docker/dockerfile:1
# Build context: the repository root (npm workspaces share one lockfile).

FROM node:22-alpine AS base
WORKDIR /app
# Every workspace manifest is copied so `npm ci` can validate the shared lockfile.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# --- build: all dependencies, then bundle with tsup ---
FROM base AS build
RUN npm ci --workspace @teslapool/api
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @teslapool/api

# --- production dependencies only ---
FROM base AS prod-deps
RUN npm ci --workspace @teslapool/api --omit=dev \
  && mkdir -p apps/api/node_modules

# --- runtime: no compilers, no dev dependencies, non-root ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/package.json ./apps/api/
COPY apps/api/migrations ./apps/api/migrations
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
