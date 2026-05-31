# Organisation — Documentation Outline

## 1. Overview

- What an Organisation is
- Real-world examples (hospital team, GP practice, private clinic)
- Relationship to staff and patients

## 2. Data Model

- `Organisation` table
- `organisation_staff_member` join table
- `organisation_patient_member` join table
- `Site` table (physical locations)
- `organisation_site` join table (links sites to organisations)
- `site_staff_member` join table (links staff to sites, with role)
- Rationale for two separate patient/staff join tables (GDPR / data segregation)

## 3. Sites

Sites represent physical locations (e.g. hospital wards, clinic buildings). They provide an indirect staff-to-organisation linkage path:

- A user can be a member of a site (`site_staff_member`)
- A site can be linked to one or more organisations (`organisation_site`)
- This means a staff member at a site gains access to features enabled on linked organisations

This is important for **feature gating** — the `requires_feature` dependency resolves organisation membership via both:

1. Direct: `organisation_staff_member`
2. Indirect: `site_staff_member` → `organisation_site`

### Site model fields

- `id`, `name`, `type`, `parent_id` (self-referential for hierarchy), `location`, `is_active`

## 4. FHIR Mapping

- `Organization` resource
- `PractitionerRole` for staff membership
- `Patient.managingOrganization` and `CareTeam` for patient membership

## 5. Business Rules

- Staff and patients can belong to zero or more Organisations
- `is_primary` on staff membership — default login landing context
- `is_primary` on patient membership — primary responsible Organisation
- Organisation types: `hospital_team | gp_practice | private_clinic | department | teaching_establishment`

## 6. API Endpoints

All endpoints are admin-only (admin or superadmin system permissions required). The API uses the American spelling `organizations` for FHIR alignment.

### Organisation endpoints

- `GET /api/organizations` — list all organisations
- `POST /api/organizations` — create organisation
- `GET /api/organizations/{id}` — retrieve organisation with staff/patient lists and counts
- `PUT /api/organizations/{id}` — update organisation
- `DELETE /api/organizations/{id}` — delete organisation
- `POST /api/organizations/{id}/staff` — add staff member
- `POST /api/organizations/{id}/patients` — add patient
- `DELETE /api/organizations/{id}/staff/{userId}` — remove staff member (requires CSRF)
- `DELETE /api/organizations/{id}/patients/{patientId}` — remove patient (requires CSRF)
- `GET /api/organizations/{id}/features` — list organisation feature flags
- `PUT /api/organizations/{id}/features/{featureKey}` — enable or disable a feature (requires CSRF)
- `POST /api/organizations/{org_id}/sites/{site_id}` — link site to organisation
- `DELETE /api/organizations/{org_id}/sites/{site_id}` — unlink site from organisation

### Site endpoints

- `GET /api/sites` — list all sites
- `POST /api/sites` — create site
- `GET /api/sites/{id}` — get site details
- `PUT /api/sites/{id}` — update site
- `PATCH /api/sites/{id}/active` — toggle site active/inactive
- `DELETE /api/sites/{id}` — delete site
- `POST /api/sites/{site_id}/staff` — add staff to site
- `DELETE /api/sites/{site_id}/staff/{user_id}` — remove staff from site

## 7. Permissions & Access

- All organisation CRUD operations require admin or superadmin system permissions
- Mutating operations (DELETE) require CSRF token validation
- `is_primary` staff membership controls default Organisation on login

## 8. Naming Convention

- `Organization` in code/API (FHIR-aligned)
- `Organisation` in UI (British spelling)

## 9. Out of Scope (Future)

- Nested / federated Organisation hierarchies
- Ward sub-groups
- Clinic lists
- Organisation-level access policies
