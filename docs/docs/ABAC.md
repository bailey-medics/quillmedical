# ABAC Authorization System for Quill Medical

## Overview

Quill Medical uses Attribute-Based Access Control (ABAC) with a competency-based model. This matches real NHS workforce structures where authorization depends on verified competencies, not just job titles.

## Core Concepts

### Competencies

Individual permissions representing specific actions a user can perform.

**Examples:**

- `prescribe_medications` - Can prescribe non-controlled medications
- `prescribe_controlled_drugs` - Can prescribe Schedule 2-5 controlled drugs
- `view_all_patients` - Can view all patient records
- `view_assigned_patients` - Can only view assigned patients
- `discharge_patients` - Can independently discharge patients
- `manage_ventilation` - Can manage NIV/invasive ventilation
- `order_imaging` - Can order X-ray/CT/MRI

### Roles

Collections of competencies that are automatically granted together. Roles serve as "starter packs" for common job types.

**Examples:**

- **Consultant** → gets: `view_all_patients`, `prescribe_medications`, `prescribe_controlled_drugs`, `discharge_patients`, `order_imaging`
- **Registered Nurse** → gets: `view_assigned_patients`, `document_observations`, `administer_medications`, `order_bloods`
- **Patient** → gets: `view_own_records`

### User Authorization Flow

1. User is assigned one or more **roles** (e.g., "Registered Nurse")
2. System automatically grants **competencies** associated with that role
3. Additional **competencies** can be added individually (e.g., `prescribe_medications` for nurse prescribers)
4. System checks **competencies** (not roles) when authorizing actions

## Real-World Examples

### Example 1: Nurse Prescriber

#### Sarah (Registered Nurse with prescribing qualification)

**Roles assigned:**

- `registered_nurse`

**Competencies from role:**

- `view_assigned_patients`
- `document_observations`
- `administer_medications`
- `order_bloods`

**Additional competency added:**

- `prescribe_medications` (granted 2023, verified by NMC, expires 2026)

**Result:** Sarah can do everything a nurse can do, plus prescribe medications.

### Example 2: Patient Who Is Also a GP

#### Dr. Jane Doe (GP and patient at the same clinic)

**Account 1 (as patient):**

- Role: `patient`
- Competencies: `view_own_records`

**Account 2 (as GP):**

- Role: `consultant`
- Competencies: `view_all_patients`, `prescribe_medications`, `discharge_patients`, etc.

**Result:** Separate accounts for different contexts, or single account with multiple roles if trust policy allows.

## Database Schema

### Competencies Table

```sql
CREATE TABLE competencies (
    id UUID PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    requires_professional_verification BOOLEAN DEFAULT FALSE,
    risk_level VARCHAR(20) DEFAULT 'low'
);
```

### Roles Table

```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);
```

### Role-Competency Mapping

```sql
CREATE TABLE role_competencies (
    role_id UUID REFERENCES roles(id),
    competency_id UUID REFERENCES competencies(id),
    granted_by_default BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (role_id, competency_id)
);
```

### User-Role Assignment

```sql
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id),
    role_id UUID REFERENCES roles(id),
    assigned_date TIMESTAMP DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    trust_authorization_ref VARCHAR(100),
    PRIMARY KEY (user_id, role_id)
);
```

### User-Competency Overrides

```sql
CREATE TABLE user_competencies (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    competency_id UUID REFERENCES competencies(id),
    granted_date TIMESTAMP DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP,
    verification_reference VARCHAR(255),
    requires_supervision BOOLEAN DEFAULT FALSE,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, competency_id)
);
```

## Backend Authorization (FastAPI)

### Protecting Endpoints

**Check specific competency:**

```python
@router.post("/prescriptions")
def create_prescription(
    prescription: PrescriptionCreate,
    current_user = Depends(require_competency(["prescribe_medications"]))
):
    """Only users with prescribe_medications competency can access"""
    return create_prescription_in_db(prescription, current_user["user_id"])
```

**Check multiple competencies (user needs at least one):**

```python
@router.get("/patients/{patient_id}")
def get_patient(
    patient_id: UUID,
    current_user = Depends(require_competency(["view_all_patients", "view_assigned_patients"]))
):
    """User needs either view_all_patients OR view_assigned_patients"""
    # Additional logic to check if patient is assigned if user only has view_assigned_patients
    return get_patient_from_db(patient_id)
```

**Check controlled drugs separately:**

```python
@router.post("/prescriptions/controlled")
def prescribe_controlled(
    prescription: ControlledDrugPrescription,
    current_user = Depends(require_competency(["prescribe_controlled_drugs"]))
):
    """Requires higher-level competency for controlled drugs"""
    return create_controlled_prescription_in_db(prescription, current_user["user_id"])
```

### How Backend Checks Work

