# syntax=docker/dockerfile:1.14

# Build context: repository root (required so prod stage can access caddy/prod/)
# CI: context: .        dockerfile: ./frontend/Dockerfile
# Dev: context: .        dockerfile: ./frontend/Dockerfile  target: dev

# ============================================================
# Stage: deps — install node_modules (shared by dev + build)
# ============================================================
# Pin by digest for reproducible builds. To update, run:
#   docker pull node:24.8.0-bookworm-slim && docker inspect --format='{{index .RepoDigests 0}}' node:24.8.0-bookworm-slim
FROM node:24.13.1-bookworm-slim@sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2 AS deps

RUN corepack enable

WORKDIR /app

COPY frontend/package.json frontend/yarn.lock frontend/.yarnrc.yml ./
COPY frontend/public_pages/package.json ./public_pages/package.json
COPY frontend/.yarn/ .yarn/

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --immutable --check-cache

# ============================================================
# Stage: dev — hot-reload dev servers (unchanged from before)
# ============================================================
FROM deps AS dev

COPY frontend/ .

EXPOSE 5173
EXPOSE 5174

CMD ["/bin/sh", "-c", "/app/dev-start.sh"]

# ============================================================
# Stage: build — compile production assets
# ============================================================
FROM deps AS build

COPY frontend/ .
COPY shared/ /shared/

# VAPID public key — injected at build time for push notifications
ARG VITE_VAPID_PUBLIC
ENV VITE_VAPID_PUBLIC=${VITE_VAPID_PUBLIC}

# Generate TypeScript types from shared YAML (Yarn 4 skips pre* hooks)
RUN yarn generate:types

# Build SPA (outputs to dist/)
RUN yarn build

# ============================================================
# Stage: prod — tiny Caddy image serving static files
# ============================================================
# Pin by digest for reproducible builds. To update, run:
#   docker pull caddy:2-alpine && docker inspect --format='{{index .RepoDigests 0}}' caddy:2-alpine
FROM caddy:2-alpine@sha256:834468128c7696cec0ceea6172f7d692daf645ae51983ca76e39da54a97c570d AS prod

# Copy production Caddyfile (created in Step 1.2)
COPY caddy/prod/Caddyfile /etc/caddy/Caddyfile

# Copy built assets from the build stage
COPY --from=build /app/dist /srv/app

# Run as non-root
USER nobody

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:80/", "||", "exit", "1"]
