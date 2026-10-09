# Competency-Based Access Control (CBAC)

## Overview

Quill Medical implements **Competency-Based Access Control (CBAC)** for authorization, replacing traditional role-based access control (RBAC) with a more flexible, clinically-accurate system based on individual clinical competencies.

### Why CBAC over RBAC?

Traditional RBAC assigns users to rigid job roles (e.g., "doctor", "nurse") with fixed permissions. CBAC recognizes that:

- **Healthcare professionals have varying training**: Two doctors may have different prescribing authorities, procedural skills, or certification capabilities based on their specific training and qualifications
- **Competencies are granular**: A nurse prescriber may have prescribing privileges without other doctor-only abilities
- **Regulation requires specificity**: Professional registration bodies (GMC, NMC) regulate specific clinical activities, not broad "doctor" roles
- **Organisations customise capabilities**: Hospitals may grant or restrict specific competencies based on local credentialing

**Example**: An FY1 doctor can prescribe non-controlled medications but not controlled drugs. An experienced nurse prescriber can prescribe specific drug classes. A GP can certify death; a newly qualified doctor cannot. RBAC would require creating separate roles for each combination; CBAC grants specific competencies to each individual.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Model                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ base_profession: "foundation_year_2"                    │   │
│  │ competency_grants: rows in user_competency, one per     │   │
│  │   grant, each with a start, an end and a source         │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────┬────────────────────────────────────────────────────────┘
         │
         │ get_final_competencies()
         ↓
┌─────────────────────────────────────────────────────────────────┐
│              Current grants                                      │
│                                                                  │
│  1. Read the user's user_competency rows                        │
│  2. Keep those that have started and have not ended             │
│  3. Return their competency ids                                 │
│     (the base profession seeded rows once; it is not read here) │
└────────┬────────────────────────────────────────────────────────┘
         │
         │ Final competencies: ["access_patient_records",
         │                     "prescribe_non_controlled",
         │                     "prescribe_controlled_schedule_2",
         │                     ...]
         ↓
┌─────────────────────────────────────────────────────────────────┐
│                  API Endpoint Protection                        │
│                                                                  │
│  @app.post("/prescriptions/controlled")                         │
│  async def prescribe_controlled(                                │
│      user: User = Depends(has_competency("prescribe_..."))      │
│  ):                                                              │
│      # Only callable if user has competency                     │
│      ...                                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Module Structure

```
backend/app/cbac/
├── __init__.py          - Public API exports
├── competencies.py      - Merges competency-definitions/, provides validation
├── base_professions.py  - Loads base-professions.yaml
├── grants.py            - Turns a saved pair of lists into user_competency rows
├── grant_scope.py       - What a caller may grant (may_grant, may_assign_professions)
├── practising.py        - What somebody may practise at one place
├── positions.py         - Positions and who holds them
└── audit.py             - Finds unknown and retired ids in stored data

backend/app/deps.py      - has_competency(), FastAPI dependencies

shared/
├── competency-definitions/  - All competency definitions, merged at load
│   ├── clinical.yaml        - What may be done in the care of a patient
│   ├── oncology.yaml        - Oncology competencies, clinical in kind
│   ├── clinical-admin.yaml  - Running the clinical service
│   ├── admin.yaml           - Administering a place
│   ├── teaching.yaml        - Who may use the teaching feature
│   ├── passport.yaml        - Who may use the clinician passport
│   └── safety.yaml          - Who may use the safety feature
└── base-professions.yaml    - Default competency sets per profession
```

## Data Model

### User Fields (backend/app/models.py)

Each `User` has a base profession and a set of grants:

```python
class User(Base):
    base_profession: str = "patient"  # Base profession ID
    competency_grants: list[UserCompetency]  # One row per grant

    def get_final_competencies(self) -> list[str]:
        """The ids of this user's current grant rows, and nothing else."""
```

A grant is a row in `user_competency` (`UserCompetency`), carrying `competency_id`, `starts_on`, `ends_on`, `source`, `org_unit_id` and `granted_by`. Rows are inserted or closed, never deleted: taking a competency away sets `ends_on`, so what somebody could do last year stays answerable.

**The base profession seeds rows once.** When somebody is given a profession, its competencies are written as rows with the source `profession`, and from then on only the rows count. An edit to `shared/base-professions.yaml` changes only people given the profession afterwards.

