# FHIR Integration - Quick Start

## ✅ What's Been Done

1. **Added HAPI FHIR JPA Server** to `compose.dev.yml`
   - Uses the same PostgreSQL database
   - Runs on internal network at `http://fhir:8080/fhir`
   - FHIR R4 version

2. **Added Python FHIR Client** (`fhirclient`)
   - Added to `backend/pyproject.toml`
   - Wrapper at `backend/app/fhir_client.py`

3. **Created Two New API Endpoints**
   - `POST /api/fhir/patients` - Create patient with first/last name
   - `GET /api/fhir/patients/{id}` - Read patient back

4. **Test Script** at `backend/tests/test_fhir_integration.py`

## 🚀 How to Test It

### Step 1: Start Services

```bash
docker-compose -f compose.dev.yml up -d
```

**Wait 2-3 minutes** for HAPI FHIR to initialize (it's Java, takes time on first run)

### Step 2: Check FHIR is Ready

```bash
docker-compose -f compose.dev.yml logs fhir | tail -20
```

Look for: `Started Application in XX.XXX seconds`

### Step 3: Install Backend Dependencies

```bash
cd backend
pip install -e .
```

This installs the new `fhirclient` package.

### Step 4: Run Test

```bash
# Run with pytest
pytest tests/test_fhir_integration.py -v

# Or run directly as a script
python tests/test_fhir_integration.py
```

Expected output:

```
🧪 Testing FHIR Integration...

1. Logging in...
   ✓ Test user registered
   ✓ Logged in successfully

2. Creating FHIR patient...
   ✓ Patient created with ID: test-patient-001
   Name: {'given': ['Alice'], 'family': 'Smith', 'use': 'official'}

3. Reading FHIR patient...
   ✓ Patient retrieved successfully
   ID: test-patient-001
   Given: ['Alice']
   Family: Smith

✅ FHIR Integration test PASSED!
```

## 📝 Example: Using the API

### Create a Patient

```bash
# Login first
curl -c cookies.txt -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass"}'

# Create patient
curl -b cookies.txt -X POST http://localhost/api/fhir/patients \
  -H "Content-Type: application/json" \
  -d '{
    "given_name": "Sarah",
    "family_name": "Jones"
  }'
```

Response:

```json
{
  "resourceType": "Patient",
  "id": "123",
  "name": [
    {
      "use": "official",
      "family": "Jones",
      "given": ["Sarah"]
    }
  ]
}
```

### Read a Patient

```bash
curl -b cookies.txt http://localhost/api/fhir/patients/123
```

## 🔍 What You Can Do Next

Now that basic FHIR integration works, you can:

1. **Start migrating** from file-based to FHIR storage
2. **Add more fields** (date of birth, gender, NHS number, etc.)
3. **Add other FHIR resources** (Communication for messages, DocumentReference for letters)
4. **Connect to external FHIR servers** (NHS, hospital systems)

## 📚 More Details

See [FHIR Setup Guide](fhir-setup.md) for:

- Architecture diagram
- Troubleshooting
- Direct FHIR server access
- File changes details

## ❓ Questions?

- HAPI FHIR docs: https://hapifhir.io/
- fhirclient docs: https://github.com/smart-on-fhir/client-py
- FHIR R4 spec: https://hl7.org/fhir/R4/
