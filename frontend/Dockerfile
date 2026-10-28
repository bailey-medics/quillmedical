# syntax=mirror.gcr.io/docker/dockerfile:1.27@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# The Dockerfile syntax image, which BuildKit downloads before it reads
# anything below. From Google's mirror of Docker Hub and not Docker Hub
# itself, which rate limits and at times cannot be reached at all.
#
# CI builds with this repository's own copy instead, handed over as the
# BUILDKIT_SYNTAX build argument, because Google's mirror refused it with
# 429 Too Many Requests on 28 October 2026. This line is read before any
# ARG, so that argument is the only way to change it. Pinned by digest so
# the copy cannot fall behind it. See
# .github/scripts/ci/use-mirrored-base-images.sh.

# Build context: repository root (required so prod stage can access caddy/prod/)
# CI: context: .        dockerfile: ./frontend/Dockerfile
# Dev: context: .        dockerfile: ./frontend/Dockerfile  target: dev

# ============================================================
# Stage: deps - install node_modules (shared by dev + build)
# ============================================================
# Pin by digest for reproducible builds. To update, run:
#   docker pull node:26.12.1-bookworm-slim && docker inspect --format='{{index .RepoDigests 0}}' node:26.12.1-bookworm-slim
#
# Both base images are named in ARGs, here before the first FROM so that
# every stage can read them, and not in the FROM lines, so that CI can
# build on its own copies. See the same lines in backend/Dockerfile.
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:26.12.1-bookworm-slim@sha256:88e480776c6149ff1d098cd304f44bf18057fb5d284a3329b78162d29821e28c
ARG CADDY_IMAGE=public.ecr.aws/docker/library/caddy:2-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b

FROM ${NODE_IMAGE} AS deps

# Node 25 stopped shipping corepack, so it comes from npm, pinned.
RUN npm install -g corepack@0.36.0 && corepack enable

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
# Stage: public-build - the public site, quill-medical.com
# ============================================================
# For the end-to-end stack only. In production the public site is built
# by public-site.yml and served from Cloud Storage, not from an image.
# Its own stage beside `build`, so the app's image is unchanged.
FROM deps AS public-build
COPY frontend/ .
COPY shared/ /shared/
RUN yarn workspace public-pages build

# ============================================================
# Stage: public-ci - Caddy serving the public site to the tests
# ============================================================
# Kept above `prod` so that `prod` stays the last stage, the one a build
# with no target would make.
FROM ${CADDY_IMAGE} AS public-ci
COPY caddy/public-ci/Caddyfile /etc/caddy/Caddyfile
COPY --from=public-build /app/dist/public_pages /srv/public
USER nobody
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8081/ || exit 1

# ============================================================
# Stage: prod - tiny Caddy image serving static files
# ============================================================
# Pin by digest for reproducible builds. To update, run:
#   docker pull caddy:2-alpine && docker inspect --format='{{index .RepoDigests 0}}' caddy:2-alpine
# The image itself is the CADDY_IMAGE ARG at the top of this file.
FROM ${CADDY_IMAGE} AS prod

# Copy production Caddyfile (created in Step 1.2)
COPY caddy/prod/Caddyfile /etc/caddy/Caddyfile

# Copy built assets from the build stage
COPY --from=build /app/dist /srv/app

# Run as non-root
USER nobody

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1