**The formula describes a save, not a read.** The user editor works in two lists read against the profession: `additional`, what somebody holds beyond it, and `removed`, what it gives that they do not hold. `sync_competency_rows` in `backend/app/cbac/grants.py` brings the rows into line with:

```
competencies to hold = (base_profession_competencies + additional) - removed
```

### Example User Configuration

```python
# FY2 doctor with extra controlled drug prescribing, but death certification removed
user = User(username="dr_smith", base_profession="foundation_year_2")
sync_competency_rows(
    user,
    additional=["prescribe_controlled_schedule_2"],
    removed=["certify_death"],  # Not yet trained
    source="admin",
    granted_by=admin.id,
)

# Rows now held = FY2 base + prescribe_controlled_sch2 - certify_death
# Result: can prescribe controlled drugs, cannot certify death
```

## Configuration Files

### competency-definitions/

Defines all available competencies in the system. Located at
`shared/competency-definitions/`, a directory whose files are merged into
one flat catalogue at load time.

The split is by kind, for the reader: `clinical.yaml` and `oncology.yaml` hold
what may be done in the care of a patient; `clinical-admin.yaml`,
`admin.yaml`, `teaching.yaml`, `passport.yaml` and `safety.yaml` hold what
may be done to Quill itself. The code sees one catalogue and the id is what everything
references, so moving an entry between files changes nothing. **Ids must
be unique across the whole directory**, not merely within a file - a
duplicate is refused at load, and in CI.

**Structure**:

```yaml
competencies:
  - id: prescribe_controlled_schedule_2
    display_name: "Prescribe Schedule 2 Controlled Drugs"
    assessable: true
```

**Key Fields**:

- `id`: Unique competency identifier (used in code)
- `display_name`: Human-readable name
- `retired_on`: The date the competency stopped being available for new use. Entries are retired, not deleted
- `levels`, `expires_after_months`, `assessable`: read by the clinician passport; CBAC ignores them
- `may_grant`, `may_assign_professions`: what a holder may grant to other people

An entry may carry no other field: the loader refuses anything else.

**Competency Categories** (comment headings in `clinical.yaml`, not a field):

- `prescribing`: Medication prescribing authorities
- `certification`: Medical certifications (death, fitness to work, etc.)
- `procedures`: Clinical procedures (venepuncture, lumbar puncture, etc.)
- `patient_management`: Patient admission, discharge, and referral
- `consent`: Informed consent and mental capacity assessment
- `diagnostics`: Requesting diagnostic imaging (X-ray, CT, MRI)
- `administrative`: Clinic admin, user management, letter approval
- `specialty`: Specialist clinical skills (diabetes, anticoagulation, ECG)

### base-professions.yaml

Defines standard competency sets for common healthcare professions. Located at `shared/base-professions.yaml`.

**Structure**:

```yaml
base_professions:
  - id: foundation_year_1
    display_name: "Foundation Year 1 Doctor (FY1)"
    description: "Newly qualified doctor in first year of foundation training"
    requires_clinical_services: true
    base_competencies:
      - access_patient_records
      - modify_patient_records
      - perform_venepuncture
      - perform_cannulation
      - request_plain_xray
      - take_informed_consent
      - refer_specialty
      - prescribe_non_controlled
      - certify_fitness_to_work
      - assess_clinician_passport
```

**Available Base Professions**:

- `patient` - Public users (own records only)
- `foundation_year_1` - FY1 doctors
- `foundation_year_2` - FY2 doctors
- `specialty_trainee_1_2` - ST1-2 doctors
- `specialty_trainee_3_plus` - ST3+ doctors
- `consultant` - Consultant physicians
- `general_practitioner` - General practitioners
- `registered_nurse` - Registered nurses
- `advanced_nurse_practitioner` - Advanced nurse practitioners
- `healthcare_assistant` - Healthcare assistants
- `pharmacist` - Pharmacists
- `pharmacy_technician` - Pharmacy technicians
- `physiotherapist` - Physiotherapists
- `occupational_therapist` - Occupational therapists
- `paramedic` - Paramedics
- `medical_secretary` - Medical secretaries
- `receptionist` - Receptionists
- `clinic_manager` - Clinic managers
- `patient_manager` - Patient managers
- `system_administrator` - System administrators
- `superadmin_profession` - Superadmins
- `teaching_delegate` - Teaching delegates
- `teaching_clinical_lead` - Teaching clinical leads
- `teaching_admin` - Teaching admins
- `safety_officer` - Safety officers
- `safety_clinical_lead` - Safety clinical leads
- `safety_admin` - Safety admins
- `patient_advocate` - Patient advocates
- `external_hcp` - External healthcare professionals
- `passport_delegate` - Passport delegates
- `passport_clinical_lead` - Passport clinical leads
- `passport_admin` - Passport admins
- `passport_external_assessor` - Passport external assessors

