# syntax=docker/dockerfile:1.7

FROM node:24.8.0-bookworm-slim


RUN corepack enable

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY public_pages/package.json ./public_pages/package.json
COPY .yarn/ .yarn/


RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --immutable --check-cache

COPY . .

EXPOSE 5173
EXPOSE 5174

CMD ["/bin/sh", "-c", "/app/dev-start.sh"]
