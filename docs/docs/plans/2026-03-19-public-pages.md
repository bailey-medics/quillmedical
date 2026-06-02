# Public pages separation plan

## Goal

Separate the public marketing site from the clinical application so they are independently deployable on different domains:

| Domain                                        | Content                                          | Deployment                   |
| --------------------------------------------- | ------------------------------------------------ | ---------------------------- |
| `quill-medical.com` / `www.quill-medical.com` | Public landing site (marketing, features, about) | GCS bucket behind staging LB |
| `staging.quill-medical.com`                   | React app at `/` (no `/app/` prefix)             | Cloud Run (staging)          |
| `teaching.quill-medical.com`                  | React app at `/` (no `/app/` prefix)             | Cloud Run (teaching)         |
| `app.quill-medical.com`                       | React app at `/` (no `/app/` prefix)             | Cloud Run (production)       |

## Current state

The frontend Docker container serves **both** the public pages and the React app via a single Caddy instance:

- `/` → public pages from `/srv/public_pages` (built by `public_pages/` Yarn workspace)
- `/app/` → React SPA from `/srv/app` (Caddy strips `/app` prefix, Vite `base: "/app/"`)
- `/api/*` → routed by the GCP load balancer to the backend Cloud Run service

The React app has `/app/` baked in at three levels:

1. **Vite** — `base: "/app/"` in `vite.config.ts`
2. **React Router** — `basename` derived from `import.meta.env.BASE_URL`
3. **Caddy** — `handle /app/*` with `uri strip_prefix /app`

The `public_pages/` Vite build currently only outputs `index.html` — other pages (`features.html`, `not-found.html`) are missing from the production build because `rollupOptions.input` is not configured.

## Desired state

### Public site (`quill-medical.com`)

