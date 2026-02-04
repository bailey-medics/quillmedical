# OpenEHR

## Overview

OpenEHR is an open standard and technology for electronic health records (EHR) that provides a powerful, flexible approach to storing and managing clinical data. In Quill Medical, we use OpenEHR to store clinical documents, letters, and detailed health records.

## Why OpenEHR?

### Clinical Data Modeling Excellence

- **Archetype-Based**: Uses clinical archetypes (reusable clinical data definitions) created by clinicians for clinicians
- **Future-Proof**: Separates clinical knowledge (archetypes) from technical implementation, allowing system evolution without data migration
- **Semantic Richness**: Captures the full meaning and context of clinical data, not just raw values
- **Clinical Governance**: Built-in support for versioning, audit trails, and attestation

### Open Standard Benefits

- **Vendor Independence**: Not tied to any proprietary system
- **Active Community**: International community of clinicians, developers, and academics
- **Clinical Content Repository**: Extensive library of peer-reviewed clinical archetypes
- **Interoperability**: Designed for long-term data preservation and exchange

### Technical Advantages

- **AQL Query Language**: Powerful Archetype Query Language for complex clinical queries
- **Version Control**: All clinical data is versioned automatically
- **Composition-Based**: Clinical documents stored as "Compositions" with full audit trails
- **Standards-Based**: Uses ISO 13606 and related healthcare informatics standards

## Our Implementation

### EHRbase Server

We use [EHRbase](https://ehrbase.org/), an open-source OpenEHR server implementation that provides:

- Full OpenEHR specification compliance
- PostgreSQL database backend
- RESTful API
- AQL query support
- Template and archetype management

### What We Store in OpenEHR

#### Clinical Correspondence

- Patient letters
- Clinical notes
- Discharge summaries
- Referral letters
- Care plans

#### Clinical Documents

- Consultation records
- Assessment notes
- Treatment plans
- Progress notes

#### Future Clinical Data

- Observations and vital signs
- Medications and prescriptions
- Diagnoses and problems
- Procedures and interventions
- Laboratory results
- Imaging reports

### Python Client Integration

We've built custom integration in `backend/app/ehrbase_client.py`:

```python
import requests

# Create EHR for a patient
ehr_id = get_or_create_ehr(patient_id='fhir-patient-123')

# Create a letter composition
composition = create_letter_composition(
    patient_id='fhir-patient-123',
    title='Consultation Letter',
    body='Letter content here...',
    author_name='Dr. Smith'
)

# Query using AQL
results = query_aql("""
    SELECT c/name/value as title
    FROM COMPOSITION c
    WHERE c/composer/name = 'Dr. Smith'
""")
```

## Data Architecture

#### OpenEHR as the Clinical Repository

OpenEHR is our **clinical data store** for:

- Clinical documentation (letters, notes)
- Longitudinal health records
- Time-series observations
- Clinical event history
- Audit trails and versioning

#### Integration with FHIR

OpenEHR and FHIR complement each other:

- **Patient Identity**: FHIR Patient ID links to OpenEHR EHR
- **Demographics**: Stored in FHIR, referenced by OpenEHR
- **Clinical Content**: Detailed clinical records in OpenEHR
- **Queries**: AQL for complex clinical queries, FHIR search for patient discovery

### EHR Structure

```
EHR (per patient)
├── EHR_STATUS (patient subject reference to FHIR)
└── COMPOSITION(s)
    ├── Clinical Synopsis (letters)
    ├── Progress Note
    ├── Observation
    └── ... (other clinical documents)
```

Each composition is:

#### Immutable

Once committed, cannot be changed (new versions created instead)

#### Versioned

Full version history maintained

#### Audited

Creator, timestamp, and context automatically recorded

#### Attested

Support for digital signatures and attestation

## Key Concepts

### Archetypes

Reusable clinical concept definitions (e.g., "Blood Pressure", "Problem/Diagnosis"):

- Created by clinical domain experts
- Reviewed and published in Clinical Knowledge Manager (CKM)
- Language and terminology independent
- Guarantee semantic interoperability

### Templates

Compose multiple archetypes into a clinical document structure:

- Define which archetypes to use
- Specify constraints and rules
- Create forms and data entry screens
- Generate validation rules

### Compositions

Actual clinical documents/records created from templates:

- Based on a specific template
- Contains actual patient data
- Stored in the EHR
- Fully queryable via AQL

## API Examples

### Create a Letter

```http
POST /api/patients/{patient_id}/letters
Content-Type: application/json

{
  "title": "Follow-up Consultation",
  "body": "Patient reviewed following recent treatment...",
  "author_name": "Dr. Jane Smith"
}
```

Response:

```json
{
  "patient_id": "patient-123",
  "composition_uid": "7b4e8a2c-e5f6-4d3c-8f7a-9b2c3d4e5f6a::1",
  "title": "Follow-up Consultation"
}
```

### Retrieve a Letter

```http
GET /api/patients/{patient_id}/letters/{composition_uid}
```

### List All Letters for a Patient

```http
GET /api/patients/{patient_id}/letters
```

## AQL Query Examples

### Find All Letters by Author

```sql
SELECT
    c/uid/value as composition_uid,
    c/name/value as title,
    c/context/start_time/value as created_at
FROM EHR e
CONTAINS COMPOSITION c[openEHR-EHR-COMPOSITION.report.v1]
WHERE c/composer/name = 'Dr. Smith'
ORDER BY c/context/start_time/value DESC
```

### Find Recent Clinical Documents

```sql
SELECT
    c/name/value as title,
    c/context/start_time/value as date
FROM EHR e[ehr_id/value = '{ehr_id}']
CONTAINS COMPOSITION c
WHERE c/context/start_time/value > '2026-01-01T00:00:00'
```

## Resources

- [OpenEHR Official Website](https://www.openehr.org/)
- [EHRbase Documentation](https://ehrbase.readthedocs.io/)
- [Clinical Knowledge Manager (CKM)](https://ckm.openehr.org/)
- [OpenEHR Specifications](https://specifications.openehr.org/)
- [AQL Documentation](https://specifications.openehr.org/releases/QUERY/latest/AQL.html)