## API Protection

### Using has_competency()

Protect endpoints by requiring specific competencies:

```python
from fastapi import Depends
from app.deps import has_competency
from app.main import DEP_CURRENT_USER

@router.post("/prescriptions/controlled")
async def prescribe_controlled(
    prescription: PrescriptionRequest,
    user: User = Depends(has_competency("prescribe_controlled_schedule_2")),
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Prescribe Schedule 2 controlled substance.

    Only callable by users with prescribe_controlled_schedule_2 competency.
    """
    # User guaranteed to have competency
    return {"status": "prescribed", "prescriber": user.username}
```

**What happens**:

1. `has_competency()` creates a FastAPI dependency
2. Dependency calls `user.get_final_competencies()`
3. Checks if `"prescribe_controlled_schedule_2"` in final competencies
4. If **yes**: Allows request, returns `user`
5. If **no**: Raises `HTTPException(403)` with error message

### Requiring Multiple Competencies

Use `requires_any_competency()` for "user needs at least one of these":

```python
from app.deps import requires_any_competency

@router.post("/certify-fitness")
async def certify_fitness(
    user: User = Depends(requires_any_competency(
        "certify_fitness_to_work",
        "certify_fitness_to_drive"
    ))
):
    """Certify fitness - accepts either work or driving certification."""
    pass
```

For "user needs all of these", chain dependencies:

```python
@router.post("/high-risk-procedure")
async def perform_procedure(
    user1: User = Depends(has_competency("perform_lumbar_puncture")),
    user2: User = Depends(has_competency("assess_mental_capacity")),
):
    """User must have both competencies."""
    pass
```

## Competency Resolution Logic

`resolve_user_competencies` works out what one save should leave somebody holding. It is called when a save is turned into rows, not on every read: a read returns the current rows.

### Implementation (backend/app/cbac/base_professions.py)

```python
def resolve_user_competencies(
    base_profession: str,
    additional_competencies: list[str] | None = None,
    removed_competencies: list[str] | None = None,
) -> list[str]:
    """Resolve final competencies for a user.

    Args:
        base_profession: User's base profession ID
        additional_competencies: Extra competencies added to this user
        removed_competencies: Competencies removed from this user

    Returns:
        List of final competency IDs for this user
    """
    base = set(get_profession_base_competencies(base_profession))
    additional = set(additional_competencies or [])
    removed = set(removed_competencies or [])

    final = (base | additional) - removed
    return list(final)
```

### Examples

**Example 1: FY1 Doctor (Standard)**

```python
base_profession = "foundation_year_1"
additional_competencies = []
removed_competencies = []

# Result: FY1 base competencies
# - access_patient_records
# - modify_patient_records
# - perform_venepuncture
# - perform_cannulation
# - request_plain_xray
# - take_informed_consent
# - refer_specialty
# - prescribe_non_controlled
# - certify_fitness_to_work
# - assess_clinician_passport
# (Cannot prescribe controlled drugs, cannot certify death)
```

**Example 2: FY2 Doctor with Restrictions**

```python
base_profession = "foundation_year_2"
additional_competencies = []
removed_competencies = ["certify_death"]  # Not yet trained

# Result: FY2 base - certify_death
# - access_patient_records
# - prescribe_non_controlled
# - prescribe_controlled_schedule_3_4_5
# (Cannot certify death - removed due to lack of training)
```

**Example 3: Consultant with Extra Competency**

```python
base_profession = "consultant"
additional_competencies = ["prescribe_sact"]  # Completed SACT training
removed_competencies = []

# Result: consultant base + prescribe_sact
# - All consultant competencies (including certify_cremation, certify_death)
# - prescribe_controlled_schedule_2
# - prescribe_sact (added)
```

**Example 4: Advanced Nurse Practitioner**

