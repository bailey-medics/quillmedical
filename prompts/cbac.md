# Copilot Prompt: Build CBAC (Competency-Based Access Control) for Quill Medical

## Context

You are building a Competency-Based Access Control (CBAC) authorization system for Quill Medical, an NHS Electronic Patient Record (EPR) system. The system uses:

- **Backend:** Python 3.11+ with FastAPI
- **Frontend:** React with TypeScript (PWA)
- **Database:** PostgreSQL (separate auth, FHIR, EHRbase instances)
- **Standards:** FHIR for demographics, OpenEHR for clinical data

**Key Principle:** Healthcare staff have **clinical competencies** (prescribe controlled drugs, discharge without review) not rigid job roles. This avoids "role explosion" and handles training progression, locums, supervision, and specialty-specific capabilities.

---

## Architecture Overview

```
quill-medical/
├── shared/
│   ├── competencies.yaml           # HUMAN-EDITABLE: Competency definitions
│   ├── base-professions.yaml       # HUMAN-EDITABLE: Profession templates
│   └── jurisdiction-config.yaml    # HUMAN-EDITABLE: International deployment config
│
├── scripts/
│   └── generate-json-from-yaml.ts  # Build script (creates JSON from YAML)
│
├── backend/
│   ├── generated/                  # GITIGNORED: Generated JSON files
│   │   ├── competencies.json
│   │   ├── base-professions.json
│   │   └── jurisdiction-config.json
│   ├── app/
│   │   ├── models/
│   │   │   ├── user.py             # User model with base_profession
│   │   │   ├── competencies.py     # Competency enums/types from YAML
│   │   │   └── token.py            # JWT token models
│   │   ├── auth/
│   │   │   ├── jwt_handler.py      # Token creation/validation
│   │   │   └── decorators.py       # @requires_competency decorator
│   │   └── routes/
│   │       ├── auth.py             # Login, token generation
│   │       └── prescriptions.py    # Example protected route
│   └── requirements.txt            # Add PyYAML, PyJWT
│
└── frontend/
    ├── src/
    │   ├── generated/              # GITIGNORED: Generated JSON files
    │   │   ├── competencies.json
    │   │   ├── base-professions.json
    │   │   └── jurisdiction-config.json
    │   ├── types/
    │   │   └── competencies.ts     # Type inference from generated JSON
    │   ├── auth/
    │   │   ├── jwt.ts              # JWT decode utilities
    │   │   └── permissions.ts      # Permission checking hooks
    │   └── components/
    │       └── PrescribeButton.tsx # Example permission-gated component
    └── package.json                # Add js-yaml as dev dependency
```

---

## Step 1: Setup File Structure and Gitignore

### Task 1.1: Create directory structure

```bash
# Create directories
mkdir -p shared
mkdir -p scripts
mkdir -p backend/generated
mkdir -p backend/app/models
mkdir -p backend/app/auth
mkdir -p backend/app/routes
mkdir -p frontend/src/generated
mkdir -p frontend/src/types
mkdir -p frontend/src/auth
```

### Task 1.2: Update .gitignore

Add to both root `.gitignore` and/or backend/frontend specific gitignores:

```gitignore
# Generated files - DO NOT COMMIT
backend/generated/
frontend/src/generated/

# Generated JSON from YAML
*.generated.json
```

**Verification:** Confirm `backend/generated/` and `frontend/src/generated/` are gitignored.

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

### Task 3.1: Create `scripts/generate-json-from-yaml.ts`

