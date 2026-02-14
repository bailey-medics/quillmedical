# Copilot Prompt: Build CBAC (Competency-Based Access Control) for Quill Medical

## Context

You are building a Competency-Based Access Control (CBAC) authorization system for Quill Medical, an Electronic Patient Record (EPR) system. The system uses:

- **Backend:** Python 3.13 with FastAPI, Poetry, SQLAlchemy 2.0
- **Frontend:** React 19 + TypeScript + Vite + Mantine UI
- **Database:** PostgreSQL (separate auth DB, HAPI FHIR, EHRbase)
- **Standards:** FHIR for demographics (via HAPI FHIR), OpenEHR for clinical letters (via EHRbase)
- **Authentication:** JWT in HTTP-only cookies, TOTP 2FA, Argon2 password hashing
- **Configuration:** YAML source files in `shared/` (backend reads directly via PyYAML, frontend uses generated JSON for TypeScript types)

**Key Principle:** Healthcare staff have **clinical competencies** (prescribe controlled drugs, discharge without review) not rigid job roles. This avoids "role explosion" and handles training progression, locums, supervision, and specialty-specific capabilities.

---

## Architecture Overview

```text
quill-medical/
├── shared/
│   ├── competencies.yaml           # HUMAN-EDITABLE: Competency definitions
│   ├── base-professions.yaml       # HUMAN-EDITABLE: Profession templates
│   └── jurisdiction-config.yaml    # HUMAN-EDITABLE: International deployment config
│
├── backend/
│   ├── app/
│   │   ├── models.py               # SQLAlchemy models (User with base_profession)
│   │   ├── schemas/                # Pydantic schemas for API validation
│   │   │   ├── cbac.py            # CBAC request/response models
│   │   │   └── auth.py            # Auth schemas (existing)
│   │   ├── cbac/                   # CBAC authorization module
│   │   │   ├── __init__.py
│   │   │   ├── competencies.py    # Load competency definitions from YAML
│   │   │   ├── base_professions.py # Load profession templates from YAML
│   │   │   ├── decorators.py      # @requires_competency decorator
│   │   │   └── resolver.py        # Resolve final competencies
│   │   ├── security.py             # Auth utilities (existing: JWT, Argon2, TOTP)
│   │   ├── main.py                 # FastAPI app with route definitions
│   │   └── db/
│   │       └── auth_db.py          # Database operations (existing)
│   └── pyproject.toml              # Poetry dependencies
│
└── frontend/
    ├── scripts/
    │   └── generate-json-from-yaml.ts  # Build script (creates JSON from YAML for TS types)
    ├── src/
    │   ├── generated/              # GITIGNORED: Generated JSON files for TypeScript
    │   │   ├── competencies.json
    │   │   ├── base-professions.json
    │   │   └── jurisdiction-config.json
    │   ├── types/
    │   │   └── cbac.ts             # Type inference from generated JSON
    │   ├── hooks/
    │   │   └── useCompetencies.ts  # Permission checking hooks
    │   ├── lib/
    │   │   └── api.ts              # API client (extended with CBAC endpoints)
    │   ├── contexts/
    │   │   └── AuthContext.tsx     # Existing auth context
    │   └── components/
    │       └── PrescribeButton/    # Example permission-gated component
    │           ├── PrescribeButton.tsx
    │           ├── PrescribeButton.module.css
    │           ├── PrescribeButton.stories.tsx
    │           └── PrescribeButton.test.tsx
    └── package.json                # Add js-yaml as dev dependency
```

---

## Step 1: Setup File Structure and Gitignore

### Task 1.1: Create directory structure

```bash
# Create directories
mkdir -p shared
mkdir -p backend/app/cbac
mkdir -p backend/app/schemas
mkdir -p frontend/scripts
mkdir -p frontend/src/generated
mkdir -p frontend/src/types
mkdir -p frontend/src/lib/cbac
```

### Task 1.2: Update .gitignore

Add to both root `.gitignore` and/or frontend specific `.gitignore`:

```gitignore
# Generated files - DO NOT COMMIT
# Backend uses YAML directly, only frontend needs generated JSON
frontend/src/generated/

# Generated JSON from YAML
*.generated.json
```

**Verification:** Confirm `frontend/src/generated/` is gitignored.

**Note:** Backend uses YAML directly via PyYAML. Only frontend needs generated JSON for TypeScript type inference.

---

## Step 2: Create YAML Configuration Files

### Task 2.1: Create `shared/competencies.yaml`

Create a comprehensive competency definitions file with inline documentation:

