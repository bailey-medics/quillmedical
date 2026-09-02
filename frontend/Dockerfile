# syntax=docker/dockerfile:1.14

# Build context: repository root (required so prod stage can access caddy/prod/)
# CI: context: .        dockerfile: ./frontend/Dockerfile
# Dev: context: .        dockerfile: ./frontend/Dockerfile  target: dev

# ============================================================
# Stage: deps — install node_modules (shared by dev + build)
# ============================================================
# Pin by digest for reproducible builds. To update, run:
#   docker pull node:24.13.0-bookworm-slim && docker inspect --format='{{index .RepoDigests 0}}' node:24.13.0-bookworm-slim
FROM node:24.13.1-bookworm-slim@sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2 AS deps

RUN corepack enable

# Trust the Claude Code on the web egress proxy when its CA is mounted at build
# time. That proxy re-terminates TLS, so without it Corepack cannot fetch Yarn
# and every registry request fails with SELF_SIGNED_CERT_IN_CHAIN. Node ignores
# the system trust store, so the certificate is named directly through
# NODE_EXTRA_CA_CERTS. The secret is mounted only by compose.web.yml, so this
# is a no-op for local and CI builds and no certificate reaches a published
# image.
RUN --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then \
        cp /run/secrets/proxy_ca /usr/local/share/ca-certificates/proxy-ca.crt \
        && printf 'export NODE_EXTRA_CA_CERTS=%s\n' \
            /usr/local/share/ca-certificates/proxy-ca.crt > /etc/proxy-ca.env; \
    fi

WORKDIR /app

COPY frontend/package.json frontend/yarn.lock frontend/.yarnrc.yml ./
COPY frontend/public_pages/package.json ./public_pages/package.json

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    if [ -f /etc/proxy-ca.env ]; then . /etc/proxy-ca.env; fi; \
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

# Feature flag — disables clinical services UI for teaching-only environments
ARG VITE_CLINICAL_SERVICES_ENABLED=true
ENV VITE_CLINICAL_SERVICES_ENABLED=${VITE_CLINICAL_SERVICES_ENABLED}

# Generate TypeScript types from shared YAML (Yarn 4 skips pre* hooks)
RUN yarn generate:types

# Build SPA (outputs to dist/)
RUN yarn build

# ============================================================
# Stage: prod — tiny Caddy image serving static files
# ============================================================
# Pin by digest for reproducible builds. To update, run:
#   docker pull caddy:2-alpine && docker inspect --format='{{index .RepoDigests 0}}' caddy:2-alpine
FROM caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 AS prod

# Copy production Caddyfile (created in Step 1.2)
COPY caddy/prod/Caddyfile /etc/caddy/Caddyfile

# Copy built assets from the build stage
COPY --from=build /app/dist /srv/app

# Run as non-root
USER nobody

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1
