# syntax=docker/dockerfile:1.7
FROM node:20-alpine

# 1) Enable Corepack so Yarn Berry works without a global install
RUN corepack enable

WORKDIR /app

# 2) Copy only the files Yarn needs to resolve deps (better caching)
# Make sure you commit Yarn Berry bits: .yarnrc.yml and the .yarn/ folder
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ .yarn/

# 3) Install deps (immutable = lockfile must match, fails if drift)
# Use BuildKit cache for speed on rebuilds (optional but nice)
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --immutable

# 4) Copy the rest of the app
COPY . .

# 5) Expose Vite dev server
EXPOSE 5173

# 6) Run Vite in container; --host makes it listen on 0.0.0.0
CMD ["yarn", "dev", "--host", "0.0.0.0"]