```yaml
# shared/competencies.yaml
#
# COMPETENCY DEFINITIONS FOR QUILL MEDICAL
#
# Each competency represents a specific clinical or administrative capability.
# Competencies are granted to users based on their training, qualifications,
# and organizational approval.
#
# IMPORTANT: All changes to this file must be reviewed by Clinical Safety Officer
# and documented in clinical safety log (DCB 0129 requirement).

competencies:
  # ==========================================================================
  # CLINICAL ACCESS COMPETENCIES
  # ==========================================================================

  - id: view_patient_record
    display_name: View Patient Medical Record
    category: clinical_access
    risk_level: medium

    description: |
      View complete medical record for assigned patients.
      Does not grant write access or ability to modify clinical data.

    regulatory_requirements:
      uk: Professional registration (GMC/NMC/HCPC) required
      us: State medical/nursing license required

    audit_retention_years: 7

  - id: create_clinical_note
    display_name: Create Clinical Notes
    category: clinical_documentation
    risk_level: medium

    description: |
      Create new clinical notes in patient record.
      Notes are attributed to the creating clinician and timestamped.

    requires_active_registration: true

  # ==========================================================================
  # PRESCRIBING COMPETENCIES
  # ==========================================================================

  - id: prescribe_non_controlled
    display_name: Prescribe Non-Controlled Medications
    category: prescribing
    risk_level: medium

    description: |
      Prescribe medications that are not controlled substances.
      Requires completion of prescribing course or foundation competencies.

    regulatory_requirements:
      uk: GMC registration + prescribing course
      us: State license with prescribing authority

    min_years_qualified: 0
    requires_active_registration: true

  - id: prescribe_controlled_drugs
    display_name: Prescribe Controlled Substances
    category: prescribing
    risk_level: high

    description: |
      Prescribe controlled substances (UK Schedule 2-5, US Schedule II-V).

      UK Requirements:
      - Full GMC registration
      - Completion of controlled drugs prescribing module
      - For Schedule 2: additional specialist training

      US Requirements:
      - State medical license
      - DEA registration number
      - Schedule-specific restrictions apply

    regulatory_requirements:
      uk: GMC registration + controlled drugs module
      us: State license + DEA registration

    min_years_qualified: 0
    requires_active_registration: true
    audit_retention_years: 10

  # ==========================================================================
  # CLINICAL DECISION COMPETENCIES
  # ==========================================================================

  - id: discharge_without_review
    display_name: Discharge Patients Without Senior Review
    category: clinical_decisions
    risk_level: high

    description: |
      Authority to discharge patients from inpatient care without
      mandatory senior review.

      Typically granted at ST3+ or after 2 years post-foundation.
      Junior doctors usually require consultant sign-off.

      Note: Local policies may still require review for specific
      patient groups (safeguarding, mental health act, etc.)

    min_years_qualified: 2
    requires_active_registration: true

  - id: certify_death
    display_name: Certify Death
    category: clinical_decisions
    risk_level: high

    description: |
      Complete death certification (MCCD - Medical Certificate of
      Cause of Death).

      UK: Requires full GMC registration. Junior doctors can certify
      deaths under supervision.

    regulatory_requirements:
      uk: GMC registration (full or provisional with supervision)
      us: State medical license

    min_years_qualified: 0

  # ==========================================================================
  # INVESTIGATION COMPETENCIES
  # ==========================================================================

  - id: request_blood_tests
    display_name: Request Blood Tests
    category: investigations
    risk_level: low

  - id: request_imaging
    display_name: Request Imaging
    category: investigations
    risk_level: low

    description: |
      Request radiological imaging (X-ray, CT, MRI, ultrasound).
      Justification required per IR(ME)R regulations (UK) / ACR (US).

  - id: request_invasive_investigation
    display_name: Request Invasive Investigations
    category: investigations
    risk_level: high

    description: |
      Request invasive procedures (endoscopy, cardiac catheterization,
      biopsy, etc.). Usually requires senior doctor approval.

    min_years_qualified: 2

  # ==========================================================================
  # PATIENT ACCESS COMPETENCIES
  # ==========================================================================

  - id: view_own_medical_record
    display_name: View Own Medical Record
    category: patient_access
    risk_level: low

    description: |
      Patients can view their complete medical record.

      Delayed release applies to:
      - Sensitive diagnoses pending consultation (e.g., cancer)
      - Results requiring counseling (genetic tests)
      - Safeguarding restrictions (rare, requires senior approval)

      All delayed releases are time-limited and audited.

  - id: view_own_test_results
    display_name: View Own Test Results
    category: patient_access
    risk_level: low

    description: |
      View laboratory and imaging results.
      Some results may have delayed release pending clinical discussion.

  - id: message_clinical_team
    display_name: Message Clinical Team
    category: patient_communication
    risk_level: low

    description: |
      Send secure messages to clinical team.
      Response time expectations are set by organization policy.

  - id: update_own_demographics
    display_name: Update Own Demographics
    category: patient_access
    risk_level: low

    description: |
      Update contact details, address, phone number, email.
      Cannot change DOB, NHS number, or other immutable identifiers.

  # ==========================================================================
  # PATIENT REPRESENTATIVE COMPETENCIES
  # ==========================================================================

  - id: view_represented_patient_record
    display_name: View Represented Patient Record
    category: patient_advocate_access
    risk_level: medium

    description: |
      View medical record for patient(s) the representative is
      authorized to access.

      CRITICAL VERIFICATION REQUIRED:
      - Legal authority documentation (LPA, court order, parental responsibility)
      - Specific patient(s) covered by authority
      - Authority expiry date (if applicable)
      - Scope limitations

      All access is logged for safeguarding audit.

    audit_retention_years: 10

  # ==========================================================================
  # ADMINISTRATIVE COMPETENCIES
  # ==========================================================================

  - id: create_letter_from_dictation
    display_name: Create Letter from Dictation
    category: administrative
    risk_level: low

    description: |
      Medical secretaries create and edit letters from clinician dictation.
      Works with letter templates and dictated content only.

      Does NOT grant general clinical record access.

  - id: view_demographic_data
    display_name: View Patient Demographics
    category: administrative
    risk_level: low

    description: |
      Access patient demographic information only:
      - Name, DOB, address, contact details, NHS number
      - NO clinical data

      Used by reception, ward clerks, appointment booking staff.

  - id: manage_appointments
    display_name: Manage Appointments
    category: administrative
    risk_level: low

  - id: assign_icd10_codes
    display_name: Assign ICD-10 Diagnosis Codes
    category: administrative
    risk_level: low

    description: |
      Clinical coders assign diagnosis codes for administrative
      and billing purposes. Limited clinical data access
      (discharge summaries only).

  # ==========================================================================
  # SYSTEM ADMINISTRATION COMPETENCIES
  # ==========================================================================

  - id: manage_user_accounts
    display_name: Manage User Accounts
    category: system_admin
    risk_level: high

    description: |
      Create, modify, deactivate user accounts.
      Assign base professions and competencies.

      All changes fully logged for audit.

    audit_retention_years: 10

  - id: audit_all_access
    display_name: Audit All System Access
    category: system_admin
    risk_level: high

    description: |
      Clinical Safety Officer competency.
      View system-wide audit logs including who accessed which
      patient records and when.

      Used for: incident investigation, safeguarding concerns,
      inappropriate access detection, regulatory compliance.

    audit_retention_years: 10
```

**Verification:** File is valid YAML, contains comprehensive competency definitions with inline comments.

---

### Task 2.2: Create `shared/base-professions.yaml`

