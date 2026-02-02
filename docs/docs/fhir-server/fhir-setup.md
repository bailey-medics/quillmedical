# FHIR Integration Setup

This document describes the HAPI FHIR integration added to Quill Medical.

## What's Been Added

1. **HAPI FHIR Server** (Docker container)
   - Official HAPI FHIR JPA Server image
   - Connected to your PostgreSQL database
   - FHIR R4 version
   - Accessible at `http://fhir:8080/fhir` internally

2. **Python FHIR Client** (`fhirclient`)
   - Added to backend dependencies
   - Wrapper module at `backend/app/fhir_client.py`
   - Functions for creating and reading patients

3. **FastAPI Endpoints**
   - `POST /api/fhir/patients` - Create FHIR patient
   - `GET /api/fhir/patients/{id}` - Read FHIR patient

## Getting Started

### 1. Start Services

```bash
cd /github/quillmedical

# Start all services including FHIR
docker-compose -f compose.dev.yml up -d

# Wait for FHIR server to initialize (takes ~2 minutes first time)
docker-compose -f compose.dev.yml logs -f fhir
```

Wait for the FHIR server to show it's ready. Look for logs like:

```
Started Application in XX.XXX seconds
```

### 2. Install Backend Dependencies

```bash
cd backend

# Activate your Python environment and install
pip install -e .
# or if using poetry:
poetry install
```

### 3. Test the Integration

```bash
cd backend
pytest tests/test_fhir_integration.py -v

# Or run directly:
python tests/test_fhir_integration.py
```

This will:

- Create a test user
- Login
- Create a FHIR patient named "Alice Smith"
- Read the patient back
- Verify the data matches

## Manual Testing via API

### Create a Patient

```bash
# First login (get cookies)
curl -c cookies.txt -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your_user","password":"your_pass"}'

# Create FHIR patient
curl -b cookies.txt -X POST http://localhost/api/fhir/patients \
  -H "Content-Type: application/json" \
  -d '{
    "given_name": "John",
    "family_name": "Doe",
    "patient_id": "patient-123"
  }'
```

### Read a Patient

```bash
curl -b cookies.txt http://localhost/api/fhir/patients/patient-123
```

## Direct FHIR Server Access

The FHIR server can also be accessed directly at `http://localhost:8080/fhir` after adding it to Caddy config, or by exposing the port:

```bash
# View FHIR server metadata
curl http://localhost:8080/fhir/metadata

# Search patients
curl http://localhost:8080/fhir/Patient

# Read specific patient
curl http://localhost:8080/fhir/Patient/patient-123
```

## Architecture

```
┌─────────────┐      REST       ┌──────────────┐
│   FastAPI   │ ─────────────▶  │  HAPI FHIR   │
│   Backend   │  fhirclient     │  JPA Server  │
└─────────────┘                 └──────────────┘
       │                               │
       │                               │
       └───────────┬───────────────────┘
                   ▼
           ┌───────────────┐
           │  PostgreSQL   │
           │   Database    │
           └───────────────┘
```

## Next Steps

Now that basic FHIR integration works, you can:

1. **Migrate Demographics**: Convert your Demographics model to FHIR Patient resources
2. **Add More Resources**: Implement Communication (messages), DocumentReference (letters)
3. **Sync Data**: Sync between your file-based storage and FHIR
4. **Search**: Use FHIR search capabilities
5. **External Integration**: Connect to NHS/GP FHIR servers

## Troubleshooting

### FHIR server not starting

- Check logs: `docker-compose logs fhir`
- HAPI FHIR needs ~120 seconds to initialize on first run
- Ensure PostgreSQL is healthy before FHIR starts

### Connection refused

- Verify FHIR container is running: `docker-compose ps`
- Check FHIR_SERVER_URL in config.py matches service name

### Cannot create patient

- Ensure you're authenticated (have valid cookies)
- Check backend logs for detailed error messages
- Verify fhirclient is installed: `pip list | grep fhirclient`

## Files Modified/Created

- `compose.dev.yml` - Added FHIR service
- `backend/pyproject.toml` - Added fhirclient dependency
- `backend/app/config.py` - Added FHIR_SERVER_URL setting
- `backend/app/fhir_client.py` - New FHIR client wrapper
- `backend/app/main.py` - Added FHIR endpoints
- `backend/tests/test_fhir_integration.py` - Integration test
