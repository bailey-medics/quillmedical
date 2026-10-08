# Organisations and org units

## 1. Overview

- An organisation is one node of a single governance tree. Every node is an **org unit**: a trust, a site, a ward.
- Real-world examples (hospital team, GP practice, private clinic)
- There is no separate `Organisation` or `Site` model. An org unit's `type` is the only thing that says what it is, never its position in the tree: an organisation is a node whose type says so, not a node that happens to have no parent.
- Relationship to staff and patients

## 2. Data Model

All in `backend/app/models.py`.

- `OrgUnit`, table `org_unit` - one node of the tree, with one parent at most
- `org_unit_member` join table - who is at an org unit, and in what capacity
- `org_unit_patient_member` join table - which patients an org unit keeps on its list
- `OrgUnitLink`, table `org_unit_link` - a relationship between two org units that is not ownership, such as a medical school teaching on a trust's wards. A link confers no membership and no admin rights.
- `OrgUnitFeature`, table `org_unit_feature` - a feature switched on at an org unit. A row means enabled; there is no boolean.
- Rationale for two separate patient/staff join tables (GDPR / data segregation)

### Org unit fields

- `id`, `name`, `type`, `parent_id` (self-referential for hierarchy), `location`, `media_prefix_id`, `is_active`, `created_at`, `updated_at`

## 3. Types

The type vocabulary lives in `shared/org-unit-types.yaml` and is checked in code by `validate_org_unit_type`, not by a database enum, so it grows without a migration.

- Types that stand at the top of a tree: `organisation`, `hospital_team`, `gp_practice`, `private_clinic`, `teaching_establishment`
- Types that sit beneath one: `site`, `hospital`, `building`, `ward`, `clinic`, `department`, `virtual`, `room`

Each type declares four flags, and rules ask the flag instead of carrying their own list of type names:

- `requires_parent` - false only for the types that stand at the top
- `can_hold_positions` - whether a post such as clinical lead means anything there
- `can_hold_competencies` - whether somebody can be authorised to practise there
- `can_have_members` - whether anybody can be a member

Today `room` is the only type with the last three set false. Features and patient lists are not a flag: any org unit may hold them, whatever its type.

## 4. Membership, features and reach

- A member has a **capacity**, one of `staff`, `trainee`, `external` or `patient` (`MEMBER_CAPACITIES`). A capacity says how somebody comes to be at an org unit. It is never a ranking and never a permission check.
- Membership answers where somebody is. What they may do there is a practising competency, and who holds a post is a `Position`; see [CBAC](./cbac.md).
- **Feature gating** - the `requires_feature` dependency reads the org units somebody is a member of, plus the organisation above each (`feature_holder_ids_of` in `backend/app/organisations.py`). A feature switched on at an organisation reaches every org unit beneath it. A feature switched on at a site reaches that site's own members and nobody else.
- **Reach is not membership and is not authority.** `get_reachable_org_unit_ids` says which organisations' content somebody can reach, and follows a teaching link. `org_units_administered_by` says what somebody may administer, and does not.

## 5. FHIR Mapping

- `Organisation` resource
- `PractitionerRole` for staff membership
- `Patient.managingOrganisation` and `CareTeam` for patient membership

## 6. Business Rules

- Staff and patients can belong to zero or more org units
- A new membership row defaults to the narrower capacity, `trainee`, so a row that forgets to say loses access instead of quietly keeping it
- An org unit has one parent at most. A second relationship is a link, not a second parent.

## 7. API Endpoints

Everything is under `/api/org-units` (`backend/app/org_units/router.py`). There are no `/api/organisations` or `/api/sites` routes.

- `GET /api/org-units` - list org units
- `POST /api/org-units` - create an org unit
- `GET /api/org-units/{id}` - retrieve an org unit
- `PUT /api/org-units/{id}` - update an org unit
- `PATCH /api/org-units/{id}/active` - toggle active/inactive
- `DELETE /api/org-units/{id}` - delete an org unit
- `GET /api/org-units/{id}/members` - list members
- `POST /api/org-units/{id}/members` - add a member
- `DELETE /api/org-units/{id}/members/{user_id}` - remove a member
- `PUT /api/org-units/{id}/clinical-lead` - name the clinical lead
- `GET /api/org-units/{id}/practising-competencies` - list who may practise what there
- `POST /api/org-units/{id}/practising-competencies` - authorise somebody to practise a competency there
- `DELETE /api/org-units/{id}/practising-competencies/{user_id}/{competency}` - withdraw it
- `GET /api/org-units/{id}/members/{user_id}/practice` - one member's practice there
- `POST /api/org-units/{id}/members/{user_id}/grant-and-authorise` - grant a competency and authorise it there in one step
- `GET /api/org-units/{id}/features` - list feature flags
- `PUT /api/org-units/{id}/features/{feature_key}` - enable or disable a feature
- `GET /api/org-units/{id}/passport-cover` - clinician passport cover
- `GET /api/org-units/{id}/passport-specialties` - lead specialties for the clinician passport
- `PUT /api/org-units/{id}/passport-specialties` - set them
- `POST /api/org-units/{id}/patients` - add a patient
- `DELETE /api/org-units/{id}/patients/{patient_id}` - remove a patient
- `GET /api/org-units/{id}/links` - list links
- `POST /api/org-units/{id}/links` - link to another org unit
- `DELETE /api/org-units/{id}/links/{link_id}` - remove a link

## 8. Permissions & Access

- Routes are gated on a competency, not on a permission level: `manage_users`, `manage_staff_membership`, `manage_patient_membership` or `manage_practising_competencies`, or a scoped manager such as `manage_teaching`
- The competency says what; the route body then scopes to the org units the caller administers. A `manage_users` row at an org unit administers that org unit and everything beneath it, never upward or sideways (`org_units_administered_by`).
- Mutating operations require CSRF token validation

## 9. Naming Convention

- `org_unit` in code and in the API
- "Organisation" and "site" in the UI (British spelling)

## 10. Out of Scope (Future)

- Clinic lists
- Organisation-level access policies