```yaml
# shared/base-professions.yaml
#
# BASE PROFESSION DEFINITIONS
#
# Each base profession represents a job role with a standard set of competencies.
# Individual users can have additional competencies added or removed based on
# their specific training, qualifications, and organizational needs.
#
# Final user competencies = base_profession competencies + additional - removed

base_professions:
  # ==========================================================================
  # CLINICAL PROFESSIONS
  # ==========================================================================

  - id: physician
    display_name: Doctor / Physician
    category: clinical

    base_competencies:
      - view_patient_record
      - create_clinical_note
      - prescribe_non_controlled
      - request_blood_tests
      - request_imaging
      - view_test_results
      - create_referral
      - update_diagnosis_list
      - certify_death

    description: |
      Base competencies for qualified medical practitioners.

      Additional competencies typically added based on grade:
      - FY1/FY2: Basic competencies only
      - ST1-ST2: May add discharge_without_review after 2 years
      - ST3+: Usually add prescribe_controlled_drugs, discharge_without_review
      - Consultant: Add advanced procedures, supervision competencies

  - id: nurse
    display_name: Registered Nurse
    category: clinical

    base_competencies:
      - view_patient_record
      - create_nursing_note
      - record_observations
      - administer_medication_prescribed
      - update_care_plan
      - view_test_results
      - escalate_to_medical_team

    description: |
      Registered nurses with NMC registration (UK) or state license (US).
      Can view assigned patients and document nursing care.

      Senior nurses may have additional competencies added for:
      - IV medication administration
      - Cannulation
      - Venepuncture

  - id: pharmacist
    display_name: Pharmacist
    category: clinical

    base_competencies:
      - view_patient_record_medication_focus
      - perform_medication_review
      - dispense_prescription
      - check_drug_interactions
      - create_pharmaceutical_note
      - view_medication_history

    description: |
      Registered pharmacists (GPhC UK, state boards US).

      Independent prescribing pharmacists may have prescribe_non_controlled
      or prescribe_controlled_drugs added.

  - id: allied_health_professional
    display_name: Allied Health Professional
    category: clinical

    base_competencies:
      - view_patient_record
      - create_therapy_note
      - perform_assessment
      - create_treatment_plan
      - request_relevant_investigations

    description: |
      Physiotherapists, occupational therapists, dietitians,
      speech therapists, etc.

  - id: healthcare_assistant
    display_name: Healthcare Assistant
    category: clinical

    base_competencies:
      - view_basic_patient_info
      - record_observations
      - document_basic_care
      - escalate_concerns

    description: |
      Unregistered clinical support workers.
      Supervised by registered nurses.

  # ==========================================================================
  # PATIENT & FAMILY
  # ==========================================================================

  - id: patient
    display_name: Patient
    category: patient

    base_competencies:
      - view_own_medical_record
      - view_own_test_results
      - view_own_medications
      - view_own_appointments
      - message_clinical_team
      - update_own_demographics
      - manage_consent_preferences
      - book_appointment
      - download_own_records

    description: |
      Standard patient access to their own medical information.

      System enforces delayed release for sensitive results
      (handled at system level, not via competency removal).

  - id: patient_representative
    display_name: Patient Representative / Advocate
    category: patient_advocate

    base_competencies:
      - view_represented_patient_record
      - view_represented_test_results
      - view_represented_medications
      - view_represented_appointments
      - message_clinical_team_on_behalf
      - manage_represented_consent_preferences

    description: |
      Legal representatives with authority to access patient records:
      - Lasting Power of Attorney (Health & Welfare)
      - Court-appointed deputy
      - Parent/guardian (children under 16)
      - Patient-authorized family member
      - Solicitor (legal proceedings with patient authorization)

      CRITICAL: System MUST verify:
      1. Legal authority documentation uploaded and verified
      2. Specific patient(s) covered by authority
      3. Expiry date (if applicable)
      4. Scope of authority

      All access logged for safeguarding audit.

  # ==========================================================================
  # ADMINISTRATIVE STAFF
  # ==========================================================================

  - id: medical_secretary
    display_name: Medical Secretary
    category: administrative

    base_competencies:
      - create_letter_from_dictation
      - edit_letter_draft
      - format_clinic_letter
      - format_discharge_summary
      - access_templates
      - view_demographic_data
      - manage_appointment_schedule

    description: |
      Medical secretaries transcribe dictated letters and manage
      administrative workflows.

      They do NOT have general clinical record access.
      They work only with letter templates and dictated content.

  - id: ward_clerk
    display_name: Ward Clerk / Receptionist
    category: administrative

    base_competencies:
      - view_demographic_data
      - update_contact_details
      - manage_appointments
      - check_in_patient
      - print_labels

    description: |
      Administrative staff with no clinical data access.
      Handle appointment booking, patient check-in, demographic updates.

  - id: medical_records_staff
    display_name: Health Information Manager
    category: administrative

    base_competencies:
      - access_records_administrative
      - manage_subject_access_request
      - manage_record_transfer
      - archive_old_records
      - release_information_with_consent

    description: |
      Medical records department staff managing:
      - Subject access requests (GDPR/HIPAA)
      - Record transfers between organizations
      - Archive management

  - id: coding_staff
    display_name: Clinical Coder
    category: administrative

    base_competencies:
      - view_discharge_summary_for_coding
      - assign_icd10_codes
      - assign_opcs_codes
      - view_limited_clinical_data

    description: |
      Coding staff assign diagnosis and procedure codes.
      Limited clinical data access (discharge summaries, procedure notes).

  # ==========================================================================
  # SYSTEM ADMINISTRATION
  # ==========================================================================

  - id: it_administrator
    display_name: IT Administrator
    category: system

    base_competencies:
      - manage_system_configuration
      - manage_user_accounts
      - technical_troubleshooting
      - view_system_logs

    description: |
      IT staff with system administration rights but NO routine
      patient data access.

      Break-glass access available for system emergencies only
      (requires senior authorization, fully logged).

  - id: clinical_safety_officer
    display_name: Clinical Safety Officer
    category: system

    base_competencies:
      - audit_all_access
      - investigate_incidents
      - manage_clinical_safety_config
      - view_system_wide_reports
      - access_for_safety_investigation
      - manage_user_accounts

    description: |
      Clinical Safety Officer (DCB 0160 requirement).
      System-wide access for safety monitoring, incident investigation,
      hazard management.

      All access fully logged.
```

**Verification:** File is valid YAML, all base professions reference competencies defined in `competencies.yaml`.

---

### Task 2.3: Create `shared/jurisdiction-config.yaml`

```yaml
# shared/jurisdiction-config.yaml
#
# JURISDICTION-SPECIFIC CONFIGURATION
#
# Quill Medical is designed to work internationally. This file contains
# deployment-specific settings for different regulatory jurisdictions.

jurisdictions:
  uk:
    display_name: United Kingdom

    regulatory_authorities:
      - id: gmc
        name: General Medical Council
        profession: physician
        verification_url: https://www.gmc-uk.org/registration-and-licensing

      - id: nmc
        name: Nursing and Midwifery Council
        profession: nurse
        verification_url: https://www.nmc.org.uk/registration

      - id: gphc
        name: General Pharmaceutical Council
        profession: pharmacist
        verification_url: https://www.pharmacyregulation.org/registers

    controlled_substance_schedules:
      - schedule: 1
        description: No therapeutic use (e.g., LSD, cannabis)

      - schedule: 2
        description: High potential for abuse (e.g., morphine, fentanyl)
        prescribing_requirements: Special prescription requirements

      - schedule: 3
        description: Moderate potential (e.g., buprenorphine, temazepam)

      - schedule: 4
        description: Low potential (e.g., benzodiazepines)

      - schedule: 5
        description: Very low potential (e.g., codeine preparations)

    patient_identifier_systems:
      - system: nhs_number
        display_name: NHS Number
        format: "10 digits"
        example: "123 456 7890"

      - system: chi_number
        display_name: CHI Number (Scotland)
        format: "10 digits"
        example: "0101201234"

  us:
    display_name: United States

    regulatory_authorities:
      - id: state_medical_board
        name: State Medical Board
        profession: physician
        note: Varies by state

      - id: dea
        name: Drug Enforcement Administration
        profession: physician
        verification_url: https://www.deadiversion.usdoj.gov/
        note: Required for controlled substance prescribing

    controlled_substance_schedules:
      - schedule: I
        description: No accepted medical use (e.g., heroin, LSD)

      - schedule: II
        description: High potential for abuse (e.g., morphine, oxycodone)

      - schedule: III
        description: Moderate potential (e.g., codeine combinations)

      - schedule: IV
        description: Low potential (e.g., benzodiazepines)

      - schedule: V
        description: Very low potential (e.g., cough preparations)

    patient_identifier_systems:
      - system: ssn
        display_name: Social Security Number
        format: "XXX-XX-XXXX"
        note: Protected health information

      - system: mrn
        display_name: Medical Record Number
        note: Organization-specific
```

**Verification:** File is valid YAML, contains jurisdiction-specific configuration.

---

## Step 3: Create Build Script (YAML → JSON Generation)

**Architecture Note:**

- **Backend (Python):** Uses YAML directly via PyYAML. Reads `shared/*.yaml` at runtime.
- **Frontend (TypeScript):** Uses generated JSON for type inference. YAML can't be efficiently used in browser, and TypeScript needs concrete JSON to infer types.
- **Build Process:** Frontend prebuild/predev hooks generate JSON from YAML automatically.

### Task 3.1: Create `frontend/scripts/generate-json-from-yaml.ts`

