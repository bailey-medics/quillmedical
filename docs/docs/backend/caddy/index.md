# Caddy Web Server

## Overview

Caddy is a powerful, enterprise-ready web server with automatic HTTPS. In Quill Medical, Caddy serves as our reverse proxy, handling incoming HTTP/HTTPS requests and routing them to the appropriate backend services (FastAPI, FHIR, OpenEHR, frontend).

## Why Caddy?

### Automatic HTTPS

- **Zero Configuration**: Automatically obtains and renews TLS certificates from Let's Encrypt
- **Always Secure**: HTTPS is the default, not an afterthought
- **No Manual Renewal**: Certificates are renewed automatically before expiration
- **Modern Security**: Uses secure defaults and modern TLS configurations

### Simple Configuration

- **Caddyfile**: Human-readable configuration format
- **No Complex Syntax**: Much simpler than nginx or Apache configurations
- **Sensible Defaults**: Works out of the box with minimal configuration
- **Hot Reloading**: Configuration changes applied without downtime

### Modern Architecture

- **HTTP/2 & HTTP/3**: Native support for modern protocols
- **WebSockets**: Built-in WebSocket proxying
- **Reverse Proxy**: Powerful reverse proxy capabilities
- **Load Balancing**: Built-in load balancing and health checks

### Developer Experience

- **Written in Go**: Fast, single binary, no dependencies
- **Easy Deployment**: Single binary makes deployment trivial
- **Excellent Documentation**: Clear, comprehensive documentation
- **Active Development**: Regular updates and improvements

## Our Implementation

### Configuration Structure

Our Caddy configuration is in `caddy/dev/Caddyfile`:

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

### Architecture Role

Caddy sits at the edge of our application stack:

```
Client Browser
      ↓
   Caddy (Port 80)
      ↓
      ├→ FastAPI Backend (Port 8000)    - /api/*
      ├→ EHRbase Server (Port 8080)     - /ehrbase/*
      └→ Frontend SPA (Port 5173)       - /* (Vite dev server)
```

## Key Features in Use

### Reverse Proxy

Caddy forwards requests to backend services based on path matching, as shown in the [Caddyfile above](#our-implementation). In production, the GCP Global HTTPS Load Balancer handles path-based routing (`/api/*` → backend, `/*` → frontend), so Caddy only serves static files and a health check endpoint.

> **Note:** The config snippets below are illustrative Caddy examples showing capabilities we intend to implement. The actual dev and production Caddyfiles are simpler — see [Our Implementation](#our-implementation) above for the real config. Updating these sections is tracked in the [project to-do list](../../plans/todo.md#caddy-documentation).

### Static File Serving

In production, Caddy serves the built React SPA from `/srv/app`:

```caddyfile
root * /srv/app
file_server
try_files {path} /index.html
```

### CORS Handling

CORS is handled by the FastAPI backend middleware, not by Caddy. The backend uses `CORSMiddleware` with configurable `CORS_ORIGINS`.

### Request Logging

Currently not configured in either Caddyfile. To be added when needed.

## Development vs Production

### Development

In development (`caddy/dev/Caddyfile`), Caddy listens on port 80 and reverse-proxies to local Docker services (backend on 8000, frontend Vite dev server on 5173, EHRbase on 8080).

### Production

In production (`caddy/prod/Caddyfile`), the GCP Global HTTPS Load Balancer handles TLS termination, path routing, and Cloud Armor WAF. Caddy runs inside the frontend container on port 80 and serves:

- Security headers (HSTS, CSP, X-Frame-Options, etc.)
- A `/healthz` health check endpoint for Cloud Run probes
- The built React SPA with `try_files` fallback to `index.html`

## Routing Strategy

### Development (Caddy handles routing)

| Path pattern | Destination          | Purpose             |
| ------------ | -------------------- | ------------------- |
| `/api/*`     | Backend (port 8000)  | FastAPI application |
| `/ehrbase/*` | EHRbase (port 8080)  | OpenEHR server      |
| `/*`         | Frontend (port 5173) | Vite dev server     |

### Production (Load Balancer handles routing)

In production, the GCP Global HTTPS Load Balancer performs path-based routing before traffic reaches Caddy:

| Path pattern | Destination        | Purpose                       |
| ------------ | ------------------ | ----------------------------- |
| `/api/*`     | Backend Cloud Run  | FastAPI application           |
| `/*`         | Frontend Cloud Run | Caddy serves static SPA files |

FHIR and EHRbase are not publicly exposed — they run on a private VPC and are accessed only by the backend.

## Security Features

In production, Caddy enforces security headers on all responses. See the [cybersecurity documentation](../../cybersecurity/index.md#http-security-headers) for the full header list.

Key headers: HSTS (2 years, preload), CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, and Server header removal.

## Resources

- [Caddy Official Documentation](https://caddyserver.com/docs/)
- [Caddyfile Reference](https://caddyserver.com/docs/caddyfile)
- [Caddy Docker Image](https://hub.docker.com/_/caddy)
- [Let's Encrypt](https://letsencrypt.org/)
