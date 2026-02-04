# Database Architecture Update

## Overview

Quill Medical has updated its database structure from a single shared database to three separate databases. This improves security, performance, and makes the system easier to maintain.

## What Changed

### Before

- One database container storing everything
- All data (user accounts, patient information, clinical letters) in one place
- Single point of failure

### After

- **User database**: Stores login credentials and application settings
- **Patient database**: Stores patient demographics via FHIR
- **Clinical database**: Stores clinical documents via OpenEHR

## Why Three Databases?

### Better Security

- Different data types are isolated from each other
- A security issue in one area doesn't affect the others
- Different access permissions for different data

### Better Performance

- Each database can be optimised for its specific data type
- Different resource allocations based on usage patterns
- Easier to scale individual components

### Easier Maintenance

- Updates can be applied to one database without affecting others
- Backup and restore operations are more flexible
- Troubleshooting is simpler

## Database Configuration

### Environment Variables

The following new environment variables are required in `backend/.env`:

```bash
# Auth Database
AUTH_DB_NAME=quill_auth
AUTH_DB_USER=auth_user
AUTH_DB_PASSWORD=[secure password]
AUTH_DB_HOST=postgres-auth
AUTH_DB_PORT=5432

# FHIR Database
FHIR_DB_NAME=hapi
FHIR_DB_USER=hapi_user
FHIR_DB_PASSWORD=[secure password]
FHIR_DB_HOST=postgres-fhir
FHIR_DB_PORT=5432

# EHRbase Database
EHRBASE_DB_NAME=ehrbase
EHRBASE_DB_USER=ehrbase_user
EHRBASE_DB_PASSWORD=[secure password]
EHRBASE_DB_HOST=postgres-ehrbase
EHRBASE_DB_PORT=5432

# EHRbase API Credentials (separate from DB)
EHRBASE_API_USER=ehrbase_user
EHRBASE_API_PASSWORD=[API password]
EHRBASE_API_ADMIN_USER=ehrbase_admin
EHRBASE_API_ADMIN_PASSWORD=[admin password]
```

### Legacy Variables (Deprecated)

These variables are no longer used:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `DATABASE_URL` (now auto-computed as `AUTH_DATABASE_URL`)
- `EHRBASE_USER` (replaced with `EHRBASE_API_USER`)
- `EHRBASE_PASSWORD` (replaced with `EHRBASE_API_PASSWORD`)

## Backend Code Changes

### Configuration Module

[backend/app/config.py](backend/app/config.py) now includes:

```python
from app.config import settings

# Computed database URLs
settings.AUTH_DATABASE_URL      # Auth database connection
settings.FHIR_DATABASE_URL      # FHIR database connection (future use)
settings.EHRBASE_DATABASE_URL   # EHRbase database connection (future use)

# Service URLs
settings.FHIR_SERVER_URL        # HAPI FHIR API
settings.EHRBASE_URL            # EHRbase API
```

### Database Module

New structure at `backend/app/db/`:

```python
from app.db import get_auth_db, auth_engine, AuthBase

# Use in FastAPI routes
@router.get("/users")
def list_users(db: Session = Depends(get_auth_db)):
    users = db.query(User).all()
    return users
```

The old `app.db` module still works for backwards compatibility but imports from the new structure.

## Docker Compose Changes

### Service Dependencies

Services now depend on specific databases:

- **backend**: Depends on all three databases
- **fhir**: Depends only on `postgres-fhir`
- **ehrbase**: Depends only on `postgres-ehrbase`

### Resource Allocation

Each database has independent resource limits:

- **postgres-auth**: 1 CPU, 1GB RAM
- **postgres-fhir**: 2 CPU, 2GB RAM
- **postgres-ehrbase**: 2 CPU, 3GB RAM

## Migration Steps

### Initial Setup

1. Stop existing containers:

   ```bash
   docker compose -f compose.dev.yml down -v
   ```

2. Update `backend/.env` with new database credentials

3. Start new services:

   ```bash
   docker compose -f compose.dev.yml up -d
   ```

4. Verify all health checks pass:

   ```bash
   docker compose -f compose.dev.yml ps
   ```

### Database Migration

Run Alembic migrations for the auth database:

```bash
just migrate "migrate to three database architecture"
```

## Benefits

✅ **Security**: Isolated credentials per database - compromise of one doesn't affect others
✅ **Performance**: Independent resource allocation and scaling per service
✅ **Compliance**: Clear data boundaries for healthcare audit requirements
✅ **Resilience**: Failure in one database doesn't impact others
✅ **Enterprise-ready**: Professional architecture suitable for NHS deployment

## Troubleshooting

### Connection Errors

If you see "could not connect to database" errors:

1. Check environment variables are set correctly
2. Verify database containers are healthy: `docker compose ps`
3. Check logs: `docker compose logs postgres-auth`

### Legacy Code

If existing code references old variables:

- Replace `settings.DATABASE_URL` with `settings.AUTH_DATABASE_URL`
- Replace `EHRBASE_USER` with `EHRBASE_API_USER`
- Import from `app.db` instead of `app.db.py`

## Further Reading

- [Backend Architecture](../backend/index.md)
- [Database Configuration](../backend/fastapi/index.md)
- [FHIR Integration](../backend/fhir/index.md)
- [OpenEHR Integration](../backend/openehr/index.md)