```typescript
// frontend/scripts/generate-json-from-yaml.ts
//
// Generates JSON files from YAML source for TypeScript type inference.
// Backend uses YAML directly via PyYAML - this is only for frontend TypeScript types.
//
// Run this as part of the frontend build process (prebuild/predev hooks)

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const SHARED_DIR = path.join(__dirname, "..", "..", "shared");
const FRONTEND_GENERATED_DIR = path.join(__dirname, "..", "src", "generated");

const FILES_TO_GENERATE = [
  "competencies.yaml",
  "base-professions.yaml",
  "jurisdiction-config.yaml",
];

function ensureDirectoryExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generateJson(yamlFile: string): void {
  const yamlPath = path.join(SHARED_DIR, yamlFile);
  const jsonFile = yamlFile.replace(".yaml", ".json");

  console.log(`Processing ${yamlFile}...`);

  // Read YAML
  const yamlContent = fs.readFileSync(yamlPath, "utf8");
  const data = yaml.load(yamlContent);

  // Write JSON to frontend (backend uses YAML directly)
  const frontendJsonPath = path.join(FRONTEND_GENERATED_DIR, jsonFile);
  fs.writeFileSync(frontendJsonPath, JSON.stringify(data, null, 2));
  console.log(`  ✓ Generated ${frontendJsonPath}`);
}

function main(): void {
  console.log("Generating JSON from YAML for TypeScript types...\n");

  // Ensure frontend generated directory exists
  ensureDirectoryExists(FRONTEND_GENERATED_DIR);

  // Generate JSON for each YAML file
  FILES_TO_GENERATE.forEach(generateJson);

  console.log("\n✅ All JSON files generated successfully!");
  console.log(`\nGenerated: frontend/src/generated/`);
  console.log("\nNote: Backend uses YAML directly via PyYAML.");
}

main();
```

### Task 3.2: Update `frontend/package.json` scripts

Add scripts to `frontend/package.json`:

```json
{
  "scripts": {
    "generate:types": "tsx scripts/generate-json-from-yaml.ts",
    "prebuild": "npm run generate:types",
    "predev": "npm run generate:types"
  },
  "devDependencies": {
    "js-yaml": "^4.1.0",
    "@types/js-yaml": "^4.0.9",
    "tsx": "^4.7.0"
  }
}
```

**Note:** These scripts should be added to the existing `frontend/package.json`, not replace it entirely.

### Task 3.3: Install dependencies and test

```bash
cd frontend
npm install
npm run generate:types
```

**Verification:**

- JSON files created in `frontend/src/generated/`
- Files are valid JSON and match YAML structure
- Backend can read YAML files directly from `shared/` directory

---

## Step 4: Backend Implementation (Python/FastAPI)

### Task 4.1: Update `backend/pyproject.toml`

Add dependencies using Poetry:

```bash
cd backend
poetry add pyyaml
```

**Note:** FastAPI, Pydantic, python-jose (JWT), passlib[argon2], and other required packages are already in the project.

---

### Task 4.2: Create `backend/app/cbac/competencies.py`

Load competencies from YAML and create Python types:

```python
# backend/app/cbac/competencies.py
"""Competency definitions loaded from YAML.

This module loads and validates competency definitions from the shared/competencies.yaml
file, providing type-safe access to competency IDs and metadata.
"""

import yaml
from pathlib import Path
from typing import Literal, get_args
from enum import Enum

# Load competencies from YAML
COMPETENCIES_YAML_PATH = Path(__file__).parent.parent.parent.parent / "shared" / "competencies.yaml"

with open(COMPETENCIES_YAML_PATH, 'r') as f:
    COMPETENCIES_DATA = yaml.safe_load(f)

# Extract competency IDs
COMPETENCY_IDS = tuple(c['id'] for c in COMPETENCIES_DATA['competencies'])

# Create Literal type for type hints
CompetencyId = Literal[COMPETENCY_IDS]

# Create Enum for runtime validation
ClinicalCompetency = Enum(
    'ClinicalCompetency',
    {c['id'].upper(): c['id'] for c in COMPETENCIES_DATA['competencies']}
)

# Helper function to get competency details
def get_competency_details(competency_id: str) -> dict | None:
    """Get full details of a competency by ID."""
    for comp in COMPETENCIES_DATA['competencies']:
        if comp['id'] == competency_id:
            return comp
    return None

# Helper function to validate competency
def is_valid_competency(competency_id: str) -> bool:
    """Check if a competency ID is valid."""
    return competency_id in COMPETENCY_IDS

# Helper function to check risk level
def get_competency_risk_level(competency_id: str) -> str:
    """Get risk level of a competency (low, medium, high)."""
    details = get_competency_details(competency_id)
    return details.get('risk_level', 'low') if details else 'low'
```

**Verification:** Import this module and check that `COMPETENCY_IDS` contains all competencies from YAML.

---

### Task 4.3: Create `backend/app/cbac/base_professions.py`

```python
# backend/app/cbac/base_professions.py
"""Base profession definitions loaded from YAML.

Provides templates for common healthcare professions with their standard
competency sets, which can be customised per-user.
"""

import yaml
from pathlib import Path
from typing import Literal

# Load base professions from YAML
BASE_PROFESSIONS_YAML_PATH = Path(__file__).parent.parent.parent.parent / "shared" / "base-professions.yaml"

with open(BASE_PROFESSIONS_YAML_PATH, 'r') as f:
    BASE_PROFESSIONS_DATA = yaml.safe_load(f)

# Extract profession IDs
PROFESSION_IDS = tuple(p['id'] for p in BASE_PROFESSIONS_DATA['base_professions'])

# Create Literal type
BaseProfessionId = Literal[PROFESSION_IDS]

# Helper function to get profession details
def get_profession_details(profession_id: str) -> dict | None:
    """Get full details of a base profession by ID."""
    for prof in BASE_PROFESSIONS_DATA['base_professions']:
        if prof['id'] == profession_id:
            return prof
    return None

# Helper function to get base competencies for a profession
def get_profession_base_competencies(profession_id: str) -> list[str]:
    """Get the base competencies for a profession."""
    details = get_profession_details(profession_id)
    return details.get('base_competencies', []) if details else []

# Helper function to resolve final competencies
def resolve_user_competencies(
    base_profession: str,
    additional_competencies: list[str] | None = None,
    removed_competencies: list[str] | None = None
) -> list[str]:
    """
    Calculate final competencies for a user.

    Final = base_profession_competencies + additional - removed
    """
    base_comps = set(get_profession_base_competencies(base_profession))
    additional = set(additional_competencies or [])
    removed = set(removed_competencies or [])

    final = (base_comps | additional) - removed
    return list(final)
```

**Verification:** Test `resolve_user_competencies` to ensure it correctly computes final competencies.

---

### Task 4.4: Update `backend/app/models.py`

Add CBAC fields to existing User model:

```python
# backend/app/models.py
# Add to existing User model

from sqlalchemy import String, Boolean, ARRAY, JSON
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional

# Add to existing User class in models.py:
class User(DeclarativeBase):  # Extends existing User model
    # ... existing fields ...

    # CBAC fields
    base_profession: Mapped[str] = mapped_column(String(100), nullable=False, default="patient")
    additional_competencies: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    removed_competencies: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    professional_registrations: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    def get_final_competencies(self) -> list[str]:
        """Calculate final competencies for this user."""
        from app.cbac.base_professions import resolve_user_competencies
        return resolve_user_competencies(
            self.base_profession,
            self.additional_competencies,
            self.removed_competencies
        )

# For API schemas, create Pydantic models:
from pydantic import BaseModel, Field

class ProfessionalRegistrationSchema(BaseModel):
    """Professional registration details (GMC, NMC, DEA, etc.)."""
    """Professional registration for API responses."""
    authority: str  # e.g., "GMC", "NMC", "DEA"
    number: str
    jurisdiction: str  # e.g., "uk", "us"
    verified: bool = False
    verified_at: Optional[datetime] = None

class UserWithCompetencies(BaseModel):
    """User data with resolved competencies for API responses."""
    user_id: int
    username: str
    email: str
    base_profession: str
    additional_competencies: list[str]
    removed_competencies: list[str]
    final_competencies: list[str]  # Computed field
    professional_registrations: Optional[dict] = None
```

