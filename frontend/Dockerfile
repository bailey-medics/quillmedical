# syntax=docker/dockerfile:1.7

# ============================================================
# Stage: deps — install node_modules (shared by dev + build)
# ============================================================
# Pin by digest for reproducible builds. To update, run:
#   docker pull node:24.8.0-bookworm-slim && docker inspect --format='{{index .RepoDigests 0}}' node:24.8.0-bookworm-slim
FROM node:24.8.0-bookworm-slim@sha256:cadbfafeb6baf87eaaffa40b3640209c4b7fd38cebde65059d15bc39cd636b85 AS deps

RUN corepack enable

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY public_pages/package.json ./public_pages/package.json
COPY .yarn/ .yarn/

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --immutable --check-cache

# ============================================================
# Stage: dev — hot-reload dev servers (unchanged from before)
# ============================================================
FROM deps AS dev

COPY . .

EXPOSE 5173
EXPOSE 5174

CMD ["/bin/sh", "-c", "/app/dev-start.sh"]

# ============================================================
# Stage: build — compile production assets
# ============================================================
FROM deps AS build

COPY . .

# Build SPA (outputs to dist/) and public pages (outputs to dist/public_pages/)
RUN yarn build && yarn workspace public_pages build

# ============================================================
# Stage: prod — tiny Caddy image serving static files
# ============================================================
# Pin by digest for reproducible builds. To update, run:
#   docker pull caddy:2-alpine && docker inspect --format='{{index .RepoDigests 0}}' caddy:2-alpine
FROM caddy:2-alpine@sha256:fce4f15aad23222c0ac78a1220adf63bae7b94355d5ea28eee53910624acedfa AS prod

# Copy production Caddyfile (created in Step 1.2)
COPY caddy/prod/Caddyfile /etc/caddy/Caddyfile

# Copy built assets from the build stage
COPY --from=build /app/dist /srv/app
COPY --from=build /app/dist/public_pages /srv/public_pages

# Run as non-root
USER nobody

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:80/app/", "||", "exit", "1"]
