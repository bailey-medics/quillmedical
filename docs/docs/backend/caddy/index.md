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
# Development configuration
localhost:8080

# Reverse proxy to FastAPI backend
reverse_proxy /api/* http://backend:8000

# Reverse proxy to FHIR server
reverse_proxy /fhir/* http://hapi-fhir:8080

# Serve frontend static files
file_server
root * /srv
try_files {path} /index.html
```

### Architecture Role

Caddy sits at the edge of our application stack:

```
Client Browser
      ↓
   Caddy (Port 80/443)
      ↓
      ├→ FastAPI Backend (Port 8000) - /api/*
      ├→ FHIR Server (Port 8080)     - /fhir/*
      ├→ OpenEHR Server (Port 8080)  - /ehrbase/*
      └→ Frontend Static Files       - /*
```

## Key Features in Use

### Reverse Proxy

Caddy forwards requests to backend services:

```caddyfile
# API endpoints
reverse_proxy /api/* http://backend:8000 {
    # Preserve original headers
    header_up Host {host}
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
}

# FHIR server
reverse_proxy /fhir/* http://hapi-fhir:8080 {
    # Strip /fhir prefix before forwarding
    rewrite * /fhir{path}
}
```

### Static File Serving

Serves the React TypeScript frontend:

```caddyfile
# Serve static files
file_server
root * /srv

# SPA fallback - all routes serve index.html
try_files {path} /index.html
```

### CORS Handling

Manages Cross-Origin Resource Sharing:

```caddyfile
@api path /api/*
handle @api {
    header {
        Access-Control-Allow-Origin *
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Authorization"
    }
    reverse_proxy http://backend:8000
}
```

### Request Logging

Logs all incoming requests:

```caddyfile
log {
    output stdout
    format json
    level INFO
}
```

## Development vs Production

### Development Configuration

`caddy/dev/Caddyfile`:

```caddyfile
# No HTTPS in development
localhost:8080

# Detailed logging
log {
    level DEBUG
}

# Direct proxying to local services
reverse_proxy /api/* http://localhost:8000
```

### Production Configuration

Production would use:

```caddyfile
# Automatic HTTPS
quillmedical.com {
    # API backend
    reverse_proxy /api/* http://backend:8000

    # FHIR server (internal only, not exposed)
    # reverse_proxy /fhir/* http://fhir:8080

    # Frontend
    root * /srv
    file_server
    try_files {path} /index.html

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
    }

    # Gzip compression
    encode gzip
}
```

## Routing Strategy

### API Routes (`/api/*`)

Forwarded to FastAPI backend:

- `/api/auth/login` → Backend authentication
- `/api/patients` → Backend patient endpoints
- `/api/push/*` → Backend push notifications

### FHIR Routes (`/fhir/*`)

Direct access to FHIR server (typically internal only):

- `/fhir/Patient` → FHIR Patient resources
- `/fhir/Observation` → FHIR Observations

**Note**: In production, FHIR should not be publicly exposed. Access only through backend API.

### Frontend Routes (`/*`)

Serves React SPA:

- `/` → Frontend app
- `/patients` → Handled by React Router
- `/login` → Handled by React Router
- All unmatched routes → `index.html` (SPA fallback)

### Static Assets

Served directly with caching:

- `/assets/*` → JavaScript, CSS, images
- `/manifest.webmanifest` → PWA manifest
- `/sw.js` → Service worker

## Performance Optimizations

### Compression

```caddyfile
# Gzip compression for text content
encode gzip {
    match {
        header Content-Type text/*
        header Content-Type application/json
        header Content-Type application/javascript
    }
}
```

### Caching Headers

```caddyfile
# Cache static assets
@static path /assets/*
handle @static {
    header Cache-Control "public, max-age=31536000, immutable"
    file_server
}

# No cache for HTML (SPA)
handle {
    header Cache-Control "no-cache, no-store, must-revalidate"
    file_server
}
```

### Connection Pooling

Caddy automatically manages connection pools to upstream services for better performance.

## Security Features

### Automatic HTTPS

- Certificates from Let's Encrypt
- Automatic renewal 30 days before expiration
- HTTP → HTTPS redirect
- Modern TLS configuration (TLS 1.2+)

### Security Headers

```caddyfile
header {
    # Prevent clickjacking
    X-Frame-Options "DENY"

    # Prevent MIME sniffing
    X-Content-Type-Options "nosniff"

    # Enable XSS protection
    X-XSS-Protection "1; mode=block"

    # HSTS for HTTPS only
    Strict-Transport-Security "max-age=31536000; includeSubDomains"

    # Content Security Policy
    Content-Security-Policy "default-src 'self'"
}
```

### Rate Limiting

```caddyfile
# Limit request rate to prevent abuse
rate_limit {
    zone dynamic {
        key {remote_host}
        events 100
        window 1m
    }
}
```

## Docker Integration

In `compose.dev.yml`:

```yaml
caddy:
  image: caddy:2-alpine
  ports:
    - "8080:8080"
  volumes:
    - ./caddy/dev/Caddyfile:/etc/caddy/Caddyfile:ro
    - ./frontend/dist:/srv:ro
  depends_on:
    - backend
    - hapi-fhir
```

## Monitoring & Debugging

### Access Logs

```caddyfile
log {
    output file /var/log/caddy/access.log
    format json {
        time_format iso8601
    }
}
```

### Admin API

Caddy provides an admin API (default port 2019):

```bash
# Get current configuration
curl http://localhost:2019/config/

# Reload configuration
curl -X POST http://localhost:2019/load \
  -H "Content-Type: application/json" \
  -d @config.json
```

### Health Checks

```caddyfile
# Health check endpoint
handle /health {
    respond "OK" 200
}
```

## Common Tasks

### Reload Configuration

```bash
# Graceful reload (no downtime)
caddy reload --config /etc/caddy/Caddyfile
```

### View Logs

```bash
# In Docker
docker compose logs caddy

# Follow logs
docker compose logs -f caddy
```

### Test Configuration

```bash
# Validate Caddyfile syntax
caddy validate --config /etc/caddy/Caddyfile
```

## Resources

- [Caddy Official Documentation](https://caddyserver.com/docs/)
- [Caddyfile Reference](https://caddyserver.com/docs/caddyfile)
- [Caddy Docker Image](https://hub.docker.com/_/caddy)
- [Let's Encrypt](https://letsencrypt.org/)
