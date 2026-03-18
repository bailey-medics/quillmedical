# Organisation — Documentation Outline

## 1. Overview

- What an Organisation is
- Real-world examples (hospital team, GP practice, private clinic)
- Relationship to staff and patients

## 2. Data Model

- `Organisation` table
- `OrganisationStaffMember` join table
- `OrganisationPatientMember` join table
- Rationale for two separate join tables (GDPR / data segregation)

## 3. FHIR Mapping

- `Organization` resource
- `PractitionerRole` for staff membership
- `Patient.managingOrganization` and `CareTeam` for patient membership

## 4. Business Rules

- Staff and patients can belong to zero or more Organisations
- `isPrimary` on staff membership — default login landing context
- `isPrimary` on patient membership — primary responsible Organisation
- Organisation types: `hospital_team | gp_practice | private_clinic | department`

## 5. API Endpoints

All endpoints are admin-only (admin or superadmin system permissions required). The API uses the American spelling `organizations` for FHIR alignment.

- `GET /api/organizations` — list all organisations
- `POST /api/organizations` — create organisation
- `GET /api/organizations/:id` — retrieve organisation with staff/patient lists and counts
- `PUT /api/organizations/:id` — update organisation
- `POST /api/organizations/:id/staff` — add staff member
- `POST /api/organizations/:id/patients` — add patient
- `DELETE /api/organizations/:id/staff/:userId` — remove staff member (requires CSRF)
- `DELETE /api/organizations/:id/patients/:patientId` — remove patient (requires CSRF)

## 6. Permissions & Access

- All organisation CRUD operations require admin or superadmin system permissions
- Mutating operations (DELETE) require CSRF token validation
- `isPrimary` staff membership controls default Organisation on login

## 7. Naming Convention

- `Organization` in code/API (FHIR-aligned)
- `Organisation` in UI (British spelling)

## 8. Out of Scope (Future)

- Nested / federated Organisation hierarchies
- Ward sub-groups
- Clinic lists
- Organisation-level access policies