```typescript
// scripts/generate-json-from-yaml.ts
//
// Generates JSON files from YAML source for TypeScript type inference
// Run this as part of the build process

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const SHARED_DIR = path.join(__dirname, "..", "shared");
const BACKEND_GENERATED_DIR = path.join(
  __dirname,
  "..",
  "backend",
  "generated",
);
const FRONTEND_GENERATED_DIR = path.join(
  __dirname,
  "..",
  "frontend",
  "src",
  "generated",
);

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

  // Write JSON to backend
  const backendJsonPath = path.join(BACKEND_GENERATED_DIR, jsonFile);
  fs.writeFileSync(backendJsonPath, JSON.stringify(data, null, 2));
  console.log(`  ✓ Generated ${backendJsonPath}`);

  // Write JSON to frontend
  const frontendJsonPath = path.join(FRONTEND_GENERATED_DIR, jsonFile);
  fs.writeFileSync(frontendJsonPath, JSON.stringify(data, null, 2));
  console.log(`  ✓ Generated ${frontendJsonPath}`);
}

function main(): void {
  console.log("Generating JSON from YAML...\n");

  // Ensure directories exist
  ensureDirectoryExists(BACKEND_GENERATED_DIR);
  ensureDirectoryExists(FRONTEND_GENERATED_DIR);

  // Generate JSON for each YAML file
  FILES_TO_GENERATE.forEach(generateJson);

  console.log("\n✅ All JSON files generated successfully!");
  console.log("\nGenerated files:");
  console.log(`  Backend:  backend/generated/`);
  console.log(`  Frontend: frontend/src/generated/`);
}

main();
```

### Task 3.2: Update `package.json` scripts

