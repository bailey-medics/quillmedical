# Copilot Instructions for Quill Medical

See also [specs.md](specs.md) and [roadmap.md](roadmap.md) for high-level project context.

## Architecture Overview

Quill Medical is a full-stack clinical messaging platform with a multi-database healthcare standards architecture:

- **Backend**: FastAPI (Python 3.13) with Poetry for dependency management
- **Frontend**: React 19 + Vite + TypeScript with Mantine UI, served under `/app/`
- **Databases**: PostgreSQL (auth/app state), HAPI FHIR (patient demographics), EHRbase (clinical documents/letters in OpenEHR format)
- **Reverse Proxy**: Caddy routes `/api/*` → backend:8000, `/app/*` → frontend:5173, `/ehrbase/*` → ehrbase:8080
- **Containerised**: Docker Compose orchestrates 6 services (backend, frontend, database, fhir, ehrbase, caddy)

## Critical Developer Workflows

### Start development environment
```bash
just start-dev      # Normal start
just start-dev b    # Rebuild images & volumes
```
Access frontend at `http://localhost:5173` or `http://$(ipconfig getifaddr en0)` for mobile testing.

### Database migrations (Alembic)
```bash
just migrate "description"  # Auto-generate and apply migration
```
Migrations run inside `quill_backend` container. Exclude alembic versions from formatting (see `backend/pyproject.toml`).

### Testing
```bash
just unit-tests-backend   # pytest in backend/tests
just unit-tests-frontend  # vitest in frontend
```
Backend tests require minimal env vars (see `backend/tests/conftest.py`). Frontend uses jsdom environment.

### User management
```bash
just create-user  # Interactive user creation in container
```

## Project-Specific Conventions

### Language and Spelling
- **British English**: All documentation, comments, commit messages, and user-facing text must use British English spelling (e.g., "organise" not "organize", "colour" not "color", "behaviour" not "behavior")
- **Code identifiers**: Where possible and appropriate, use British English in function names, variable names, class names, and other identifiers (e.g., `get_patient_colour()`, `OrganisationSettings`)
- **Exceptions**: External APIs, third-party library conventions, and established technical terms that use American English should be preserved (e.g., `color` in CSS properties, `Authorization` HTTP headers)

### Backend (FastAPI)
- **Strict typing**: `mypy --strict` enabled, all functions require type annotations
- **Security**: JWT tokens (15min access, 7d refresh) + optional TOTP 2FA using `pyotp`. Argon2 for password hashing.
- **API prefix**: All routes under `/api` (see `backend/app/config.py`)
- **Authentication flow**: Login → JWT in HTTP-only cookies → auto-refresh on 401 → CSRF tokens using `itsdangerous`
- **Settings**: Use `pydantic-settings` with `SecretStr` for sensitive values. Docker Compose injects env vars.
- **SQLAlchemy 2.0 style**: Use `Mapped` type hints, `DeclarativeBase`, eager loading for roles (`backend/app/models.py`)

### Frontend (React + TypeScript)
- **API client**: Centralised in `frontend/src/lib/api.ts` with auto-retry on 401, JSON-only, credentials included
- **Auth context**: `frontend/src/auth/AuthContext.tsx` wraps app, provides `state`, `login`, `logout`, `reload`
- **Routing**: React Router with `basename` from `import.meta.env.BASE_URL` to support `/app/` proxy mount
- **Protected routes**: Use `<RequireAuth>` wrapper, guests use `<GuestOnly>` (redirects authenticated users)
- **Styling**: Mantine 8.3 + CSS modules, no inline styles
- **Testing**: Vitest with `@testing-library/react`, prefer `user-event` for interactions
- **Linting**: ESLint with React/TypeScript rules, no secrets plugin, unicorn, regexp plugins enabled

### Healthcare Integration
- **FHIR**: Use `fhirclient` library (`backend/app/fhir_client.py`). Patient demographics stored as FHIR Patient resources.
- **OpenEHR**: Raw HTTP requests to EHRbase (`backend/app/ehrbase_client.py`). Letters stored as Compositions.
- **EHR creation**: Each FHIR patient gets corresponding EHR in EHRbase with `subject_id` linking them.

### Docker & Justfile
- **Justfile aliases**: Single-letter shortcuts (e.g., `just sd` → `start-dev`, `just d` → `docs`)
- **Container names**: Prefixed with `quill_` (e.g., `quill_backend`, `quill_frontend`)
- **Terminal descriptions**: `just` recipes update terminal window title with task name
- **Poetry**: Lock/install on host, then rebuild container for new deps (`just pi` → `just start-dev b`)
- **Yarn workspaces**: `public_pages` is a sub-workspace for marketing pages (separate from SPA)

## Common Patterns

### Adding a new API endpoint
1. Define route in `backend/app/main.py` under `@router` (auto-prefixed with `/api`)
2. Add Pydantic schemas in `backend/app/schemas/`
3. Use `DEP_GET_SESSION` for DB access, `get_current_user_from_jwt` for auth
4. Update OpenAPI: `just docs` → regenerates Swagger UI

### Frontend API call
```typescript
import { api } from '@/lib/api';
const patients = await api.get<PatientList>('/patients');
await api.post('/auth/login', { username, password });
```
Never use raw `fetch` — always use `api` helper for consistent error handling & auth.

### Database models
- Define in `backend/app/models.py` using SQLAlchemy 2.0 declarative
- Run `just migrate "add X column"` to auto-generate Alembic revision
- Many-to-many: Use association tables (e.g., `user_role`)

## Key Files & Directories
- `SPEC.md`: Business logic, workflows, data model (patient messaging, letters, billing)
- `compose.dev.yml`: Full stack configuration including healthchecks
- `Justfile`: All dev commands with descriptions (`just --list`)
- `backend/app/main.py`: FastAPI app & all routes
- `frontend/src/main.tsx`: React app entry point with router
- `caddy/dev/Caddyfile`: Routing rules for dev reverse proxy

## Security Notes
- **Never log PHI**: Patient health information must not appear in logs, errors, or notifications
- **Role-based access**: Enforce at both DB and application level
- **Secrets**: Use `SecretStr` in backend settings, never commit `.env` files
- **Audit trail**: All clinical actions should be logged to append-only audit table (future implementation)

## Documentation & Markdown Conventions
- **Headings**: Always use proper markdown heading syntax (`#`, `##`, `###`, etc.) - never use bold text as headings
- **Heading levels**: Use appropriate hierarchy (h1 for title, h2 for main sections, h3 for subsections, h4 for detailed sections)
- **No trailing punctuation**: Headings should not end with punctuation (colons, periods, etc.) to comply with MD026
- **Email addresses**: Always wrap email addresses in angle brackets `<email@example.com>` to avoid MD034 bare URL errors
- **Lint compliance**: Follow markdown linting rules to avoid MD036 (emphasis-as-heading), MD026 (trailing-punctuation), and MD034 (bare-urls) errors
- **Structure**: Use semantic HTML-like structure in markdown for better accessibility and readability

````
