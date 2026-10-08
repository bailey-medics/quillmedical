# syntax=docker/dockerfile:1.27

# Build context: repository root (required so prod stage can access caddy/prod/)
# CI: context: .        dockerfile: ./frontend/Dockerfile
# Dev: context: .        dockerfile: ./frontend/Dockerfile  target: dev

# ============================================================
# Stage: deps - install node_modules (shared by dev + build)
# ============================================================
# Pin by digest for reproducible builds. To update, run:
#   docker pull node:24.13.0-bookworm-slim && docker inspect --format='{{index .RepoDigests 0}}' node:24.13.0-bookworm-slim
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS deps

RUN corepack enable

WORKDIR /app

COPY frontend/package.json frontend/yarn.lock frontend/.yarnrc.yml ./
COPY frontend/public_pages/package.json ./public_pages/package.json

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --immutable --check-cache

# ============================================================
# Stage: dev - hot-reload dev servers (unchanged from before)
# ============================================================
FROM deps AS dev

COPY frontend/ .

EXPOSE 5173
EXPOSE 5174

CMD ["/bin/sh", "-c", "/app/dev-start.sh"]

# ============================================================
# Stage: build - compile production assets
# ============================================================
FROM deps AS build

COPY frontend/ .
COPY shared/ /shared/

# VAPID public key - injected at build time for push notifications
ARG VITE_VAPID_PUBLIC
ENV VITE_VAPID_PUBLIC=${VITE_VAPID_PUBLIC}

# Feature flag - disables clinical services UI for teaching-only environments
ARG VITE_CLINICAL_SERVICES_ENABLED=true
ENV VITE_CLINICAL_SERVICES_ENABLED=${VITE_CLINICAL_SERVICES_ENABLED}

# Build identifier, reported with client errors so a fault can be tied to the
# deploy that produced it. The build context is `COPY frontend/ .` with no
# `.git`, so vite.config.ts cannot read the revision itself and falls back to
# "dev" - deploy.yml passes the real commit in.
ARG VITE_APP_VERSION
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

# Build SPA (outputs to dist/). The build script generates the JSON from
# the shared YAML first, by name: Yarn 4 does not run pre* hooks.
RUN yarn build

# ============================================================
# Stage: prod - tiny Caddy image serving static files
# ============================================================
# Pin by digest for reproducible builds. To update, run:
#   docker pull caddy:2-alpine && docker inspect --format='{{index .RepoDigests 0}}' caddy:2-alpine
FROM caddy:2-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b AS prod

# Copy production Caddyfile (created in Step 1.2)
COPY caddy/prod/Caddyfile /etc/caddy/Caddyfile

# Copy built assets from the build stage
COPY --from=build /app/dist /srv/app

# Run as non-root
USER nobody

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1