Add to root `package.json` (or create one if it doesn't exist):

```json
{
  "name": "quill-medical",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "generate:types": "tsx scripts/generate-json-from-yaml.ts",
    "prebuild": "npm run generate:types"
  },
  "devDependencies": {
    "js-yaml": "^4.1.0",
    "@types/js-yaml": "^4.0.5",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

### Task 3.3: Install dependencies and test

```bash
npm install
npm run generate:types
```

**Verification:**

- JSON files created in `backend/generated/`
- JSON files created in `frontend/src/generated/`
- Files are valid JSON and match YAML structure

---

## Step 4: Backend Implementation (Python/FastAPI)

### Task 4.1: Update `backend/requirements.txt`

Add dependencies:

```txt
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
PyYAML>=6.0.1
PyJWT>=2.8.0
python-multipart>=0.0.6
bcrypt>=4.1.0
```

Install:

```bash
cd backend
pip install -r requirements.txt
```

---

### Task 4.2: Create `backend/app/models/competencies.py`

Load competencies from YAML and create Python types:

```python
# backend/app/models/competencies.py

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

### Task 4.3: Create `backend/app/models/base_professions.py`

```python
# backend/app/models/base_professions.py

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

### Task 4.4: Create `backend/app/models/user.py`

User model with base profession and competencies:

```python
# backend/app/models/user.py

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ProfessionalRegistration(BaseModel):
    """Professional registration details (GMC, NMC, DEA, etc.)."""
    authority: str  # e.g., "GMC", "NMC", "DEA"
    number: str
    jurisdiction: str  # e.g., "uk", "us"
    verified: bool = False
    verified_at: Optional[datetime] = None

class User(BaseModel):
    """User model with CBAC."""

    user_id: str
    email: str

    # Base profession (e.g., "physician", "nurse", "patient")
    base_profession: str

    # Competency modifications
    additional_competencies: list[str] = Field(default_factory=list)
    removed_competencies: list[str] = Field(default_factory=list)

    # Professional registrations
    professional_registrations: list[ProfessionalRegistration] = Field(default_factory=list)

    # Metadata
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def get_final_competencies(self) -> list[str]:
        """Calculate final competencies for this user."""
        from app.models.base_professions import resolve_user_competencies
        return resolve_user_competencies(
            self.base_profession,
            self.additional_competencies,
            self.removed_competencies
        )
```

**Verification:** Create a test user and verify `get_final_competencies()` returns correct results.

---

### Task 4.5: Create `backend/app/models/token.py`

JWT token models:

```python
# backend/app/models/token.py

from pydantic import BaseModel
from typing import Optional

class TokenData(BaseModel):
    """Data stored in JWT token."""

    user_id: str
    email: str
    base_profession: str
    competencies: list[str]  # Final resolved competencies
    professional_registrations: list[dict] = []

    # Standard JWT fields
    exp: int  # Expiration timestamp
    iat: int  # Issued at timestamp

class Token(BaseModel):
    """Token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # Seconds until expiration

class LoginRequest(BaseModel):
    """Login request."""
    email: str
    password: str
```

---

### Task 4.6: Create `backend/app/auth/jwt_handler.py`

JWT creation and validation:

```python
# backend/app/auth/jwt_handler.py

import jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException, status
from app.models.user import User
from app.models.token import TokenData

# TODO: Move to environment variables in production
SECRET_KEY = "your-secret-key-change-this-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

def create_access_token(user: User) -> str:
    """Create JWT access token for user."""

    # Calculate final competencies
    competencies = user.get_final_competencies()

    # Token expiration
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    # Token payload
    payload = {
        "user_id": user.user_id,
        "email": user.email,
        "base_profession": user.base_profession,
        "competencies": competencies,
        "professional_registrations": [
            {
                "authority": reg.authority,
                "number": reg.number,
                "jurisdiction": reg.jurisdiction
            }
            for reg in user.professional_registrations
        ],
        "exp": int(expire.timestamp()),
        "iat": int(datetime.utcnow().timestamp())
    }

    # Encode token
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token

def decode_access_token(token: str) -> TokenData:
    """Decode and validate JWT access token."""

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Validate required fields
        user_id: Optional[str] = payload.get("user_id")
        if user_id is None:
            raise credentials_exception

        return TokenData(**payload)

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise credentials_exception

def verify_token_from_header(authorization: str) -> TokenData:
    """Extract and verify token from Authorization header."""

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication scheme",
        )

    token = authorization.replace("Bearer ", "")
    return decode_access_token(token)
```

**Verification:** Test token creation and decoding with a sample user.

---

### Task 4.7: Create `backend/app/auth/decorators.py`

Authorization decorator for routes:

```python
# backend/app/auth/decorators.py

from functools import wraps
from fastapi import Request, HTTPException, status
from app.auth.jwt_handler import verify_token_from_header
from app.models.competencies import get_competency_risk_level

def requires_competency(competency: str):
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

**Verification:** Test decorator with a mock request and token.

---

### Task 4.8: Create `backend/app/routes/auth.py`

Authentication routes:

```python
# backend/app/routes/auth.py

from fastapi import APIRouter, HTTPException, status
from app.models.token import LoginRequest, Token
from app.models.user import User, ProfessionalRegistration
from app.auth.jwt_handler import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
import bcrypt

router = APIRouter(prefix="/auth", tags=["authentication"])

# TODO: Replace with actual database
# Mock user database for demonstration
MOCK_USERS = {
    "doctor@example.com": User(
        user_id="user_001",
        email="doctor@example.com",
        base_profession="physician",
        additional_competencies=["prescribe_controlled_drugs", "discharge_without_review"],
        removed_competencies=[],
        professional_registrations=[
            ProfessionalRegistration(
                authority="GMC",
                number="7654321",
                jurisdiction="uk",
                verified=True
            )
        ]
    ),
    "patient@example.com": User(
        user_id="user_002",
        email="patient@example.com",
        base_profession="patient",
        additional_competencies=[],
        removed_competencies=[]
    )
}

# Mock password hash (password: "password123")
MOCK_PASSWORD_HASH = bcrypt.hashpw("password123".encode(), bcrypt.gensalt())

@router.post("/login", response_model=Token)
async def login(request: LoginRequest):
    """
    Authenticate user and return JWT token.

    Token contains:
    - user_id
    - base_profession
    - competencies (final resolved list)
    - professional_registrations
    """

    # Find user
    user = MOCK_USERS.get(request.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Verify password
    if not bcrypt.checkpw(request.password.encode(), MOCK_PASSWORD_HASH):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Create token
    access_token = create_access_token(user)

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

@router.get("/me")
async def get_current_user(request: Request):
    """Get current user from token."""
    from app.auth.jwt_handler import verify_token_from_header

    authorization = request.headers.get("Authorization")
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token_data = verify_token_from_header(authorization)
    return token_data
```

---

### Task 4.9: Create example protected route `backend/app/routes/prescriptions.py`

```python
# backend/app/routes/prescriptions.py

from fastapi import APIRouter, Request
from pydantic import BaseModel
from app.auth.decorators import requires_competency

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])

class PrescriptionRequest(BaseModel):
    patient_id: str
    medication: str
    dose: str
    duration_days: int

@router.post("/non-controlled")
@requires_competency("prescribe_non_controlled")
async def prescribe_non_controlled(request: Request, prescription: PrescriptionRequest):
    """
    Prescribe non-controlled medication.
    Requires: prescribe_non_controlled competency
    """
    user = request.state.user

    # TODO: Implement prescription logic

    return {
        "message": "Prescription created",
        "prescriber": user.user_id,
        "patient": prescription.patient_id,
        "medication": prescription.medication
    }

@router.post("/controlled")
@requires_competency("prescribe_controlled_drugs")
async def prescribe_controlled(request: Request, prescription: PrescriptionRequest):
    """
    Prescribe controlled substance.
    Requires: prescribe_controlled_drugs competency
    """
    user = request.state.user

    # TODO: Implement controlled substance prescription logic
    # This would include additional checks:
    # - Verify professional registration (GMC/DEA)
    # - Check prescription limits
    # - Enhanced audit logging

    return {
        "message": "Controlled substance prescription created",
        "prescriber": user.user_id,
        "patient": prescription.patient_id,
        "medication": prescription.medication,
        "risk_level": "high"
    }
```

---

### Task 4.10: Create main FastAPI app `backend/app/main.py`

```python
# backend/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, prescriptions

app = FastAPI(
    title="Quill Medical API",
    description="NHS Electronic Patient Record System with CBAC",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(prescriptions.router)

@app.get("/")
async def root():
    return {"message": "Quill Medical API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

### Task 4.11: Test backend

```bash
cd backend
uvicorn app.main:app --reload
```

Test endpoints:

```bash
# Login as doctor
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@example.com","password":"password123"}'

# Use token to prescribe controlled drug
curl -X POST http://localhost:8000/prescriptions/controlled \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"PAT001","medication":"morphine","dose":"10mg","duration_days":7}'
```

**Verification:**

- Login works, returns JWT token
- Protected routes require valid token
- User without competency gets 403 error
- Interactive API docs at <http://localhost:8000/docs>

---

## Step 5: Frontend Implementation (React/TypeScript)

### Task 5.1: Create `frontend/src/types/competencies.ts`

Type inference from generated JSON:

```typescript
// frontend/src/types/competencies.ts

import competenciesData from "../generated/competencies.json";
import baseProfessionsData from "../generated/base-professions.json";

// Infer competency types from JSON
export type CompetencyId = (typeof competenciesData.competencies)[number]["id"];

export type Competency = (typeof competenciesData.competencies)[number];

export type BaseProfessionId =
  (typeof baseProfessionsData.base_professions)[number]["id"];

export type BaseProfession =
  (typeof baseProfessionsData.base_professions)[number];

// Helper to check if string is valid competency
export function isCompetencyId(value: string): value is CompetencyId {
  return competenciesData.competencies.some((c) => c.id === value);
}

// Get competency details by ID
export function getCompetencyDetails(id: CompetencyId): Competency | undefined {
  return competenciesData.competencies.find((c) => c.id === id);
}

// Get base profession details by ID
export function getBaseProfessionDetails(
  id: BaseProfessionId,
): BaseProfession | undefined {
  return baseProfessionsData.base_professions.find((p) => p.id === id);
}
```

**Verification:** TypeScript should auto-complete competency IDs when using `CompetencyId` type.

---

### Task 5.2: Create `frontend/src/auth/jwt.ts`

JWT decode utilities:

```typescript
// frontend/src/auth/jwt.ts

import { jwtDecode } from "jwt-decode";
import type { CompetencyId } from "../types/competencies";

export interface ProfessionalRegistration {
  authority: string;
  number: string;
  jurisdiction: string;
}

export interface TokenData {
  user_id: string;
  email: string;
  base_profession: string;
  competencies: CompetencyId[];
  professional_registrations: ProfessionalRegistration[];
  exp: number;
  iat: number;
}

export interface AuthState {
  token: string | null;
  user: TokenData | null;
  isAuthenticated: boolean;
}

/**
 * Decode JWT token (does NOT verify signature - backend must do that)
 */
export function decodeToken(token: string): TokenData {
  return jwtDecode<TokenData>(token);
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = decodeToken(token);
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp < now;
  } catch {
    return true;
  }
}

/**
 * Get token from localStorage
 */
export function getStoredToken(): string | null {
  return localStorage.getItem("access_token");
}

/**
 * Store token in localStorage
 */
export function storeToken(token: string): void {
  localStorage.setItem("access_token", token);
}

/**
 * Remove token from localStorage
 */
export function removeToken(): void {
  localStorage.removeItem("access_token");
}

/**
 * Get current auth state
 */
export function getAuthState(): AuthState {
  const token = getStoredToken();

  if (!token || isTokenExpired(token)) {
    return {
      token: null,
      user: null,
      isAuthenticated: false,
    };
  }

  return {
    token,
    user: decodeToken(token),
    isAuthenticated: true,
  };
}
```

---

### Task 5.3: Create `frontend/src/auth/permissions.ts`

Permission checking hooks:

```typescript
// frontend/src/auth/permissions.ts

import { useMemo } from "react";
import type { CompetencyId } from "../types/competencies";
import { getAuthState } from "./jwt";

/**
 * Hook to check if current user has a specific competency
 */
export function useHasCompetency(competency: CompetencyId): boolean {
  return useMemo(() => {
    const auth = getAuthState();
    if (!auth.isAuthenticated || !auth.user) return false;

    return auth.user.competencies.includes(competency);
  }, [competency]);
}

/**
 * Hook to check if user has ANY of the specified competencies
 */
export function useHasAnyCompetency(...competencies: CompetencyId[]): boolean {
  return useMemo(() => {
    const auth = getAuthState();
    if (!auth.isAuthenticated || !auth.user) return false;

    return competencies.some((c) => auth.user!.competencies.includes(c));
  }, [competencies]);
}

/**
 * Hook to check if user has ALL of the specified competencies
 */
export function useHasAllCompetencies(
  ...competencies: CompetencyId[]
): boolean {
  return useMemo(() => {
    const auth = getAuthState();
    if (!auth.isAuthenticated || !auth.user) return false;

    return competencies.every((c) => auth.user!.competencies.includes(c));
  }, [competencies]);
}

/**
 * Hook to get all user competencies
 */
export function useUserCompetencies(): CompetencyId[] {
  return useMemo(() => {
    const auth = getAuthState();
    return auth.user?.competencies || [];
  }, []);
}

/**
 * Hook to get user base profession
 */
export function useBaseProfession(): string | null {
  return useMemo(() => {
    const auth = getAuthState();
    return auth.user?.base_profession || null;
  }, []);
}
```

---

### Task 5.4: Create example component `frontend/src/components/PrescribeButton.tsx`

Permission-gated UI component:

```typescript
// frontend/src/components/PrescribeButton.tsx

import React from 'react';
import { useHasCompetency } from '../auth/permissions';

interface PrescribeButtonProps {
  patientId: string;
  isControlledSubstance: boolean;
  onPrescribe: () => void;
}

export function PrescribeButton({
  patientId,
  isControlledSubstance,
  onPrescribe
}: PrescribeButtonProps) {
  // Check competencies
  const canPrescribeNonControlled = useHasCompetency('prescribe_non_controlled');
  const canPrescribeControlled = useHasCompetency('prescribe_controlled_drugs');

  // Determine if button should be shown and enabled
  const canPrescribe = isControlledSubstance
    ? canPrescribeControlled
    : canPrescribeNonControlled;

  // Don't render button if user doesn't have ANY prescribing competency
  if (!canPrescribeNonControlled && !canPrescribeControlled) {
    return null;
  }

  return (
    <button
      onClick={onPrescribe}
      disabled={!canPrescribe}
      className={`
        px-4 py-2 rounded font-medium
        ${canPrescribe
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }
      `}
    >
      {isControlledSubstance ? 'Prescribe Controlled Drug' : 'Prescribe'}
      {isControlledSubstance && !canPrescribeControlled && (
        <span className="ml-2 text-sm">(Insufficient privileges)</span>
      )}
    </button>
  );
}
```

---

### Task 5.5: Create login page `frontend/src/pages/Login.tsx`

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

backend/generated/ # Auto-generated (gitignored)
├── competencies.json
├── base-professions.json
└── jurisdiction-config.json

frontend/src/generated/ # Auto-generated (gitignored)
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
3. Run `npm run generate:types`
4. Use in code with type safety

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
- [ ] `backend/generated/` and `frontend/src/generated/` contain auto-generated JSON (gitignored)
- [ ] Build script converts YAML → JSON

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
