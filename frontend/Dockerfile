# syntax=docker/dockerfile:1.7

FROM node:24.8.0-alpine3.22

RUN corepack enable

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ .yarn/

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --immutable

COPY . .

EXPOSE 5173

CMD ["yarn", "dev", "--host", "0.0.0.0"]
