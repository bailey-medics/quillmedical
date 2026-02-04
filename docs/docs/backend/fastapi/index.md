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

The backend is organized in `backend/app/`:

```
app/
├── main.py              # Application entry point, route definitions
├── config.py            # Configuration and environment variables
├── db.py                # Database session management
├── models.py            # SQLAlchemy ORM models (User, etc.)
├── security.py          # Authentication, JWT, password hashing
├── fhir_client.py       # FHIR integration
├── ehrbase_client.py    # OpenEHR integration
├── push.py              # Web push notification endpoints
├── push_send.py         # Push notification sending logic
└── schemas/
    ├── auth.py          # Authentication request/response models
    └── letters.py       # Letter/correspondence models
```

### Key Components

#### Main Application (`main.py`)

```python
from fastapi import FastAPI

app = FastAPI(
    title="Quill Medical API",
    version="1.0.0",
    docs_url="/api/docs",      # Swagger UI
    redoc_url="/api/redoc"     # ReDoc
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

- `/api/auth/*` - Authentication endpoints
- `/api/patients/*` - Patient management
- `/api/fhir/*` - Direct FHIR operations
- `/api/push/*` - Web push notifications

### Authentication & Security

#### JWT-Based Authentication

```python
# Login returns JWT tokens
POST /api/auth/login
{
  "username": "user@example.com",
  "password": "password123"
}

# Response includes tokens
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": { ... }
}
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
    u: User = Depends(require_roles(["clinician"]))
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

### Dependency Injection

FastAPI's dependency injection provides:

```python
# Database sessions
def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Current user from JWT
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_session)
) -> User:
    payload = verify_token(token)
    user = db.get(User, payload["sub"])
    return user

# Use in routes
@router.get("/profile")
def get_profile(user: User = Depends(get_current_user)):
    return user
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
