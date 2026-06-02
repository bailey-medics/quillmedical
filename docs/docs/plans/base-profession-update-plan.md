# Plan: Add `default_system_permission` to base professions

## Summary

Add a `default_system_permission` field to each profession in `shared/base-professions.yaml` as a soft provisioning default. Update docs to acknowledge the coupling between system permissions and CBAC. Both system permissions and CBAC remain independently adjustable per user after provisioning.

## Design decisions

- **Naming**: `default_system_permission` (not "minimum") — it's what gets auto-set at provisioning of a new user, but admins can freely override it
- **Enforcement**: Soft default only — no hard constraint validation in backend
- **Flexibility principle**: `base_profession` sets defaults for BOTH system permissions and CBAC competencies. Both are independently adjustable per user after provisioning. The CBAC formula `(base + additional) − removed` already handles competency overrides; system permissions are simply an independent field on the user model that admins can change.

## Steps

### Phase 1 — Documentation (`copilot-instructions.md`)

- [x] After "…differs only via CBAC competencies and base profession" (line 142), add paragraph:
  - Clinical practitioners require ≥staff to reach clinical workflows; CBAC scopes actions within them
  - `base_profession` sets defaults for _both_ system permissions and CBAC; both are independently adjustable per user
  - References `default_system_permission` in `base-professions.yaml`
- [x] Update the "Shared config" bullet (line 163) to mention that `base-professions.yaml` also declares `default_system_permission`

### Phase 2 — YAML (`shared/base-professions.yaml`)

- [x] Add `default_system_permission` field to each profession entry (placed between `description` and `base_competencies`):

   | Professions                                                                | Value         |
   | -------------------------------------------------------------------------- | ------------- |
   | `patient`, `teaching_delegate`, `learner`                                  | `single-user` |
   | All clinical roles (FY1→consultant, GP, nurses, pharmacy, AHPs, paramedic) | `staff`       |
   | Admin staff (`medical_secretary`, `receptionist`, `clinic_manager`)        | `staff`       |
   | `educator`                                                                 | `staff`       |
   | `system_administrator`                                                     | `admin`       |

- [x] Add header comment explaining it's a soft default, not a hard constraint

### Phase 3 — Regenerate frontend types

- [x] Run `yarn generate:types` → updates `src/generated/base-professions.json` with the new field

### Phase 4 — No backend enforcement

- [ ] No validation logic needed (soft default). The provisioning endpoint (user creation) will read `default_system_permission` from the matched base profession and use it as the default value for the `system_permissions` field — but this is a future enhancement when user provisioning is fully built out.

### Phase 5 — Update Copilot instructions

- [ ] Update `.github/copilot-instructions.md` to document the `default_system_permission` field:
  - In the **base_profession** section, note that each profession declares a `default_system_permission` (soft provisioning default)
  - Clarify that admins can override system permissions to any valid level after user creation
  - Add to the "Quick Patterns" section: when creating a new base profession, always include `default_system_permission`

## Verification

- [x] Valid YAML after edit (`yamllint shared/base-professions.yaml` or equivalent)
- [x] `yarn generate:types` completes without error
- [ ] `just uf` — frontend tests still pass
- [ ] `just ub` — backend tests still pass
- [x] Generated JSON (`src/generated/base-professions.json`) includes `default_system_permission` for each entry
- [ ] Copilot instructions accurately reflect the new field and its soft-default semantics