- Served from a **GCS bucket** behind the staging load balancer (same as the current landing page setup)
- Built from the `public_pages/` workspace — same shared components, same Mantine theme
- Fully static HTML/CSS/JS — no server needed
- Independently deployable (updating marketing content doesn't touch the clinical app)

### Clinical app (subdomains)

- React app served at **`/`** instead of `/app/`
- The frontend Docker container **only** contains the React app — no public pages
- Caddy config simplifies to a single SPA handler
- `/api/*` routing unchanged (handled by GCP load balancer)

## Plan

### Phase 1 — Fix public pages build and share theme

**Goal:** Make the current setup work properly before separating.

1. **Fix Vite multi-page build** — add `rollupOptions.input` to `public_pages/vite.config.ts` listing all HTML entry points (`index.html`, `features.html`, `not-found.html`)
2. **Share Mantine theme** — extract the app's theme config to a shared file (e.g. `frontend/src/theme.ts`), import it in both the main app's `MantineProvider` and each public page's `MantineProvider`
3. **Create a `PublicLayout` component** — lightweight wrapper with consistent header (logo + "Sign in" link) and footer, used by all public pages. Add stories and tests
4. **Verify** — build and test that all public pages work locally (`yarn workspace public-pages build && yarn workspace public-pages preview`)

### Phase 2 — Move the React app from `/app/` to `/`

**Goal:** Remove the `/app/` prefix from the clinical application.

1. **Vite config** — change `base` from `"/app/"` to `"/"`
2. **Caddy prod config** — remove the `/app/*` handler with `uri strip_prefix`, replace with a simple root SPA handler at `/`:

   ```text
   handle {
     root * /srv/app
     try_files {path} /index.html
     file_server
   }
   ```

3. **Caddy dev config** — change `handle /app*` to `handle` for the SPA, remove the public pages proxy (port 5174)
4. **Remove public pages from Docker build** — remove `yarn workspace public-pages build` from the Dockerfile `RUN` step, remove the `COPY --from=build /app/dist/public_pages /srv/public_pages` layer
5. **Update health check** — change `HEALTHCHECK` from `/app/` to `/`
6. **Update all internal links** — any hardcoded `/app/` references (API client login redirect, public pages "Sign in" button, etc.)
7. **Update `compose.dev.yml`** — dev server ports and routing
8. **Test** — verify SPA routing, auth redirects, API calls, deep linking all work at `/`

### Phase 3 — Deploy public pages to GCS

**Goal:** Serve the public site from a GCS bucket, independently from the app.

1. **Create a GCS bucket** in the staging project (e.g. `quill-medical-public-site`) — Terraform managed
2. **CI workflow** — add a job to the docs or a new `public-site.yml` workflow that:
   - Builds `public_pages/` with Vite
   - Uploads the `dist/public_pages/` output to the GCS bucket via `gsutil rsync`
   - Only triggers on changes to `frontend/public_pages/**` or `frontend/src/components/**` (shared components) or `frontend/src/theme.ts`
3. **Load balancer routing** — the staging LB already routes `quill-medical.com` to a backend bucket. Update the bucket source to point to the new `quill-medical-public-site` bucket
4. **Configure `www.quill-medical.com`** — add a DNS CNAME or A record pointing to the staging LB, add the domain to the SSL certificate
5. **404 handling** — configure the GCS bucket's `notFoundPage` to serve `not-found.html`
6. **Cache headers** — set appropriate `Cache-Control` metadata on GCS objects (hashed assets: 1 year, HTML: no-cache)

### Phase 4 — Update DNS and remove old routing

**Goal:** Clean up the old combined routing.

1. **Remove public pages from the frontend Caddy config** — the `handle` block serving `/srv/public_pages` is no longer needed
2. **Update the prod Caddyfile** — only serves the SPA at `/` and the health check
3. **Remove the `public_pages` workspace from the frontend Docker build** — it's now built and deployed separately
4. **Update `.github/copilot-instructions.md`** — document the new architecture, update path aliases and routing notes
5. **Update `docs/docs/infrastructure/gcp.md`** — document the public site GCS bucket and routing

## Architecture after completion

```
quill-medical.com (www)          staging/teaching/app.quill-medical.com
        │                                      │
   GCP Load Balancer                    GCP Load Balancer
        │                              ┌───────┴───────┐
   GCS Bucket                          │               │
   (static site)                  /* → Frontend    /api/* → Backend
                                  Cloud Run        Cloud Run
                                  (Caddy + SPA)    (FastAPI)
```

### What stays shared

- **Mantine theme** — single source of truth at `frontend/src/theme.ts`
- **UI components** — public pages import from `frontend/src/components/` (Storybook catalogue)
- **Yarn workspace** — `public_pages/` remains a workspace in `frontend/package.json` for shared dependencies and path aliases

### What becomes independent

- **Build** — public pages have their own CI job, deploy to GCS
- **Deploy** — marketing site updates don't trigger Cloud Run deploys
- **Routing** — no more `/app/` prefix; each domain serves one thing

## Risks and mitigations

| Risk                                           | Mitigation                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Shared component changes breaking public pages | Public pages CI triggers on `frontend/src/components/**` changes                 |
| GCS bucket publicly accessible                 | Bucket is behind the LB, not directly exposed. Use IAM to restrict direct access |
| Theme drift between app and public site        | Single `theme.ts` file imported by both, enforced by shared workspace            |

## Files affected

| File                                            | Change                                               |
| ----------------------------------------------- | ---------------------------------------------------- |
| `frontend/vite.config.ts`                       | Change `base` from `"/app/"` to `"/"`                |
| `frontend/public_pages/vite.config.ts`          | Add `rollupOptions.input` for all pages              |
| `frontend/src/main.tsx`                         | Basename logic simplifies (always `/`)               |
| `frontend/src/lib/api.ts`                       | Login redirect path simplifies                       |
| `frontend/Dockerfile`                           | Remove public_pages build and copy                   |
| `caddy/prod/Caddyfile`                          | Remove `/app/*` handler, simplify to SPA at `/`      |
| `caddy/dev/Caddyfile`                           | Remove public_pages proxy, SPA at `/`                |
| `compose.dev.yml`                               | Remove public_pages dev server port                  |
| `frontend/public_pages/src/pages/index.tsx`     | "Sign in" link changes from `/app/` to subdomain URL |
| `infra/main.tf`                                 | Add GCS bucket for public site                       |
| `infra/modules/load-balancer/main.tf`           | Update backend bucket config                         |
| `.github/workflows/public-site.yml`             | New workflow for public site deploys                 |
| `.github/workflows/deploy-staging-teaching.yml` | No longer builds public pages                        |
| `.github/copilot-instructions.md`               | Update routing and architecture docs                 |