**Verification:** Create a test user and verify `get_final_competencies()` returns correct results.

---

### Task 4.5: Create `backend/app/schemas/cbac.py`

CBAC-related Pydantic schemas for API requests/responses:

```python
# backend/app/schemas/cbac.py
"""Pydantic schemas for CBAC API endpoints."""

from pydantic import BaseModel

class CompetencyCheck(BaseModel):
    """Request to check if user has a competency."""
    user_id: int
    competency: str

class CompetencyCheckResponse(BaseModel):
    """Response for competency check."""
    has_competency: bool
    reason: str | None = None

class UpdateCompetenciesRequest(BaseModel):
    """Request to update user's additional/removed competencies."""
    user_id: int
    additional_competencies: list[str] | None = None
    removed_competencies: list[str] | None = None

class UserCompetenciesResponse(BaseModel):
    """Response with user's competencies."""
    user_id: int
    base_profession: str
    base_competencies: list[str]
    additional_competencies: list[str]
    removed_competencies: list[str]
    final_competencies: list[str]
```

---

### Task 4.6: Extend `backend/app/security.py`

Add CBAC support to existing JWT token creation:

```python
# backend/app/security.py
# Add to existing security.py file

from jose import jwt
from datetime import datetime, timedelta, UTC
from app.config import settings
from app.models import User  # SQLAlchemy User model

def create_jwt_with_competencies(user: User) -> str:
    """Create JWT access token with CBAC competencies included.

    Extends existing JWT creation to include competency data.
    Tokens are stored in HTTP-only cookies (see existing security.py patterns).
    """
    # Calculate final competencies
    competencies = user.get_final_competencies()

    # Token expiration (15 minutes for access tokens per project standards)
    expire = datetime.now(UTC) + timedelta(minutes=15)

    # Token payload - extend existing JWT claims
    payload = {
        "sub": str(user.id),  # Standard JWT subject
        "username": user.username,
        "email": user.email,
        # CBAC claims
        "base_profession": user.base_profession,
        "competencies": competencies,
        "professional_registrations": user.professional_registrations,
        # Standard JWT fields
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(UTC).timestamp())
    }

    # Use existing settings.JWT_SECRET_KEY and settings.JWT_ALGORITHM
    token = jwt.encode(payload, settings.JWT_SECRET_KEY.get_secret_value(), algorithm="HS256")
    return token

def decode_jwt_with_competencies(token: str) -> dict:
    """Decode and validate JWT token with CBAC claims.

    Use this alongside existing get_current_user_from_jwt dependency.
    """
    from jose import JWTError
    from fastapi import HTTPException, status

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY.get_secret_value(),
            algorithms=["HS256"]
        )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        ) from e
```

**Verification:** Test token creation and decoding with a sample user.

---

### Task 4.7: Create `backend/app/cbac/decorators.py`

Authorization decorators and dependencies for routes:

```python
# backend/app/cbac/decorators.py
"""CBAC authorization decorators and FastAPI dependencies.

Provides @requires_competency and Depends(has_competency(...)) for
protecting API endpoints based on user competencies.
"""

from fastapi import Depends, HTTPException, status, Request
from app.security import get_current_user_from_jwt  # Existing auth function
from app.cbac.competencies import get_competency_risk_level
from app.models import User
from typing import Annotated

def has_competency(competency: str):
    """FastAPI dependency to check if current user has a competency.

    Usage:
        @router.post("/prescriptions/controlled")
        async def prescribe_controlled(
            user: Annotated[User, Depends(has_competency("prescribe_controlled_drugs"))]
        ):
            # user has the required competency
            ...
    """
    async def check_competency(user: Annotated[User, Depends(get_current_user_from_jwt)]) -> User:
        final_competencies = user.get_final_competencies()

        if competency not in final_competencies:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient privileges. Required competency: {competency}",
            )

        return user

    return check_competency

# Legacy decorator style (prefer FastAPI Depends above)
def requires_competency_decorator(competency: str):
    """
    Decorator to require a specific competency for a route.

    Usage:
        @app.post("/prescriptions/controlled")
        @requires_competency("prescribe_controlled_drugs")
        async def prescribe_controlled_drug(request: Request):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            # Get authorization header
            authorization = request.headers.get("Authorization")
            if not authorization:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authorization header missing",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Verify token
            token_data = verify_token_from_header(authorization)

            # Check competency
            if competency not in token_data.competencies:
                # Log unauthorized attempt for audit
                risk_level = get_competency_risk_level(competency)
                print(f"[AUDIT] Unauthorized attempt: user={token_data.user_id}, "
                      f"competency={competency}, risk={risk_level}")

                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Insufficient privileges. Required competency: {competency}",
                )

            # Inject token data into request state for use in route
            request.state.user = token_data

            return await func(request, *args, **kwargs)

        return wrapper
    return decorator

def requires_any_competency(*competencies: str):
    """Require at least one of the specified competencies."""
    def decorator(func):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            authorization = request.headers.get("Authorization")
            if not authorization:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authorization header missing",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            token_data = verify_token_from_header(authorization)

            # Check if user has any of the required competencies
            has_required = any(comp in token_data.competencies for comp in competencies)

            if not has_required:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Insufficient privileges. Required one of: {', '.join(competencies)}",
                )

            request.state.user = token_data
            return await func(request, *args, **kwargs)

        return wrapper
    return decorator
```

**Verification:** Test dependency with a mock user and test client (see pytest patterns in conftest.py).

---

### Task 4.8: Add CBAC routes to `backend/app/main.py`

Add CBAC-specific routes to the existing FastAPI application:

```python
# backend/app/main.py
# Add these routes to the existing router

from fastapi import Depends
from sqlalchemy.orm import Session
from app.db.database import get_session
from app.cbac.decorators import has_competency
from app.schemas.cbac import UserCompetenciesResponse, PrescriptionRequest
from app.models import User
from typing import Annotated

# Use existing dependencies
DEP_GET_SESSION = Depends(get_session)
DEP_CURRENT_USER = Depends(get_current_user_from_jwt)

# Get user's competencies
@router.get(
    "/cbac/my-competencies",
    response_model=UserCompetenciesResponse,
    tags=["cbac"]
)
async def get_my_competencies(
    user: Annotated[User, DEP_CURRENT_USER],
) -> UserCompetenciesResponse:
    """Get current user's resolved competencies."""
    from app.cbac.base_professions import get_profession_base_competencies

    base_comps = get_profession_base_competencies(user.base_profession)
    final_comps = user.get_final_competencies()

    return UserCompetenciesResponse(
        user_id=user.id,
        base_profession=user.base_profession,
        base_competencies=base_comps,
        additional_competencies=user.additional_competencies,
        removed_competencies=user.removed_competencies,
        final_competencies=final_comps
    )

# Example: Protected route requiring competency
@router.post(
    "/prescriptions/controlled",
    tags=["prescriptions"],
    status_code=201
)
async def prescribe_controlled(
    prescription: PrescriptionRequest,
    user: Annotated[User, Depends(has_competency("prescribe_controlled_drugs"))],
    db: Annotated[Session, DEP_GET_SESSION],
) -> dict:
    """Prescribe controlled substance.

    Requires: prescribe_controlled_drugs competency.
    """
    # TODO: Implement with FHIR/EHRbase
    # - Verify professional registration
    # - Check prescription limits
    # - Create FHIR MedicationRequest
    # - Enhanced audit logging

    return {
        "message": "Controlled substance prescription created",
        "prescriber_id": user.id,
        "patient_id": prescription.patient_id,
        "medication": prescription.medication,
        "risk_level": "high"
    }
```

