# Competency-Based Access Control (CBAC)

## Overview

Quill Medical implements **Competency-Based Access Control (CBAC)** for authorization, replacing traditional role-based access control (RBAC) with a more flexible, clinically-accurate system based on individual clinical competencies.

### Why CBAC over RBAC?

Traditional RBAC assigns users to rigid job roles (e.g., "doctor", "nurse") with fixed permissions. CBAC recognizes that:

- **Healthcare professionals have varying training**: Two doctors may have different prescribing authorities, procedural skills, or certification capabilities based on their specific training and qualifications
- **Competencies are granular**: A nurse prescriber may have prescribing privileges without other doctor-only abilities
- **Regulation requires specificity**: Professional registration bodies (GMC, NMC) regulate specific clinical activities, not broad "doctor" roles
- **Organizations customize capabilities**: Hospitals may grant or restrict specific competencies based on local credentialing

**Example**: An FY1 doctor can prescribe non-controlled medications but not controlled drugs. An experienced nurse prescriber can prescribe specific drug classes. A GP can certify death; a newly qualified doctor cannot. RBAC would require creating separate roles for each combination; CBAC grants specific competencies to each individual.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Model                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ base_profession: "foundation_year_2"                    │   │
│  │ additional_competencies: ["prescribe_controlled_sch..."]│   │
│  │ removed_competencies: ["certify_death"]                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────┬────────────────────────────────────────────────────────┘
         │
         │ get_final_competencies()
         ↓
┌─────────────────────────────────────────────────────────────────┐
│              Competency Resolution (resolve_user_competencies)  │
│                                                                  │
│  1. Load base profession competencies                           │
│     (from shared/base-professions.yaml)                         │
│  2. Add additional_competencies                                 │
│  3. Remove removed_competencies                                 │
│  4. Return final list                                           │
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
├── competencies.py      - Loads competencies.yaml, provides validation
├── base_professions.py  - Loads base-professions.yaml
└── decorators.py        - has_competency(), FastAPI dependencies

shared/
├── competencies.yaml        - All competency definitions
└── base-professions.yaml    - Default competency sets per profession
```

## Data Model

### User Fields (backend/app/models.py)

Each `User` has three CBAC fields:

```python
class User(Base):
    base_profession: str = "patient"  # Base profession ID
    additional_competencies: list[str] = []  # Extra competencies added
    removed_competencies: list[str] = []  # Competencies removed

    def get_final_competencies(self) -> list[str]:
        """Compute final competencies: base + additional - removed."""
        return resolve_user_competencies(
            base_profession=self.base_profession,
            additional_competencies=self.additional_competencies,
            removed_competencies=self.removed_competencies,
        )
```

**Resolution Formula**:

```
final_competencies = (base_profession_competencies ∪ additional_competencies) - removed_competencies
```

### Example User Configuration

```python
# FY2 doctor with extra controlled drug prescribing, but death certification removed
user = User(
    username="dr_smith",
    base_profession="foundation_year_2",
    additional_competencies=["prescribe_controlled_schedule_2"],
    removed_competencies=["certify_death"],  # Not yet trained
)

# Final competencies = FY2 base + prescribe_controlled_sch2 - certify_death
# Result: can prescribe controlled drugs, cannot certify death
```

## Configuration Files

### competencies.yaml

Defines all available competencies in the system. Located at `shared/competencies.yaml`.

**Structure**:

```yaml
competencies:
  - id: prescribe_controlled_schedule_2
    display_name: "Prescribe Schedule 2 Controlled Drugs"
    description: "Ability to prescribe Schedule 2 controlled drugs (e.g., morphine, fentanyl)"
    category: prescribing
    risk_level: high
    requires_registration: true
    registration_type: ["GMC"]
    audit_retention_days: 2555 # 7 years
    clinical_safety_notes: "High-risk competency. Risks: Addiction, overdose, diversion."
```

**Key Fields**:

- `id`: Unique competency identifier (used in code)
- `risk_level`: `low`, `medium`, or `high` (affects audit logging)
- `requires_registration`: Whether professional registration needed
- `registration_type`: Which registrations qualify (GMC, NMC, GPhC, etc.)
- `clinical_safety_notes`: Safety considerations for Clinical Safety Officer

**Competency Categories**:

- `prescribing`: Medication prescribing authorities
- `certification`: Medical certifications (death, fitness to work, etc.)
- `procedures`: Clinical procedures (venepuncture, lumbar puncture, etc.)
- `imaging`: Requesting diagnostic imaging
- `data_access`: Accessing patient records

### base-professions.yaml

Defines standard competency sets for common healthcare professions. Located at `shared/base-professions.yaml`.

**Structure**:

```yaml
base_professions:
  - id: foundation_year_1
    display_name: "Foundation Year 1 Doctor (FY1)"
    description: "Newly qualified doctor in first year of foundation training"
    base_competencies:
      - access_patient_records
      - modify_patient_records
      - perform_venepuncture
      - prescribe_non_controlled
      - certify_fitness_to_work
    notes: "FY1 doctors require supervision for prescribing."
