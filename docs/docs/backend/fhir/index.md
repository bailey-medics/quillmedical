# FHIR (Fast Healthcare Interoperability Resources)

## Overview

FHIR is a modern healthcare interoperability standard developed by HL7 (Health Level Seven International). In Quill Medical, we use FHIR as our primary database and standard for storing patient demographics and core administrative data.

## Why FHIR?

### Industry Standard

- **Global Adoption**: FHIR is the leading international standard for healthcare data exchange, supported by major EHR vendors, healthcare organisations, and regulatory bodies worldwide
- **Regulatory Compliance**: Widely recognised and required by healthcare regulations in many jurisdictions (e.g., CMS in the US, NHS in the UK)
- **Interoperability**: Designed specifically to enable seamless data exchange between different healthcare systems

### Modern Technology Stack

- **RESTful API**: Built on modern web standards (HTTP, JSON, REST) making it developer-friendly
- **Resource-Based**: Data is organised into well-defined "resources" (Patient, Observation, Medication, etc.)
- **Extensible**: Supports custom extensions while maintaining core standard compliance
- **Active Development**: Regular updates and improvements from the HL7 community

### Clinical Data Benefits

- **Rich Patient Demographics**: Comprehensive support for patient information including names, addresses, contact details, identifiers, and relationships
- **Standardised Terminology**: Built-in support for medical coding systems (SNOMED CT, LOINC, ICD-10)
- **Search Capabilities**: Powerful search parameters for querying patient data
- **Data Quality**: Enforces structure and validation rules to maintain data integrity

## Our Implementation

### HAPI FHIR Server

We use [HAPI FHIR](https://hapifhir.io/), an open-source Java-based FHIR server implementation that provides:

- Full FHIR R4 compliance
- PostgreSQL database backend for persistence
- Built-in validation and conformance checking
- RESTful API endpoints
- Search and query capabilities

### What We Store in FHIR

#### Patient Demographics

- Names (given, family, titles, prefixes)
- Date of birth
- Gender/sex
- Addresses (home, work, postal)
- Contact information (phone, email)
- Patient identifiers (NHS number, MRN, etc.)
- Relationships and emergency contacts

#### Administrative Data

- Patient registration status
- Managing organisation
- Care team assignments
- Patient preferences and communication needs

### Python Client Integration

We use the `fhirclient` Python library to interact with our FHIR server:

```python
from fhirclient import client
from fhirclient.models.patient import Patient

# Connect to FHIR server
fhir = client.FHIRClient(settings={'api_base': FHIR_SERVER_URL})

# Create/read/update patient resources
patient = Patient.read(patient_id, fhir.server)
```

See `backend/app/fhir_client.py` for our implementation.

## Data Architecture

### FHIR as the Patient Registry

FHIR serves as our **source of truth** for:

- Patient identity and demographics
- Active patient registry
- Patient discovery and search
- Demographics updates and corrections

### Integration with OpenEHR

FHIR and OpenEHR work together:

- **FHIR**: Patient identity and demographics ("who is the patient?")
- **OpenEHR**: Clinical documents and detailed health records ("what happened to the patient?")
- **Linkage**: OpenEHR EHRs reference FHIR Patient IDs

## FHIR Initialization & Health Checking

### Startup Behavior

HAPI FHIR with PostgreSQL backend requires time to initialize after container startup:

- **Container startup**: FHIR web application starts in 5-10 seconds
- **Database initialization**: PostgreSQL schema creation and migrations take additional time
- **Search index building**: HAPI FHIR builds search parameter indexes for Patient resources (30-60 seconds)
- **Ready to serve**: FHIR can handle patient queries only after indexes fully built

**Critical Safety Issue**: HAPI FHIR can return 200 OK responses on some endpoints before truly ready to serve patient data. Metadata endpoint (`/metadata`) responds successfully during index building, causing false positives in naive health checks.

### Health Check Implementation

Backend implements safety-critical health check that tests **actual patient data access**:

```python
def check_fhir_health() -> dict[str, bool | int | str]:
    """Check if FHIR server ready to serve data.

    Tests actual patient data access rather than metadata endpoint,
    since HAPI FHIR can return metadata before ready to serve resources.

    Safety-critical: False positive could cause clinical staff to think
    database is empty when it's still loading.
    """
    try:
        response = httpx.get(
            f"{settings.FHIR_SERVER_URL}/Patient?_count=1", timeout=5.0
        )
        # 200 = success (even if 0 patients), means FHIR truly ready
        return {
            "available": response.status_code == 200,
            "status_code": response.status_code,
        }
    except Exception as e:
        return {"available": False, "error": str(e)}
```

**Implementation**: [backend/app/main.py](../../backend/app/main.py) lines 110-139

### Frontend Integration

Frontend implements health polling during startup:

1. **Initial health check**: On mount, immediately check `/api/health`
2. **Polling loop**: Check every 5 seconds until `services.fhir.available=true`
3. **Patient fetch trigger**: Once FHIR ready, fetch patients from `/api/patients`
4. **User feedback**: Display "Database is initialising" message during polling

**Implementation**: [frontend/src/pages/Home.tsx](../../frontend/src/pages/Home.tsx) lines 242-295

### Safety Controls

- **Atomic response**: `/api/patients` returns `{patients: [...], fhir_ready: bool}` in single response (eliminates race conditions)
- **Conservative tracking**: Frontend tracks if patients ever loaded successfully, prevents false "No patients" on navigation
- **Visual distinction**: Different messages for "Database initialising" (blue, clock icon) vs "No patients" (gray, user-off icon)
- **Hazard mitigation**: Addresses Hazard-0019 (FHIR health check false negative) and Hazard-0046 (Backend starts before FHIR ready)

## API Examples

### Read Patient Demographics

```http
GET /api/patients/{patient_id}/demographics
Authorization: Bearer {token}
```

### Update Patient Demographics

```http
PUT /api/patients/{patient_id}/demographics
Content-Type: application/json

{
  "given_name": "Alice",
  "family_name": "Smith",
  "date_of_birth": "1985-06-15",
  "sex": "female",
  "address": {
    "line": ["123 Main St"],
    "city": "London",
    "postalCode": "SW1A 1AA",
    "country": "UK"
  },
  "contact": {
    "phone": "+44 20 1234 5678",
    "email": "alice.smith@example.com"
  }
}
```

## Resources

- [FHIR Official Documentation](https://www.hl7.org/fhir/)
- [HAPI FHIR Documentation](https://hapifhir.io/hapi-fhir/docs/)
- [fhirclient Python Library](https://github.com/smart-on-fhir/client-py)
- [FHIR Patient Resource Specification](https://www.hl7.org/fhir/patient.html)