---

### Task 4.9: Create database migration

Create an Alembic migration for CBAC fields:

```bash
cd backend
just migrate "Add CBAC fields to User model"
```

This creates a migration file. Edit it to add:

```python
# In backend/alembic/versions/xxx_add_cbac_fields.py

def upgrade() -> None:
    op.add_column('users', sa.Column('base_profession', sa.String(100), nullable=False, server_default='patient'))
    op.add_column('users', sa.Column('additional_competencies', sa.ARRAY(sa.String()), nullable=False, server_default='{}'))
    op.add_column('users', sa.Column('removed_competencies', sa.ARRAY(sa.String()), nullable=False, server_default='{}'))
    op.add_column('users', sa.Column('professional_registrations', sa.JSON(), nullable=True))

def downgrade() -> None:
    op.drop_column('users', 'professional_registrations')
    op.drop_column('users', 'removed_competencies')
    op.drop_column('users', 'additional_competencies')
    op.drop_column('users', 'base_profession')
```

Apply migration:

```bash
just db-upgrade  # or: alembic upgrade head
```

---

### Task 4.10: Test backend

Start the development environment:

```bash
just start-dev  # Starts full stack with Docker Compose
```

The API will be available at `http://localhost:8000/api`.

Test using interactive docs at `http://localhost:8000/api/docs`:

1. Login with an existing user (use `just create-user` to create one)
2. JWT is automatically set in HTTP-only cookie
3. Call `/api/cbac/my-competencies` to see your competencies
4. Try `/api/prescriptions/controlled` (will fail with 403 if you lack the competency)

**Verification:**

- Login works, sets JWT cookie
- Protected routes require valid JWT
- User without competency gets 403 Forbidden
- Competency resolution works correctly
- Database migration applied

**Testing with pytest:**

```bash
cd backend
just unit-tests-backend  # or: poetry run pytest
```

Create tests in `backend/tests/test_cbac.py`:

```python
# backend/tests/test_cbac.py

from app.cbac.base_professions import resolve_user_competencies
from app.models import User

def test_competency_resolution():
    """Test that competencies are resolved correctly."""
    # Physician base includes view_patient_record
    final = resolve_user_competencies(
        base_profession="physician",
        additional_competencies=["prescribe_controlled_drugs"],
        removed_competencies=["certify_death"]
    )

    assert "view_patient_record" in final  # From base
    assert "prescribe_controlled_drugs" in final  # Added
    assert "certify_death" not in final  # Removed

def test_protected_route_with_competency(client, auth_headers):
    """Test that protected route allows user with competency."""
    response = client.post(
        "/api/prescriptions/controlled",
        json={
            "patient_id": 1,
            "medication": "morphine",
            "dose": "10mg",
            "duration_days": 7
        },
        headers=auth_headers
    )
    assert response.status_code == 201

def test_protected_route_without_competency(client, patient_auth_headers):
    """Test that protected route denies user without competency."""
    response = client.post(
        "/api/prescriptions/controlled",
        json={
            "patient_id": 1,
            "medication": "morphine",
            "dose": "10mg",
            "duration_days": 7
        },
        headers=patient_auth_headers
    )
    assert response.status_code == 403
```

---

## Step 5: Frontend Implementation (React/TypeScript)

**Note:** Frontend patterns should follow existing project conventions:

- Use `@/lib/api.ts` for API calls (never raw `fetch`)
- `AuthContext` for authentication state
- Mantine UI components with CSS modules
- `renderWithMantine` / `renderWithRouter` for tests

### Task 5.1: Create `frontend/src/types/cbac.ts`

Type-safe competency definitions with JSON type inference:

```typescript
// frontend/src/types/cbac.ts

import competenciesData from "../generated/competencies.json";
import baseProfessionsData from "../generated/base-professions.json";

// Infer competency types from generated JSON
export type CompetencyId = (typeof competenciesData.competencies)[number]["id"];
export type Competency = (typeof competenciesData.competencies)[number];
export type BaseProfessionId =
  (typeof baseProfessionsData.base_professions)[number]["id"];
export type BaseProfession =
  (typeof baseProfessionsData.base_professions)[number];

// Type guard
export function isCompetencyId(value: string): value is CompetencyId {
  return competenciesData.competencies.some((c) => c.id === value);
}

// Competency lookup
export function getCompetencyDetails(id: CompetencyId): Competency | undefined {
  return competenciesData.competencies.find((c) => c.id === id);
}

// Profession lookup
export function getBaseProfessionDetails(
  id: BaseProfessionId,
): BaseProfession | undefined {
  return baseProfessionsData.base_professions.find((p) => p.id === id);
}

// API response types
export interface UserCompetencies {
  user_id: number;
  base_profession: string;
  base_competencies: string[];
  additional_competencies: string[];
  removed_competencies: string[];
  final_competencies: CompetencyId[];
}
```

**Verification:** TypeScript auto-completes competency IDs when typing `CompetencyId`.

---

### Task 5.2: Extend `frontend/src/lib/api.ts`

Add CBAC API calls to existing API client:

```typescript
// frontend/src/lib/api.ts
// Add to existing file

import type { UserCompetencies } from "@/types/cbac";

// CBAC endpoints
export const cbacApi = {
  /**
   * Get current user's competencies
   */
  async getMyCompetencies(): Promise<UserCompetencies> {
    const response = await api.get("/cbac/my-competencies");
    if (!response.ok) {
      throw new Error("Failed to fetch competencies");
    }
    return response.json();
  },

  /**
   * Check if current user has a specific competency
   */
  async hasCompetency(competencyId: string): Promise<boolean> {
    try {
      const competencies = await this.getMyCompetencies();
      return competencies.final_competencies.includes(competencyId);
    } catch {
      return false;
    }
  },
};
```

---

### Task 5.3: Create `frontend/src/hooks/useCompetencies.ts`

CBAC permission hooks using existing AuthContext:

```typescript
// frontend/src/hooks/useCompetencies.ts

import { useQuery } from "@tanstack/react-query";
import { cbacApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { CompetencyId } from "@/types/cbac";

/**
 * Get current user's competencies from API
 */
export function useUserCompetencies() {
  const { state } = useAuth();

  return useQuery({
    queryKey: ["user-competencies"],
    queryFn: () => cbacApi.getMyCompetencies(),
    enabled: state.isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Check if current user has a specific competency
 *
 * @param competency - Competency ID to check
 * @returns boolean indicating if user has the competency
 */
export function useHasCompetency(competency: CompetencyId): boolean {
  const { data } = useUserCompetencies();
  return data?.final_competencies.includes(competency) ?? false;
}

/**
 * Check if user has ANY of the specified competencies
 */
export function useHasAnyCompetency(...competencies: CompetencyId[]): boolean {
  const { data } = useUserCompetencies();
  if (!data) return false;
  return competencies.some((c) => data.final_competencies.includes(c));
}

/**
 * Check if user has ALL of the specified competencies
 */
export function useHasAllCompetencies(
  ...competencies: CompetencyId[]
): boolean {
  const { data } = useUserCompetencies();
  if (!data) return false;
  return competencies.every((c) => data.final_competencies.includes(c));
}

/**
 * Get user's base profession
 */
export function useBaseProfession(): string | null {
  const { data } = useUserCompetencies();
  return data?.base_profession ?? null;
}
```

