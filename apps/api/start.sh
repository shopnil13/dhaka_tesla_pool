#!/bin/sh
# Container start for single-service hosts (Render): there is no separate
# migrate step like docker-compose's, and pre-deploy commands are paid-only,
# so apply pending migrations and the idempotent seed before the server.
# `exec` makes node PID 1, so it receives SIGTERM and shuts down gracefully.
set -e
node dist/migrate.js
node dist/seed.js
exec node dist/server.js
