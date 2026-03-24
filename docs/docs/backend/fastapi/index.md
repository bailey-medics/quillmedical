# FastAPI

## Overview

FastAPI is a modern, high-performance web framework for building APIs with Python. It serves as the core application framework for the Quill Medical backend, handling all HTTP requests, authentication, routing, and business logic.

## Why FastAPI?

### Performance

- **High Speed**: One of the fastest Python frameworks available, comparable to Node.js and Go
- **Async Support**: Built on Starlette for async/await support, enabling high concurrency
- **Production Ready**: Powers APIs at scale for companies like Microsoft, Uber, and Netflix

### Developer Experience

- **Type Hints**: Leverages Python type hints for automatic validation and documentation
- **Auto Documentation**: Generates interactive API docs (Swagger UI, ReDoc) automatically
- **Editor Support**: Excellent IDE autocompletion and type checking
- **Minimal Boilerplate**: Write less code to accomplish more

### Modern Features

- **Automatic Validation**: Request/response validation using Pydantic models
- **Dependency Injection**: Clean, testable code with built-in dependency injection
- **Standards-Based**: Based on OpenAPI (formerly Swagger) and JSON Schema standards
- **Security**: Built-in security utilities for OAuth2, JWT, API keys, etc.

### Python 3.13+ Features

- Native support for modern Python features
- Type annotations and pattern matching
- Async/await and asyncio
- Modern syntax and performance improvements

## Our Implementation

### Application Structure

The backend is organised in `backend/app/`:

```
app/
├── main.py              # Application entry point, route definitions
├── config.py            # Configuration and environment variables
├── models.py            # SQLAlchemy ORM models (User, Organization, etc.)
├── security.py          # Authentication, JWT, password hashing, CSRF, TOTP
├── fhir_client.py       # FHIR integration
├── ehrbase_client.py    # OpenEHR integration
├── messaging.py         # Messaging CQRS coordination layer
├── organisations.py     # Organisation access control helpers
├── patient_records.py   # File-based patient record management
├── logging_config.py    # Structured JSON logging configuration
├── push.py              # Web push notification endpoints
├── push_send.py         # Push notification sending logic
├── db/
│   ├── __init__.py      # Database module exports
│   └── auth_db.py       # Auth database engine and session management
├── cbac/
│   ├── __init__.py      # CBAC module exports
│   ├── competencies.py  # Competency definitions from YAML
│   ├── base_professions.py  # Base profession definitions from YAML
│   └── decorators.py    # has_competency(), FastAPI dependencies
├── features/
│   ├── __init__.py      # Feature-gating utilities (requires_feature dependency)
│   └── teaching/        # Teaching feature module
├── system_permissions/
│   ├── __init__.py      # Permission module exports
│   ├── permissions.py   # Permission types and hierarchy validation
│   └── decorators.py    # requires_staff(), requires_admin() dependencies
├── schemas/
│   ├── __init__.py      # Schema module exports
│   ├── auth.py          # Authentication request/response models
│   ├── cbac.py          # CBAC request/response models
│   ├── features.py      # Organisation feature toggle models
│   ├── letters.py       # Letter/correspondence models
│   └── messaging.py     # Messaging request/response models
└── utils/
    └── colors.py        # Avatar gradient colour utilities
```

### Key Components

#### Main Application (`main.py`)

```python
from fastapi import FastAPI

app = FastAPI(
    title="Quill API",
    docs_url="/api/docs",      # Swagger UI (dev only)
    redoc_url="/api/redoc"     # ReDoc (dev only)
)

router = APIRouter(prefix="/api")
```

#### Request/Response Models (Pydantic)

```python
from pydantic import BaseModel

class LetterIn(BaseModel):
    """Input model for creating a letter."""
    title: str
    body: str
    author_name: str | None = None
    author_email: str | None = None
```

#### Route Definitions

```python
@router.get("/patients")
def list_patients(u: User = DEP_CURRENT_USER):
    """List all patients from FHIR server."""
    patients = list_fhir_patients()
    return {"patients": patients}

@router.post(
    "/patients/{patient_id}/letters",
    dependencies=[DEP_REQUIRE_ROLES_CLINICIAN, DEP_REQUIRE_CSRF]
)
def create_letter(patient_id: str, letter: LetterIn):
    """Create a new clinical letter."""
    result = create_letter_composition(
        patient_id=patient_id,
        title=letter.title,
        body=letter.body
    )
    return result
```

## API Architecture

### API Prefix

All API endpoints are prefixed with `/api`:

- `/api/auth/*` - Authentication endpoints (login, register, TOTP, refresh, logout)
- `/api/users/*` - User management (admin CRUD, profile)
- `/api/patients/*` - Patient management (backed by FHIR)
- `/api/patients/{id}/letters/*` - Clinical letters (backed by OpenEHR)
- `/api/patients/{id}/conversations/*` - Patient-scoped conversations
- `/api/patients/{id}/invite-external` - External access invitations
- `/api/patients/{id}/external-access/*` - External access management
- `/api/conversations/*` - Messaging (conversations and messages)
- `/api/organizations/*` - Organisation management (admin)
- `/api/cbac/*` - Competency-based access control
- `/api/push/*` - Web push notifications
- `/api/health` - Service health check

### Authentication & Security

#### JWT-Based Authentication

```python
# Login with credentials and optional TOTP
POST /api/auth/login
{
  "username": "user@example.com",
  "password": "password123",
  "totp_code": "123456"  # Optional, required if 2FA enabled
}

# Response body
{
  "detail": "ok",
  "user": { "username": "...", "roles": [...] }
}
# JWT access/refresh tokens and CSRF token set as HTTP-only cookies
```

