# Public pages

The public pages are marketing/landing pages served at `quill-medical.com`. They are built separately from the clinical React SPA and deployed to a GCS bucket behind the Global HTTPS Load Balancer, allowing content updates without clinical release gates.

## Architecture

```
frontend/
├── public_pages/          ← Separate Vite workspace
│   ├── package.json       ← "public-pages" workspace (no runtime deps)
│   ├── vite.config.ts     ← Multi-page Vite build
│   ├── tsconfig.json      ← Extends parent tsconfig
│   ├── templates/
│   │   └── page.html      ← HTML shell template
│   ├── scripts/
│   │   └── generate-pages.cjs  ← Generates HTML from TSX
│   └── src/pages/
│       ├── index.tsx       ← Home page
│       ├── features.tsx    ← Features page
│       ├── not-found.tsx   ← 404 page
│       └── storybook-test.tsx  ← Component demo
├── src/
│   ├── theme.ts            ← Shared Mantine theme
│   └── components/
│       └── public-layout/  ← PublicLayout wrapper
└── public/                 ← Shared static assets (logo, favicon)
```

### How it differs from the clinical app

| Aspect          | Clinical app (`frontend/src/`) | Public pages (`frontend/public_pages/`)        |
| --------------- | ------------------------------ | ---------------------------------------------- |
| Routing         | React Router SPA               | Multi-page — each page is a separate HTML file |
| Deployment      | Cloud Run container via Caddy  | GCS bucket with CDN                            |
| Authentication  | Required (JWT cookies)         | None                                           |
| Release process | DCB0129 clinical sign-off      | Update anytime                                 |
| Domain          | `staging.quill-medical.com`    | `quill-medical.com`                            |

### Shared code

Public pages import components and the Mantine theme from the parent workspace via path aliases (`@/components/...`, `@/theme`). To avoid dual-context errors where React or Mantine resolves from a separate `node_modules`, the Vite config forces shared packages to resolve from the parent:

```typescript
// vite.config.ts — resolve aliases
resolve: {
  alias: {
    "@": path.resolve(__dirname, "../src"),
    react: path.resolve(__dirname, "../node_modules/react"),
    "react-dom": path.resolve(__dirname, "../node_modules/react-dom"),
    "@mantine/core": path.resolve(__dirname, "../node_modules/@mantine/core"),
    "@mantine/hooks": path.resolve(__dirname, "../node_modules/@mantine/hooks"),
  },
}
```

The `public-pages` workspace has **no runtime dependencies** in its `package.json` — only dev dependencies (Vite, chokidar, etc.). This prevents Yarn from installing duplicate copies of React/Mantine.

## Page generation (`pages:gen`)

Each TSX file in `src/pages/` is a standalone React entry point, not a route. The `pages:gen` script (`scripts/generate-pages.cjs`) auto-generates an HTML shell for each:

1. Scans `src/pages/` for `.tsx` files
2. Reads `templates/page.html` as a template
3. Generates a title from the filename (e.g. `features` → "Features", `not-found` → "Not Found")
4. Writes an HTML file with the correct `<script>` entry point

**When it runs:**

- `yarn workspace public-pages dev` — runs once, then watches for new/renamed TSX files
- `yarn workspace public-pages build` — runs once before Vite build

**Example:** Creating `src/pages/pricing.tsx` automatically generates `pricing.html` with:

```html
<title>Pricing</title>
<script type="module" src="/src/pages/pricing.tsx"></script>
```

You must also add the new page to `rollupOptions.input` in `vite.config.ts` for production builds.

## Adding a new page

1. Create `frontend/public_pages/src/pages/my-page.tsx`:

   ```tsx
   import PublicLayout from "@/components/layouts/PublicLayout";
   import { theme } from "@/theme";
   import { Container, MantineProvider, Title } from "@mantine/core";
   import "@mantine/core/styles.css";
   import { createRoot } from "react-dom/client";

   createRoot(document.getElementById("root")!).render(
     <MantineProvider theme={theme} defaultColorScheme="light">
       <PublicLayout>
         <Container size="lg" py="xl">
           <Title order={1}>My page</Title>
         </Container>
       </PublicLayout>
     </MantineProvider>,
   );
   ```

2. Add the entry to `vite.config.ts` → `build.rollupOptions.input`:

   ```typescript
   input: {
     // ... existing entries
     "my-page": path.resolve(__dirname, "my-page.html"),
   },
   ```

3. Run `just pup` — the HTML file is generated automatically and the dev server opens.

## PublicLayout

All public pages use `PublicLayout` from `@/components/layouts/PublicLayout.tsx`. It provides:

- **Header** — Quill logo (links to `/`) and "Sign in" link (links to `/login`)
- **Main content** area (flex-grows to fill viewport)
- **Footer** — Copyright notice

Props:

| Prop         | Type        | Default                  | Description      |
| ------------ | ----------- | ------------------------ | ---------------- |
| `children`   | `ReactNode` | required                 | Page content     |
| `signInUrl`  | `string`    | `"/login"`               | Sign-in link URL |
| `footerText` | `string`    | `© {year} Quill Medical` | Footer text      |

## Local development

```bash
just pup          # Start dev server (alias for public-pages)
```

This runs `yarn workspace public-pages dev`, which:

1. Generates HTML files from TSX pages
2. Starts a chokidar watcher for new/renamed TSX files
3. Opens Vite dev server at `http://localhost:5173`

Navigation between pages uses full page loads (anchor tags), not client-side routing.

### Dev-mode 404 handling

The Vite config includes a `vite:dev-404` plugin that intercepts requests for non-existent pages and serves `not-found.html` with a 404 status code, matching production behaviour.

## Deployment

### CI workflow

The `public-site.yml` workflow triggers on pushes to `main` that change:

- `frontend/public_pages/**`
- `frontend/public/**` (shared static assets)
- `frontend/src/components/**` (shared components)
- `frontend/src/theme.ts`
- `frontend/src/styles/**`

**Pipeline:**

1. **Build** — `yarn workspace public-pages build` → outputs to `frontend/dist/public_pages/`
2. **Deploy staging** — syncs to `{staging-project}-landing` GCS bucket
3. **Deploy production** — syncs to `{prod-project}-landing` GCS bucket

### Cache strategy

| File type                                     | Cache-Control                         | Reason                                   |
| --------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| Hashed assets (`assets/*.js`, `assets/*.css`) | `public, max-age=31536000, immutable` | Filename hash changes on content change  |
| HTML files (`*.html`)                         | `no-cache`                            | Always revalidate to pick up new deploys |

### Infrastructure

The GCS landing bucket sits behind the Global HTTPS Load Balancer (managed by Terraform):

- **SSL** — Google-managed certificate covering `quill-medical.com` and `www.quill-medical.com`
- **CDN** — Enabled on the backend bucket for edge caching
- **404 page** — Load balancer serves `not-found.html` for missing paths
- **Cloud Armor** — WAF with rate limiting (500 req/min per IP)

### DNS

| Record                  | Type  | Value               |
| ----------------------- | ----- | ------------------- |
| `quill-medical.com`     | A     | Staging LB IP       |
| `www.quill-medical.com` | CNAME | `quill-medical.com` |