1. User makes API request with JWT token
2. Backend decodes token to get `user_id`
3. Backend queries database for user's competencies:
   - Gets competencies from all user's roles
   - Gets individual competency grants
   - Combines into complete set
4. Backend checks if required competency is in user's set
5. If yes → allow access
6. If no → return 403 Forbidden
7. Log authorization check to audit trail

## Frontend Authorization (React)

### Hiding UI Elements

**Hide buttons based on competency:**

```typescript
import { ShowForCompetency } from '@/components/auth/RequireCompetency';

export function PatientDetailsPage() {
  return (
    <div>
      <PatientInfo />

      <ShowForCompetency competencies={['prescribe_medications']}>
        <Button onClick={handlePrescribe}>Prescribe Medication</Button>
      </ShowForCompetency>

      <ShowForCompetency competencies={['prescribe_controlled_drugs']}>
        <Button onClick={handlePrescribeControlled}>
          Prescribe Controlled Drug
        </Button>
      </ShowForCompetency>

      <ShowForCompetency competencies={['discharge_patients']}>
        <Button onClick={handleDischarge}>Discharge Patient</Button>
      </ShowForCompetency>
    </div>
  );
}
```

**Hide navigation items:**

```typescript
export function SideNav() {
  return (
    <nav>
      <NavLink to="/home">Home</NavLink>

      <ShowForCompetency competencies={['view_all_patients', 'view_assigned_patients']}>
        <NavLink to="/patients">Patient List</NavLink>
      </ShowForCompetency>

      <ShowForCompetency competencies={['prescribe_medications']}>
        <NavLink to="/prescriptions">Prescriptions</NavLink>
      </ShowForCompetency>

      <ShowForCompetency competencies={['manage_users']}>
        <NavLink to="/admin/users">User Management</NavLink>
      </ShowForCompetency>
    </nav>
  );
}
```

**Protect entire pages:**

```typescript
<Route
  path="/prescriptions"
  element={
    <RequireCompetency competencies={['prescribe_medications']}>
      <PrescriptionsPage />
    </RequireCompetency>
  }
/>
```

### How Frontend Checks Work

1. User logs in
2. Backend returns JWT token containing user's competencies
3. Frontend stores token and decodes it
4. React context provides `hasCompetency()` function
5. Components check competencies before rendering
6. If user lacks competency → hide button/link
7. **Important:** Backend still enforces - frontend is just UX convenience

## Audit Trail

Every authorization check is logged for NHS compliance:

```sql
CREATE TABLE authorization_audit_log (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100),
    resource_type VARCHAR(50),
    resource_id UUID,
    competency_required VARCHAR(100),
    authorization_result VARCHAR(20),
    denial_reason TEXT,
    ip_address VARCHAR(45)
);
```

**Example audit entries:**

```
| timestamp           | user_id | action              | competency_required     | result  |
|---------------------|---------|---------------------|-------------------------|---------|
| 2026-02-08 14:32:15 | uuid123 | prescribe_medication| prescribe_medications   | granted |
| 2026-02-08 14:33:42 | uuid456 | prescribe_medication| prescribe_medications   | denied  |
| 2026-02-08 14:35:20 | uuid123 | view_patient        | view_all_patients       | granted |
```

## Key Features

### 1. Role-Based Shortcuts

Assign role → automatically get base competencies

### 2. Individual Competency Grants

Add specific competencies on top of role (e.g., prescribing for nurses)

### 3. Expiry & Revalidation

Competencies can expire and require renewal (e.g., prescribing qualification every 3 years)

### 4. Supervision Flags

Mark competency as "requires supervision" (e.g., FY1 doctor can prescribe but needs countersignature)

### 5. Professional Verification

Link competencies to GMC/NMC registration numbers

### 6. Trust Authorization

Document which trust approved the competency grant

### 7. Complete Audit Trail

Every authorization check logged for CQC/NHS compliance

## Why This Model for NHS?

✅ **Matches reality** - NHS roles are fluid (locums, acting up, cross-cover)
✅ **Handles edge cases** - Nurse prescribers, PAs, ANPs, trust grade doctors
✅ **Legally accurate** - Reflects actual scope of practice, not job title
✅ **Professionally aligned** - Maps to GMC/NMC competencies
✅ **Audit compliant** - Full trail of who can do what and why
✅ **Flexible** - Can adapt as workforce models evolve

## Implementation Priority

### Phase 1 (MVP)

- Core competency tables
- Role-competency mapping
- Basic role assignment
- Backend competency checking
- Frontend competency hiding

### Phase 2 (Enhancement)

- Individual competency grants
- Expiry and revalidation
- Supervision flags
- Professional verification tracking

### Phase 3 (Advanced)

- Competency prerequisites
- Temporary competency grants
- Competency delegation
- Advanced audit reporting