#### Protected Endpoints

```python
# Requires valid JWT
@router.get("/patients")
def list_patients(u: User = DEP_CURRENT_USER):
    pass

# Requires clinician role
@router.post("/patients/{id}/letters")
def create_letter(
    patient_id: str,
    letter: LetterIn,
    u: User = DEP_REQUIRE_ROLES_CLINICIAN,
):
    pass
```

#### CSRF Protection

```python
# POST/PUT/DELETE require CSRF token
@router.post(
    "/patients/{id}/demographics",
    dependencies=[DEP_REQUIRE_CSRF]
)
def update_demographics(...):
    pass
```

#### Permission-Based Access Control

##### Defence-in-depth architecture

The backend implements a multi-layered permission system:

1. **Authentication layer**: JWT token validation
2. **Permission layer**: Role/permission checks
3. **Resource layer**: Ownership and assignment validation
4. **Audit layer**: All access attempts logged

##### Permission hierarchy

```python
# 4-level hierarchy for permission checks: patient < staff < admin < superadmin
PERMISSION_LEVELS = ["patient", "staff", "admin", "superadmin"]

# All valid permission values (includes non-hierarchical external types)
ALL_PERMISSIONS = [
    "patient", "external_hcp", "patient_advocate",
    "staff", "admin", "superadmin",
]

# check_permission_level(user_permission, required_permission)
# Returns True if user meets or exceeds required level
# External types (external_hcp, patient_advocate) treated as patient level
```

##### Usage in endpoints

```python
# Require minimum permission level
@router.get("/admin/users")
def list_users(
    user: User = Depends(get_current_user)
):
    if user.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(403, "Insufficient permissions")
    # ... list users

# CBAC-protected endpoint
@router.post(
    "/patients/{id}/letters",
    dependencies=[DEP_REQUIRE_CSRF]
)
def create_letter(
    patient_id: str,
    letter: LetterIn,
    u: User = DEP_REQUIRE_ROLES_CLINICIAN,
):
    # ... create letter
```

##### Security principles

- **Source of truth**: Backend always validates permissions
- **No trust**: Never trust client-side permission state
- **Fail-safe**: Default deny, explicit grants required
- **Consistent errors**: Generic 403 messages prevent information disclosure
- **Audit logging**: All permission checks logged for compliance

##### Integration with frontend

The backend permission system works with frontend route guards:

- Backend: Enforces access rules (security)
- Frontend: Hides inaccessible features (UX)
- Both: Use same permission hierarchy
- Defence in depth: Multiple validation layers

### Dependency Injection

FastAPI's dependency injection provides clean, testable code. The backend uses pre-built dependency constants:

```python
# Standard dependency constants (defined in main.py)
DEP_GET_SESSION    # Database session via get_auth_db
DEP_CURRENT_USER   # Authenticated user from JWT cookie
DEP_REQUIRE_ROLES_CLINICIAN  # Clinician role gate
DEP_REQUIRE_CSRF   # CSRF token validation (mutating endpoints)

# Use in routes
@router.get("/profile")
def get_profile(u: User = DEP_CURRENT_USER):
    return u
```

## API Documentation

### Swagger UI

Interactive API documentation available at `/api/docs`:

- Test endpoints directly in the browser
- See request/response schemas
- Try authentication flows
- View all available operations

### ReDoc

Alternative documentation view at `/api/redoc`:

- Three-panel layout
- Better for reading and reference
- Search functionality
- Code samples

### OpenAPI Spec

Raw OpenAPI JSON at `/api/openapi.json`:

- Used by API clients and tools
- Auto-generated from code
- Includes all schemas and operations

## Request/Response Handling

### Automatic Validation

```python
class PatientDemographics(BaseModel):
    given_name: str
    family_name: str
    date_of_birth: str
    sex: str

@router.put("/patients/{patient_id}/demographics")
def update_demographics(
    patient_id: str,
    demographics: PatientDemographics  # Auto-validated
):
    # If we reach here, data is valid
    result = update_fhir_patient(patient_id, demographics.model_dump())
    return result
```

### Error Handling

```python
from fastapi import HTTPException

@router.get("/patients/{patient_id}")
def get_patient(patient_id: str):
    patient = read_fhir_patient(patient_id)
    if patient is None:
        raise HTTPException(
            status_code=404,
            detail="Patient not found"
        )
    return patient
```

### Response Models

```python
class PatientResponse(BaseModel):
    patient_id: str
    name: str
    date_of_birth: str

@router.get("/patients/{id}", response_model=PatientResponse)
def get_patient(id: str) -> PatientResponse:
    # Response automatically validated and serialized
    return PatientResponse(...)
```

## Development Features

### Hot Reload

FastAPI automatically reloads on code changes in development:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Async Support

```python
@router.get("/async-endpoint")
async def async_operation():
    # Can use async libraries
    result = await some_async_function()
    return result
```

### Background Tasks

```python
from fastapi import BackgroundTasks

@router.post("/send-notification")
def send_notification(background_tasks: BackgroundTasks):
    background_tasks.add_task(send_email, "user@example.com")
    return {"message": "Notification queued"}
```

## Testing

FastAPI provides excellent testing support:

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_list_patients():
    response = client.get("/api/patients")
    assert response.status_code == 200
    assert "patients" in response.json()
```

## Resources

- [FastAPI Official Documentation](https://fastapi.tiangolo.com/)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [Starlette Documentation](https://www.starlette.io/)
- [Uvicorn ASGI Server](https://www.uvicorn.org/)