```

**Available Base Professions**:

- `patient` - Public users (own records only)
- `foundation_year_1` - FY1 doctors
- `foundation_year_2` - FY2 doctors
- `specialty_trainee_1_2` - ST1-2 doctors
- `specialty_trainee_3_plus` - ST3+ doctors
- `consultant` - Consultant physicians
- `gp_partner` - GP partners
- `nurse_prescriber` - Nurse prescribers
- `pharmacist_independent` - Independent pharmacist prescribers

## API Protection

### Using has_competency()

Protect endpoints by requiring specific competencies:

```python
from fastapi import Depends
from app.cbac.decorators import has_competency
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
from app.cbac.decorators import requires_any_competency

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
# - prescribe_non_controlled
# - certify_fitness_to_work
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
additional_competencies = ["certify_cremation"]  # Completed 5+ years, trained
removed_competencies = []

# Result: consultant base + certify_cremation
# - All consultant competencies
# - prescribe_controlled_schedule_2
# - certify_death
# - certify_cremation (added)
```

**Example 4: Nurse Prescriber (Non-Doctor)**

```python
base_profession = "nurse_prescriber"
additional_competencies = []
removed_competencies = []

# Result: nurse prescriber base competencies
# - access_patient_records
# - prescribe_non_controlled
# - prescribe_controlled_schedule_3_4_5 (limited formulary)
# (Cannot certify death, cannot request CT/MRI)
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
print(details["risk_level"])  # "high"
print(details["requires_registration"])  # True
```

### Type Hints

```python
from app.cbac.competencies import CompetencyId

# CompetencyId is a Literal type of all valid competency IDs
def grant_competency(user: User, competency: CompetencyId) -> None:
    # Type checker validates competency is valid ID
    user.additional_competencies.append(competency)
```

## Audit Logging

### High-Risk Competencies

CBAC automatically identifies high-risk competencies for audit logging:

```python
risk_level = get_competency_risk_level("prescribe_controlled_schedule_2")
# Returns: "high"

# High-risk competencies:
# - prescribe_controlled_schedule_2 (Schedule 2 drugs)
# - certify_death (death certification)
# - certify_cremation (cremation forms)
# - perform_general_anaesthetic (anaesthesia)
```

**TODO**: Audit logging is currently a placeholder. When implemented, high-risk competency checks will log:

- User ID
- Competency checked
- Success/failure
- Timestamp
- Request context

### Audit Retention

Each competency specifies required audit retention period:

```yaml
- id: prescribe_controlled_schedule_2
  audit_retention_days: 2555 # 7 years (regulatory requirement)
```

## Safety Considerations

### Clinical Safety Review Required

**IMPORTANT**: All changes to`competencies.yaml` and `base-professions.yaml` must be reviewed by the Clinical Safety Officer and documented in the clinical safety log (DCB 0129 requirement).

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

1. **Define competency** in `shared/competencies.yaml`:

   ```yaml
   - id: prescribe_unlicensed_medication
     display_name: "Prescribe Unlicensed Medications"
     description: "Off-label or unlicensed drug prescribing"
     category: prescribing
     risk_level: high
     requires_registration: true
     registration_type: ["GMC"]
     audit_retention_days: 2555
     clinical_safety_notes: "Requires consultant-level expertise..."
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

Compute final competencies for a user.

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
def get_competency_details(competency_id: str) -> dict | None
```

Get full metadata for a competency from YAML.

#### get_competency_risk_level

```python
def get_competency_risk_level(competency_id: str) -> str
```

Get risk level: "low", "medium", or "high".

## Implementation Status

### ✓ Implemented

- Competency data model (User fields)
- Competency resolution logic
- YAML configuration loading
- `has_competency()` FastAPI dependency
- `requires_any_competency()` dependency
- Type-safe competency IDs
- Risk level classification

### ⚠️ TODO / Pending

- Audit logging for high-risk competencies
- Professional registration API validation (GMC, NMC, GPhC)
- Supervision tracking and enforcement
- Competency expiry dates (revalidation)
- User interface for competency management
- Competency assignment workflow (request → approval → grant)
- Integration with clinical records (supervisor sign-off)

## Related Documentation

- [User Model](../backend/app/models.py) - User database schema
- [FastAPI Main](../backend/app/main.py) - Example usage in `/prescriptions/controlled` endpoint
- [Competencies YAML](../../shared/competencies.yaml) - All competency definitions
- [Base Professions YAML](../../shared/base-professions.yaml) - Default profession competency sets