---

### Task 5.4: Create example component `frontend/src/components/PrescribeButton/PrescribeButton.tsx`

Permission-gated Mantine UI component:

```typescript
// frontend/src/components/PrescribeButton/PrescribeButton.tsx

import { Button, Tooltip } from "@mantine/core";
import { IconPill } from "@tabler/icons-react";
import { useHasCompetency } from "@/hooks/useCompetencies";
import classes from "./PrescribeButton.module.css";

export interface PrescribeButtonProps {
  /** Patient ID for prescription */
  patientId: number;
  /** Whether this is a controlled substance */
  isControlledSubstance: boolean;
  /** Callback when prescription is initiated */
  onPrescribe: () => void;
  /** Button variant */
  variant?: "filled" | "outline";
}

/**
 * Button for prescribing medications with CBAC permission checks.
 *
 * Automatically hides if user has no prescribing competencies.
 * Disables with tooltip if user lacks specific competency required.
 */
export function PrescribeButton({
  patientId,
  isControlledSubstance,
  onPrescribe,
  variant = "filled",
}: PrescribeButtonProps) {
  const canPrescribeNonControlled = useHasCompetency("prescribe_non_controlled");
  const canPrescribeControlled = useHasCompetency("prescribe_controlled_drugs");

  const canPrescribe = isControlledSubstance
    ? canPrescribeControlled
    : canPrescribeNonControlled;

  // Don't render if user has no prescribing competencies at all
  if (!canPrescribeNonControlled && !canPrescribeControlled) {
    return null;
  }

  const button = (
    <Button
      leftSection={<IconPill size={16} />}
      onClick={onPrescribe}
      disabled={!canPrescribe}
      variant={variant}
      color={isControlledSubstance ? "red" : "blue"}
      className={classes.button}
      data-testid="prescribe-button"
    >
      {isControlledSubstance ? "Prescribe Controlled Drug" : "Prescribe"}
    </Button>
  );

  // Show tooltip if button is disabled due to insufficient privileges
  if (!canPrescribe) {
    return (
      <Tooltip
        label={`You do not have the "${isControlledSubstance ? "prescribe_controlled_drugs" : "prescribe_non_controlled"}" competency`}
        withArrow
      >
        <span>{button}</span>
      </Tooltip>
    );
  }

  return button;
}
```

```css
/* frontend/src/components/PrescribeButton/PrescribeButton.module.css */

.button {
  font-weight: 500;
}
```

---

### Task 5.7: Frontend testing

Run frontend tests:

```bash
cd frontend
just unit-tests-frontend  # or: npm run test
```

**Verification:**

- All Mantine component tests pass
- Permission hooks return correct values based on mock data
- Components hide/disable appropriately based on competencies
- Storybook stories render correctly (`npm run storybook`)
- TypeScript compiles without errors (`npm run type-check`)

**Integration with existing auth:**

The CBAC system integrates with the existing `AuthContext`:

```typescript
// Example usage in a protected page
import { RequireAuth } from "@/components/RequireAuth";
import { useHasCompetency } from "@/hooks/useCompetencies";

function PrescriptionPage() {
  const canPrescribe = useHasCompetency("prescribe_non_controlled");

  if (!canPrescribe) {
    return <div>You do not have permission to prescribe medications.</div>;
  }

  return (
    <div>
      {/* Prescription UI */}
    </div>
  );
}

// Wrap with RequireAuth for authentication
export default function ProtectedPrescriptionPage() {
  return (
    <RequireAuth>
      <PrescriptionPage />
    </RequireAuth>
  );
}
```

**Key patterns:**

- ✅ Use `@/lib/api.ts` client (never raw `fetch`)
- ✅ Use `AuthContext` for authentication state
- ✅ Use `<RequireAuth>` for page-level authentication
- ✅ Permission checks with `useHasCompetency()` hooks
- ✅ Mantine UI components with CSS modules
- ✅ All components with stories have tests
- ✅ British English in UI text

---

## Step 6: End-to-End Testing

```typescript
// frontend/src/pages/Login.tsx

import React, { useState } from 'react';
import { storeToken, decodeToken } from '../auth/jwt';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await response.json();

      // Store token
      storeToken(data.access_token);

      // Decode to show user info
      const user = decodeToken(data.access_token);
      console.log('Logged in as:', user);
      console.log('Competencies:', user.competencies);

      // Redirect to app (implement routing as needed)
      window.location.href = '/';

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold">Quill Medical</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="rounded bg-red-50 p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="doctor@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="password123"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="text-xs text-gray-500 text-center">
            Demo: doctor@example.com / password123
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Verification:**

- Login form works
- Token stored in localStorage
- User competencies logged to console
- Permission hooks return correct values

---

## Step 6: Testing & Verification

### Task 6.1: Create test script `backend/test_cbac.py`

```python
# backend/test_cbac.py

from app.models.user import User, ProfessionalRegistration
from app.models.base_professions import resolve_user_competencies
from app.auth.jwt_handler import create_access_token, decode_access_token

def test_competency_resolution():
    """Test competency resolution logic."""

    print("=== Testing Competency Resolution ===\n")

    # Test 1: Basic physician
    print("Test 1: Basic FY1 physician (no additional competencies)")
    comps = resolve_user_competencies("physician")
    print(f"Competencies: {comps}\n")
    assert "view_patient_record" in comps
    assert "prescribe_non_controlled" in comps

    # Test 2: Senior doctor with additional competencies
    print("Test 2: Consultant with additional competencies")
    comps = resolve_user_competencies(
        "physician",
        additional_competencies=["prescribe_controlled_drugs", "discharge_without_review"]
    )
    print(f"Competencies: {comps}\n")
    assert "prescribe_controlled_drugs" in comps
    assert "discharge_without_review" in comps

    # Test 3: Restricted user (competency removed)
    print("Test 3: Doctor with prescribing temporarily suspended")
    comps = resolve_user_competencies(
        "physician",
        removed_competencies=["prescribe_non_controlled"]
    )
    print(f"Competencies: {comps}\n")
    assert "prescribe_non_controlled" not in comps
    assert "view_patient_record" in comps  # Other competencies remain

    # Test 4: Patient
    print("Test 4: Patient competencies")
    comps = resolve_user_competencies("patient")
    print(f"Competencies: {comps}\n")
    assert "view_own_medical_record" in comps
    assert "prescribe_non_controlled" not in comps

    print("✅ All competency resolution tests passed!\n")

