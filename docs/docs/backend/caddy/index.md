# Caddy web server

**Last updated:** 25 May 2026

Caddy is our reverse proxy, handling path-based routing in development and serving the production SPA with security headers. Three Caddyfiles exist for different environments.

## Configuration files

| File | Environment | Purpose |
|------|-------------|---------|
| `caddy/dev/Caddyfile` | Local Docker Compose | Routes to backend, frontend dev server, and EHRbase |
| `caddy/prod/Caddyfile` | Production (Cloud Run) | Serves built SPA with security headers and health check |
| `caddy/ci/Caddyfile` | E2E testing | Routes API to backend, SPA to frontend prod container |

## Development (`caddy/dev/Caddyfile`)

Caddy listens on port 80 and reverse-proxies to local Docker services:

```caddyfile
:80 {
  encode zstd gzip

  # API requests → backend
  @api path /api/*
  handle @api {
    reverse_proxy backend:8000
  }

  # EHRbase requests → ehrbase
  @ehrbase path /ehrbase/*
  handle @ehrbase {
    reverse_proxy ehrbase:8080
  }

  # PWA manifest with correct MIME type
  @webmanifest path /*.webmanifest
  header @webmanifest Content-Type "application/manifest+json"
  header @webmanifest Cache-Control "no-cache"

  # SPA served at /
  handle {
    reverse_proxy frontend:5173
  }
}
```

### Routing

| Path | Destination | Service |
|------|-------------|---------|
| `/api/*` | `backend:8000` | FastAPI |
| `/ehrbase/*` | `ehrbase:8080` | OpenEHR server |
| `/*.webmanifest` | Headers applied | PWA manifest |
| `/*` | `frontend:5173` | Vite dev server |

## Production (`caddy/prod/Caddyfile`)

In production, the **GCP Global HTTPS Load Balancer** handles:

- TLS termination (Google-managed certificate)
- Path routing: `/api/*` → backend Cloud Run, `/*` → frontend Cloud Run
- Cloud Armor WAF + rate limiting
- HTTP → HTTPS redirect

Caddy runs inside the frontend container on port 8080 (Cloud Run strips `cap_net_bind_service`, preventing non-root users from binding to :80). It serves the built React SPA with security headers:

```caddyfile
{
  admin off
}

:8080 {
  encode zstd gzip

  # Security headers
  header {
    Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://storage.googleapis.com; font-src 'self'; connect-src 'self'; frame-src 'self' https://www.youtube.com; frame-ancestors 'none'"
    X-Frame-Options "DENY"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }

  # Health check for Cloud Run container probes
  handle /healthz {
    respond "ok" 200
  }

  # PWA manifest
  @webmanifest path /*.webmanifest
  header @webmanifest Content-Type "application/manifest+json"
  header @webmanifest Cache-Control "no-cache"

  # SPA — React app
  handle {
    root * /srv/app

    # Static assets with hashed filenames — cache aggressively (1 year)
    @hashed path_regexp \.[-a-zA-Z0-9]{8,}\.(js|css|woff2?|png|jpg|svg|ico)$
    header @hashed Cache-Control "public, max-age=31536000, immutable"

    # HTML and non-hashed files — always revalidate
    @html path *.html /
    header @html Cache-Control "no-cache"

    try_files {path} /index.html
    file_server
  }
}
```

### Key production features

- **`admin off`** — disables the Caddy admin API (not needed in Cloud Run)
- **Security headers** — HSTS (2 years, preload), CSP, X-Frame-Options DENY, nosniff, referrer policy, permissions policy, server header removal
- **`/healthz`** — returns `200 ok` for Cloud Run startup/liveness probes
- **Cache strategy** — hashed assets get 1 year immutable cache; HTML always revalidates
- **`try_files`** — SPA fallback to `index.html` for client-side routing

## CI (`caddy/ci/Caddyfile`)

Used in E2E tests. Routes API to backend and everything else to the frontend production container (which runs its own Caddy serving static files):

```caddyfile
{
  admin off
}

:80 {
  # API requests → backend
  @api path /api/*
  handle @api {
    reverse_proxy backend:8000
  }

  # SPA → frontend (prod Caddy container serving static files)
  handle {
    reverse_proxy frontend:8080
  }
}
```

## Architecture

### Development

```
Browser → Caddy (:80) → backend:8000 (/api/*)
                       → ehrbase:8080 (/ehrbase/*)
                       → frontend:5173 (everything else)
```

### Production

```
Browser → GCP HTTPS LB → backend Cloud Run (/api/*)
                        → frontend Cloud Run (:8080) → Caddy → static SPA
```

### CI (E2E tests)

```
Playwright → Caddy (:80) → backend:8000 (/api/*)
                          → frontend:8080 (prod Caddy, static SPA)
```

## CORS

CORS is handled by the FastAPI backend middleware (`CORSMiddleware`), not by Caddy.

## Notes

- FHIR and EHRbase are **not** publicly exposed in production — they run on a private VPC and are accessed only by the backend
- Request logging is not currently configured in any Caddyfile
- Let's Encrypt is not used — GCP manages TLS certificates at the load balancer level