```python
base_profession = "advanced_nurse_practitioner"
additional_competencies = []
removed_competencies = []

# Result: advanced nurse practitioner base competencies
# - access_patient_records
# - modify_patient_records
# - perform_venepuncture
# - perform_cannulation
# - request_plain_xray
# - take_informed_consent
# - assess_mental_capacity
# - refer_specialty
# - prescribe_non_controlled
# - prescribe_controlled_schedule_3_4_5
# - certify_fitness_to_work
# - approve_clinical_letters
# - assess_clinician_passport
```

## Validation & Type Safety

### Runtime Validation

```python
from app.cbac.competencies import is_valid_competency, get_competency_details

# Check if competency ID exists
if not is_valid_competency("prescribe_controlled_schedule_2"):
    raise ValueError("Invalid competency ID")

# Get competency metadata
details = get_competency_details("prescribe_controlled_schedule_2")
print(details.display_name)  # "Prescribe Schedule 2 Controlled Drugs"
print(details.assessable)  # True
```

## Audit Logging

**TODO**: Audit logging is currently a placeholder. When implemented, competency checks will log:

- User ID
- Competency checked
- Success/failure
- Timestamp
- Request context

## Safety Considerations

### Clinical Safety Review Required

**IMPORTANT**: All changes to `shared/competency-definitions/` and `base-professions.yaml` must be reviewed by the Clinical Safety Officer and documented in the clinical safety log (DCB 0129 requirement).

### Professional Registration Validation

**TODO**: System currently accepts user-declared professional registrations. Future implementation must:

1. Validate GMC/NMC/GPhC registration numbers via API
2. Verify registration is active (not suspended/revoked)
3. Check registration renewal dates
4. Audit registration checks

### Supervision Requirements

Some competencies require supervision even when granted:

```yaml
- id: perform_lumbar_puncture
  requires_supervision: true
  supervision_level: "direct" # Senior present
```

**TODO**: Implement supervision tracking in clinical records.

## Adding New Competencies

### Process

1. **Define competency** in the right file under `shared/competency-definitions/`:

   ```yaml
   - id: prescribe_unlicensed_medication
     display_name: "Prescribe Unlicensed Medications"
     assessable: true
   ```

2. **Update base professions** if needed in `shared/base-professions.yaml`:

   ```yaml
   - id: consultant
     base_competencies:
       - prescribe_unlicensed_medication # Add to consultant base
   ```

3. **Clinical Safety Review**: CSO reviews risk assessment, registration requirements, audit needs

4. **Code Protection**: Add endpoint protection:

   ```python
   @router.post("/prescriptions/unlicensed")
   async def prescribe_unlicensed(
       user: User = Depends(has_competency("prescribe_unlicensed_medication"))
   ):
       ...
   ```

5. **Documentation**: Update this file and user documentation

## API Reference

### Functions

#### resolve_user_competencies

```python
def resolve_user_competencies(
    base_profession: str,
    additional_competencies: list[str] | None = None,
    removed_competencies: list[str] | None = None,
) -> list[str]
```

Work out what one save should leave a user holding: the profession's competencies, plus `additional`, minus `removed`.

#### has_competency

```python
def has_competency(competency: str) -> Callable[[Request, User], User]
```

FastAPI dependency to require a specific competency.

#### requires_any_competency

```python
def requires_any_competency(*competencies: str) -> Callable[[Request, User], User]
```

FastAPI dependency to require at least one of specified competencies.

#### get_competency_details

```python
def get_competency_details(competency_id: str) -> CompetencyEntry | None
```

Get the catalogue entry for a competency.

## Implementation Status

### ✓ Implemented

- Competency data model (`user_competency` grant rows)
- Competency resolution logic
- YAML configuration loading
- `has_competency()` FastAPI dependency
- `requires_any_competency()` dependency
- Type-safe competency IDs
- User interface for competency management

### ⚠️ TODO / Pending

- Audit logging for competency checks
- Professional registration API validation (GMC, NMC, GPhC)
- Supervision tracking and enforcement
- Competency expiry dates (revalidation) - a grant can end, but nothing acts on a definition's `expires_after_months`
- Competency assignment workflow (request → approval → grant)
- Integration with clinical records (supervisor sign-off)

## Related Documentation

- [User model](../../../backend/app/models.py) - User database schema
- [FastAPI dependencies](../../../backend/app/deps.py) - `has_competency`, with a `/prescriptions/controlled` example in its docstring
- [Competency definitions](../../../shared/competency-definitions/) - All competency definitions
- [Base professions YAML](../../../shared/base-professions.yaml) - Default profession competency sets