def test_jwt_tokens():
    """Test JWT token creation and validation."""

    print("=== Testing JWT Tokens ===\n")

    # Create test user
    user = User(
        user_id="test_001",
        email="test@example.com",
        base_profession="physician",
        additional_competencies=["prescribe_controlled_drugs"],
        professional_registrations=[
            ProfessionalRegistration(
                authority="GMC",
                number="1234567",
                jurisdiction="uk",
                verified=True
            )
        ]
    )

    # Create token
    token = create_access_token(user)
    print(f"Created token: {token[:50]}...\n")

    # Decode token
    decoded = decode_access_token(token)
    print(f"Decoded token data:")
    print(f"  User ID: {decoded.user_id}")
    print(f"  Base profession: {decoded.base_profession}")
    print(f"  Competencies: {decoded.competencies}")
    print(f"  Registrations: {decoded.professional_registrations}\n")

    # Verify competencies were resolved correctly
    assert "view_patient_record" in decoded.competencies
    assert "prescribe_controlled_drugs" in decoded.competencies

    print("✅ JWT token tests passed!\n")

if __name__ == "__main__":
    test_competency_resolution()
    test_jwt_tokens()
    print("🎉 All tests passed!")
```

Run tests:

```bash
cd backend
python test_cbac.py
```

---

### Task 6.2: Create integration test

Test complete flow:

1. User logs in
2. Gets JWT token
3. Makes request to protected route
4. Backend validates competencies

```bash
# Login as doctor
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@example.com","password":"password123"}' \
  | jq -r '.access_token')

echo "Token: $TOKEN"

# Test authorized request (doctor HAS prescribe_controlled_drugs)
echo -e "\n=== Authorized request ==="
curl -X POST http://localhost:8000/prescriptions/controlled \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"PAT001","medication":"morphine","dose":"10mg","duration_days":7}'

# Login as patient
PATIENT_TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"patient@example.com","password":"password123"}' \
  | jq -r '.access_token')

# Test unauthorized request (patient does NOT have prescribe_controlled_drugs)
echo -e "\n\n=== Unauthorized request (should fail with 403) ==="
curl -X POST http://localhost:8000/prescriptions/controlled \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"PAT001","medication":"morphine","dose":"10mg","duration_days":7}'
```

**Expected results:**

- Doctor request succeeds (200 OK)
- Patient request fails (403 Forbidden)

---

## Step 7: Documentation

### Task 7.1: Create README for CBAC system

Create `docs/CBAC_SYSTEM.md`:

```markdown
# Competency-Based Access Control (CBAC) System

## Overview

Quill Medical uses Competency-Based Access Control (CBAC) instead of traditional Role-Based Access Control (RBAC).

### Why CBAC?

Healthcare staff have **clinical competencies** (specific capabilities) rather than rigid job roles:

- **Training progression**: Junior doctors gain competencies as they advance
- **Locums**: Competencies are portable across organizations
- **Specialty differences**: Same grade, different competencies (ST3 Respiratory vs ST3 Cardiology)
- **Avoids role explosion**: No need for hundreds of roles like "Doctor-Respiratory-FY1"

## Architecture

### File Structure
```

shared/
├── competencies.yaml # Human-editable source of truth
├── base-professions.yaml # Human-editable profession templates
└── jurisdiction-config.yaml # Human-editable jurisdiction settings

backend/app/cbac/ # Backend reads YAML directly via PyYAML
├── competencies.py # Loads from shared/competencies.yaml
├── base_professions.py # Loads from shared/base-professions.yaml
└── resolver.py # Resolves final user competencies

frontend/src/generated/ # Auto-generated JSON for TypeScript types (gitignored)
├── competencies.json
├── base-professions.json
└── jurisdiction-config.json

````

### User Model

Each user has:
- **Base profession**: Template (e.g., "physician", "nurse", "patient")
- **Additional competencies**: Extra capabilities added to this user
- **Removed competencies**: Capabilities removed from this user

**Final competencies = base + additional - removed**

### JWT Token

Token contains:
```json
{
  "user_id": "user_001",
  "email": "doctor@example.com",
  "base_profession": "physician",
  "competencies": ["view_patient_record", "prescribe_controlled_drugs", ...],
  "professional_registrations": [
    {"authority": "GMC", "number": "1234567", "jurisdiction": "uk"}
  ],
  "exp": 1234567890
}
````

## Usage

### Backend: Protect Routes

```python
from app.auth.decorators import requires_competency

@app.post("/prescriptions/controlled")
@requires_competency("prescribe_controlled_drugs")
async def prescribe_controlled_drug(request: Request):
    user = request.state.user  # Token data injected here
    # ... implementation
```

### Frontend: Permission-Gated UI

```typescript
import { useHasCompetency } from '../auth/permissions';

function PrescribeButton() {
  const canPrescribe = useHasCompetency('prescribe_controlled_drugs');

  if (!canPrescribe) return null;  // Don't show button

  return <button>Prescribe Controlled Drug</button>;
}
```

## Adding New Competencies

1. Edit `shared/competencies.yaml`
2. Add competency with full documentation
3. Run `npm run generate:types` (frontend only - updates TypeScript types)
4. Backend picks up YAML changes automatically (no rebuild needed)
5. Use in code with full type safety

Example:

```yaml
- id: perform_lumbar_puncture
  display_name: Perform Lumbar Puncture
  category: procedures
  risk_level: high

  description: |
    Invasive diagnostic procedure.
    Requires supervised training and sign-off.

  min_years_qualified: 2
  requires_supervision: true
```

## Testing

```bash
# Backend tests
cd backend
python test_cbac.py

# Integration test
./test_integration.sh

# Frontend
npm test
```

## Security

- Frontend checks are for UI only (show/hide buttons)
- Backend ALWAYS enforces permissions
- All competency checks are logged for audit
- High-risk competencies have extended audit retention

```

---

## Summary Checklist

After completing all steps, verify:

**File Structure:**
- [ ] `shared/` contains only YAML files (human-editable)
- [ ] `frontend/src/generated/` contains auto-generated JSON (gitignored)
- [ ] Frontend build script converts YAML → JSON for TypeScript types
- [ ] Backend reads YAML directly from `shared/` using PyYAML

**Backend:**
- [ ] Competencies loaded from YAML with Python types
- [ ] User model with base_profession and competency modifications
- [ ] JWT token creation includes final competencies
- [ ] `@requires_competency` decorator protects routes
- [ ] Protected routes reject unauthorized requests (403)

**Frontend:**
- [ ] TypeScript types auto-inferred from generated JSON
- [ ] JWT decode utilities work
- [ ] Permission hooks (`useHasCompetency`) return correct values
- [ ] UI components hide/disable based on competencies
- [ ] Login flow stores token, decodes user info

**Integration:**
- [ ] Doctor can access protected routes
- [ ] Patient cannot access doctor-only routes
- [ ] Competencies correctly resolved (base + additional - removed)
- [ ] API returns 403 with clear error message for insufficient privileges

**Documentation:**
- [ ] YAML files have comprehensive inline comments
- [ ] README explains CBAC architecture
- [ ] Examples provided for common patterns

---

**Next Steps After Implementation:**

1. **Replace mock users** with actual database (PostgreSQL)
2. **Add audit logging** to database (not just console)
3. **Implement relationship layer** (Phase 2) - who can access which patients
4. **Add break-glass access** for emergencies
5. **Professional registration verification** against GMC/NMC/DEA APIs
6. **Add competency expiry** (e.g., annual refresher required)
7. **UI for competency management** (admin panel)

---

This prompt should give Copilot everything needed to build a production-ready CBAC system for Quill Medical. The step-by-step approach ensures each component can be built and tested independently before integration.
```
