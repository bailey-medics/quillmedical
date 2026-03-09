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

- `POST /organisations` — create
- `GET /organisations/:id` — retrieve
- `GET /organisations/:id/staff` — list staff members
- `GET /organisations/:id/patients` — list patients (requires patient-level access)
- `POST /organisations/:id/staff` — add staff member
- `POST /organisations/:id/patients` — add patient
- `DELETE /organisations/:id/staff/:userId` — remove staff member
- `DELETE /organisations/:id/patients/:patientId` — remove patient

## 6. Permissions & Access

- Viewing Organisation and staff list does not require patient data access
- Viewing patient list requires patient-level permissions
- `isPrimary` staff membership controls default Organisation on login

## 7. Naming Convention

- `Organization` in code/API (FHIR-aligned)
- `Organisation` in UI (British spelling)

## 8. Out of Scope (Future)

- Nested / federated Organisation hierarchies
- Ward sub-groups
- Clinic lists
- Organisation-level access policies
