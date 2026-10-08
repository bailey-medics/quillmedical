# Deployment modes and features

One backend image and one frontend image run every Quill deployment. What a
person sees depends on three gates, checked in this order:

1. **The deployment** - does this deployment have clinical services at all?
2. **The feature** - is the feature switched on somewhere that reaches this
   person?
3. **The competency** - may this person do it? See [CBAC](./cbac.md).

Anyone adding a route or a base profession has to know which of the three
applies. This page covers the first two. It was written from
`backend/app/config.py`, `backend/app/deps.py`, `backend/app/main.py`,
`backend/app/features/gating.py`, `backend/app/organisations.py`,
`backend/app/models.py` and `backend/app/org_units/router.py`.

## Gate one: clinical services

`CLINICAL_SERVICES_ENABLED` is one setting in `backend/app/config.py`. It
says whether the deployment has a FHIR server and EHRbase behind it. The
live deployment, which serves teaching and the clinician passport, runs with
it set to `false`.

### What it changes

When the flag is `false`:

- **Settings** - the check that `FHIR_SERVER_URL` and `EHRBASE_URL` are
  present is skipped, and `FHIR_DATABASE_URL` and `EHRBASE_DATABASE_URL`
  return `None`.
- **Health** - `/api/health` reports FHIR and EHRbase as "Not provisioned"
  without calling them, and startup does not probe them.
- **Clinical routes** - every route carrying `DEP_REQUIRE_CLINICAL` returns
  503, "Clinical services are not available in this deployment".
- **The clients** - `fhir_client.py` and `ehrbase_client.py` refuse to run if
  anything reaches them anyway.
- **Self-registration** - `POST /api/auth/register` is open, and a new
  account is given the `teaching_delegate` base profession. With the flag
  `true` the route returns 403, because a clinical deployment onboards
  people through an administrator.
- **The session** - `/api/auth/me` returns `clinical_services_enabled`, and
  the frontend reads it: `<RequireClinical>` redirects clinical routes to
  `/`, the side navigation hides the clinical links, and the profession
  picker hides every base profession marked `requires_clinical_services` in
  `shared/base-professions.yaml`.

### A sub-router must share the same dependency

`require_clinical_services` lives in `backend/app/deps.py`, not in `main.py`,
so that a sub-router can depend on the same callable. The tests switch the
gate off by overriding that object. A wrapper around it would be a different
object, and would quietly stay on.

### Why one flag, and why it defaults to on

Recorded in the [teaching project plan](../plans/2026-03-18-teaching-project.md):

- **One flag for both services** - FHIR and EHRbase are always on or off
  together, because EHRbase depends on FHIR for patient context.
- **It defaults to `true`** - a clinical deployment that forgets to set it
  still gets clinical services. Only an explicit `false` turns them off, so
  a missing variable never silently disables clinical work.

## Gate two: features

A feature is a row in `org_unit_feature` (`OrgUnitFeature` in
`backend/app/models.py`): an org unit, a feature key, when it was switched on
and by whom.

- **A row means enabled. There is no boolean.** Switching a feature off
  deletes the row, which avoids a row that exists but says "disabled".
- **A feature key is a string**, so a new feature needs no migration.
- **Any org unit may carry a feature**, whatever its type.

### Who a feature reaches

`feature_holder_ids_of` in `backend/app/organisations.py` is the one answer,
used by the route gate and by `/api/auth/me` alike so the two cannot
disagree. A feature reaches somebody when it is switched on at:

- an org unit they are a member of, or
- the organisation above that org unit.

So a feature switched on at an organisation reaches every site and ward
beneath it. A feature switched on at a site reaches that site's own members
and nobody else: not the organisation's other sites, and not the wards
beneath it. Nothing passes down from a site.

### Gating a route

On the backend, `requires_feature` in `backend/app/features/gating.py`:

```python
teaching_router = APIRouter(
    prefix="/teaching",
    dependencies=[Depends(requires_feature("teaching"))],
)
```

It returns 403 when the caller belongs to no org unit, or when the feature
reaches none of the org units they belong to.

On the frontend, `<RequireFeature feature="teaching">` reads the
`enabled_features` list from `/api/auth/me` and shows a 404 when the feature
is missing, so the route looks as if it does not exist.

### Switching a feature on

`PUT /api/org-units/{id}/features/{feature_key}` in
`backend/app/org_units/router.py`. It needs the `manage_users` competency at
an org unit the caller may administer.

One key is stricter. Passport cover, the key `passport_write`, decides
whether an org unit pays for its members' writing, so only a `superadmin`
may switch it, in either direction.

## Both gates must agree

The plan calls this belt and braces: the deployment flag says whether the
services exist, and the feature rows say whether people may use a feature.
A clinical feature switched on for an organisation does nothing in a
deployment without clinical services, and clinical services in a deployment
do nothing for an organisation without the feature.

The teaching tables exist in every deployment, clinical or not, and lie
dormant where teaching is not used. The plan's reason is a single migration
history: one set of migrations for every deployment, with no branching.
