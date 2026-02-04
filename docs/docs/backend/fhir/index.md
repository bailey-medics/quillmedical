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
