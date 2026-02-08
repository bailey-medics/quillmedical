# Copilot Instructions for Quill Medical

See [specs.md](./specs.md), [roadmap.md](./roadmap.md) and [architecture.md](./architecture.md) for detailed context.

## Stack Overview

- **Backend**: FastAPI (Python 3.13), Poetry, PostgreSQL auth DB
- **Frontend**: React 19 + TypeScript + Vite + Mantine UI at `/app/`
- **Healthcare**: HAPI FHIR (demographics), EHRbase (clinical letters)
- **Infrastructure**: Docker Compose, Caddy reverse proxy

## Key Commands

```bash
just start-dev      # Start (or 'just start-dev b' to rebuild)
just migrate "msg"  # Database migration
just unit-tests-backend / just unit-tests-frontend
just create-user    # Interactive user creation
```

## Testing Requirements

- **ALWAYS create/update tests** when changing code
- Backend: pytest with fixtures from `conftest.py`
- Frontend: vitest + @testing-library/react with `renderWithMantine`/`renderWithRouter`
- Cover: props variations, edge cases, null/undefined, interactions, loading/error states
- Run tests before completing work

## Conventions

### Language

- **British English** for all docs, comments, UI text, and code identifiers where appropriate
- Exceptions: External APIs, libraries, CSS properties, HTTP headers

### Backend (FastAPI)

- **mypy --strict**: All functions require explicit type annotations
- **SQLAlchemy 2.0**: Use `Mapped[Type]` type hints, `DeclarativeBase`
- **Security**: JWT in HTTP-only cookies (15min access, 7d refresh), TOTP 2FA, Argon2 passwords, CSRF via `itsdangerous`
- **Settings**: `pydantic-settings` with `SecretStr`, env vars via Docker Compose
- **API**: All routes under `/api`, use `DEP_GET_SESSION` for DB, `get_current_user_from_jwt` for auth

### Frontend (React + TypeScript)

- **API**: Use `frontend/src/lib/api.ts` client (auto-retry on 401, never raw `fetch`)
- **Auth**: `AuthContext.tsx` provides `state`, `login`, `logout`, `reload`
- **Routing**: React Router with `basename` from `import.meta.env.BASE_URL` for `/app/` mount
- **Protection**: `<RequireAuth>` for authenticated routes, `<GuestOnly>` for login/register
- **Styling**: Mantine 8.3 + CSS modules, no inline styles
- **Testing**: Use `renderWithMantine` or `renderWithRouter` from `@test/test-utils`
- **Storybook**: Components with `.stories.tsx` MUST have `.test.tsx`

### Healthcare

- **FHIR**: `fhirclient` library (`backend/app/fhir_client.py`) for patient demographics
- **OpenEHR**: HTTP requests to EHRbase (`backend/app/ehrbase_client.py`) for clinical letters
- Each FHIR patient gets corresponding EHR in EHRbase via `subject_id`

## Programming Principles

### Strong Static Typing (Critical for Healthcare Safety)

#### Backend (Python)

- Pass `mypy --strict` with zero errors
- Explicit type annotations on all function parameters and returns
- Avoid `Any` types except for truly dynamic data
- Use Pydantic for API validation, `Mapped[Type]` for ORM models
- Prefer `Enum` or `Literal` over strings for constants
- Use `Optional[Type]` or `Type | None` explicitly for nullables

#### Frontend (TypeScript)

- `"strict": true` in `tsconfig.json`
- Define interfaces for API responses, props, complex objects
- Use type guards for runtime checks, avoid `as` assertions
- Enable `strictNullChecks`, handle null/undefined explicitly

### Defensive Programming (Critical for Clinical Apps)

#### Input Validation

- Never trust user input: validate at API boundaries (Pydantic/Zod)
- Sanitise data, enforce length limits, validate types/ranges/formats
- Use Pydantic `extra='forbid'` to reject unexpected fields

#### Error Handling

- try-except around all external calls (DB, FHIR, EHRbase, file I/O)
- Catch specific exceptions, log context (not PHI), use user-friendly messages
- Fail-safe defaults (deny access, safe fallbacks)

#### Null Safety

- Check before use, early returns, guard clauses at function start

#### Database Safety

- Parameterised queries only (SQLAlchemy ORM, never string concat)
- Transactions with rollback, foreign key constraints
- Idempotent operations for critical data (payments, clinical)

#### Security-First

- Whitelist over blacklist, least privilege, audit logging (no PHI in logs)
- Authentication on all endpoints, authorisation checks, rate limiting

#### Healthcare-Specific

- Never log/display PHI in errors or debug output
- Validate clinical data strictly, ensure OpenEHR/FHIR compliance
- Audit all clinical modifications (who, what, when)
- Version clinical documents, never update in place

## Quick Patterns

**New API endpoint**: Route in `backend/app/main.py` under `@router`, Pydantic schemas in `backend/app/schemas/`, then `just docs`

**Frontend API**: Use `api` from `@/lib/api.ts` (never raw `fetch`)

**Database models**: Define in `backend/app/models.py`, then `just migrate "description"`

## Key Files

- `backend/app/main.py`: FastAPI routes
- `backend/app/models.py`: SQLAlchemy models
- `frontend/src/lib/api.ts`: API client
- `compose.dev.yml`: Stack config
- `Justfile`: Dev commands

## Critical Rules

### Security

- Never log PHI in errors/logs/notifications
- Enforce RBAC at DB and application level
- Use `SecretStr` for secrets, never commit `.env` files

### Git

- NEVER auto-commit/push - always ask permission first
- Stop after fixing issues, report, and wait for instruction

### Markdown

- Use proper heading syntax (`#`, `##`, `###`), not bold
- No trailing punctuation on headings
- Wrap emails in `<email@example.com>`

````
