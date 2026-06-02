# Organisation and Site plan

## Context

Organisations are logical entities — teaching programmes (e.g. EoEETA), NHS
trusts, or other governing bodies. Sites represent locations (physical or
virtual) within the healthcare system: hospitals, buildings, wards, rooms,
clinics, or virtual meeting rooms. The same Site model serves both teaching
(clinical lead governance) and clinical (EPR/trust structure) use cases.

A Site can serve multiple Organisations (e.g. a hospital hosts both a teaching
programme and belongs to an NHS trust), and Organisations can have many Sites.

## Domain model

```
Organisation (logical entity)
  ├── Teaching programme (e.g. EoEETA — owns teaching materials)
  └── NHS Trust (e.g. Cambridge University Hospitals — owns EPR/clinical data)
  ↕ many-to-many
Site hierarchy (self-referential):
  Hospital (e.g. Addenbrooke's)
    └── Building (e.g. Main Block)
        └── Ward / Department (e.g. Endoscopy Unit)
            └── Room / Bed / Clinic (e.g. Room 3)
  Virtual Meeting Room (e.g. MDT Video Call)
```

### Teaching use case

- EoEETA (Organisation) links to multiple hospital Sites across the region
- Clinical leads at each Site manage local trainee governance
- Trainees register under a Site, validated by their clinical lead

### Clinical (EPR) use case

- NHS Trust (Organisation) links to its hospital Sites
- Staff belong to wards/departments within the trust's Sites
- Patient encounters are assigned to a Site (ward, clinic, bed)
- Enables trust-scoped data access and audit

## Key decisions

| Decision             | Choice                               | Rationale                                                                                                                              |
| -------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Site vs Organisation | Separate model                       | Sites represent physical/virtual hierarchy (hospital → room, virtual meeting); Organisations are logical entities (programmes, trusts) |
| Site hierarchy       | Self-referential `parent_id` on Site | Supports Hospital > Building > Ward > Room nesting                                                                                     |
| Org-Site link        | Many-to-many                         | A hospital can serve multiple programmes; a programme spans multiple hospitals                                                         |
| Clinical leads       | Staff members of a Site with a role  | Validates trainee registration by email lookup                                                                                         |

## Database schema

### `sites` table

| Column     | Type                  | Notes                                                       |
| ---------- | --------------------- | ----------------------------------------------------------- |
| id         | Integer PK            | Auto-increment                                              |
| name       | String(255)           | Required, indexed                                           |
| type       | String(50)            | hospital, building, ward, room, clinic, department, virtual |
| parent_id  | Integer FK → sites.id | Nullable (top-level sites have no parent)                   |
| location   | String(500)           | Nullable, free-text address or description                  |
| created_at | DateTime              | Default now                                                 |
| updated_at | DateTime              | Default now, auto-updated                                   |

### `organisation_site` table (many-to-many)

| Column          | Type                          | Notes |
| --------------- | ----------------------------- | ----- |
| organisation_id | Integer FK → organizations.id | PK    |
| site_id         | Integer FK → sites.id         | PK    |

### `site_staff_member` table

| Column  | Type                  | Notes                         |
| ------- | --------------------- | ----------------------------- |
| site_id | Integer FK → sites.id | PK                            |
| user_id | Integer FK → users.id | PK                            |
| role    | String(50)            | clinical_lead, staff, trainee |

## Registration flow (teaching)

1. Trainee selects teaching module and enters clinical lead email
2. Backend validates: find user by email → check they are a `clinical_lead` in a
   site linked to the module's organisation
3. On success, trainee creates account and is added as `trainee` to that site
4. Trainee inherits features from their site's linked organisation(s)

## Example data

```
Organisation: EoEETA (type: teaching_programme)
Organisation: Cambridge University Hospitals NHS Trust (type: nhs_trust)
Organisation: Another Programme (type: teaching_programme)

Site: Addenbrooke's Hospital (type: hospital, parent: null)
  Site: Main Block (type: building, parent: Addenbrooke's)
    Site: Endoscopy Unit (type: department, parent: Main Block)
    Site: Ward 5A (type: ward, parent: Main Block)

organisation_site:
  EoEETA ↔ Addenbrooke's Hospital
  CUH NHS Trust ↔ Addenbrooke's Hospital
  Another Programme ↔ Addenbrooke's Hospital

site_staff_member:
  Endoscopy Unit ↔ Dr Smith (role: clinical_lead)
  Endoscopy Unit ↔ Dr Jones (role: staff)
  Endoscopy Unit ↔ Jane Trainee (role: trainee)
  Ward 5A ↔ Nurse Williams (role: staff)
```

## Current state (this PR)

- Clinical lead email is **hardcoded** (`clinicallead@nhs.net`) for the teaching
  registration page
- The Site model will be implemented in a follow-up PR

## Implementation phases

### Phase 1: Backend model and migration

- Add `Site` model to `models.py`
- Add `organisation_site` and `site_staff_member` association tables
- Alembic migration
- Admin API endpoints: CRUD sites, manage site staff, link orgs to sites

### Phase 2: Registration validation

- Replace hardcoded clinical lead list with DB lookup
- `POST /api/auth/validate-clinical-lead` endpoint
- Frontend calls API instead of checking local array

### Phase 3: Admin UI

- Site management pages (create, edit, view hierarchy)
- Assign clinical leads to sites
- Link sites to organisations
- View trainees per site

### Phase 4: Clinical (EPR/trust) use

- Extend Site model for clinical workflows (patient ↔ site assignment)
- Trust-scoped data access (staff see patients at their trust's sites)
- Ward/bed management for inpatient tracking
- Clinic/room booking integration
- Encounter location recording (which site/ward/bed)

## Storage decision (deferred)

Sites and organisations currently live in the **auth database**. When EPR work
begins, we will decide whether to:

1. **Keep in auth DB** — simpler, no FHIR dependency, full control
2. **Move to HAPI FHIR** — use FHIR `Location` and `Organization` resources for
   NHS interoperability (our model maps cleanly to FHIR's `partOf` pattern)

This decision depends on whether we need interop with other NHS systems (e.g.
PDS, SDS, other trusts). Either way, the frontend/backend API shape stays the
same — only the persistence layer changes.
