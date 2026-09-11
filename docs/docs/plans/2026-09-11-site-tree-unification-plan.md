# Site tree unification plan

**Date:** 2026-09-11
**Status:** Proposed
**Supersedes:** the "Site vs Organisation" and "Org-Site link" decisions in
[Organisation and Site](2026-05-20-organisation-site-plan.md)

## Summary

Organisations and sites become one thing: a **site**. An organisation is a
site with no parent. Ownership is a tree with exactly one parent per site.
Anything that is not ownership, such as a medical school teaching on a
trust's wards, becomes a typed link between two sites rather than a second
parent.

## Why

The two models have drifted into being the same shape. Both have members
with a capacity, both can hold positions, both can have practising
competencies, both have a name, type and location. The only thing an
organisation has that a site does not is "no parent".

The split is already costing the codebase:

- `PractisingCompetency` and `Position` each carry an either/or pair of
  place columns, a check constraint and two partial unique indexes purely to
  point at "a place".
- `organisation_member` and `site_member` are two tables with one shared
  capacity vocabulary. The comment on `MEMBER_CAPACITIES` argues "one list,
  not one per table, or two meanings of one word drift apart". The same
  argument applies to two tables of places.
- The type vocabularies overlap: `department` and `clinic` exist in both.
- `_require_parent_in_org`, `_require_parent_shares_org_with` and
  `_require_site_in_own_org` exist only to reconcile the site tree with the
  many-to-many organisation link.
- The many-to-many link conflates "governed by" with "physically located
  at", so a site linked to two organisations gets a union of both feature
  sets and has no single answer to "who is the clinical lead here".

The docstring on `PractisingCompetency` rejects a shared "places" table.
That rejection was of a separate supertype table needing a matching row for
every organisation and site, where a missed row goes invisible. Merging
organisations into `sites` has no such gap: every place is a row by
construction.

## Design principles

- **One governance parent per site.** Ownership is a tree. A site with two
  organisations "above" it is either a joint entity that deserves to be its
  own root, or a second relationship that is not governance and belongs in
  a typed link.
- **The test for a niche case.** Ask whether the second organisation needs
  to be the answer to a governance question about that place: who is admin,
  who is clinical lead, whose features apply, whose patient list is it in.
  If yes, it is a joint entity and should be a root. If no, it is a typed
  link.
- **Membership and authorisation still do not inherit.** A row at a trust
  says nothing about its wards. Only admin scoping and reach walk the tree,
  exactly as the existing docstrings intend.
- **Kind is explicit, not derived.** "Is an organisation" is never inferred
  from a null parent alone.

## End product

### Schema

- **One table, `sites`, for every place.** Organisations become rows with no
  parent.
- **`kind` column.** A validated list in code, not a database enum, so it can
  grow without a migration. Organisational kinds (`hospital_trust`,
  `gp_practice`, `private_clinic`, `teaching_establishment`) require
  `parent_id IS NULL`; every other kind (`hospital`, `building`, `ward`,
  `room`, `clinic`, `department`, `virtual`) requires `parent_id IS NOT
  NULL`. A check constraint enforces the pairing, and a `@validates` hook
  rejects unknown kinds.
- **`parent_id` is the only ownership link.** `ondelete` changes from
  `SET NULL` to `RESTRICT`: deleting a parent is refused while it has
  children, rather than silently promoting a ward to an organisation.
- **`organisation_site` is removed.**
- **One membership table.** `organisation_member` and `site_member` merge
  into `site_member`, keeping the `capacity` column and its
  `server_default="trainee"` least-privilege default.
- **One place column everywhere.** `PractisingCompetency` and `Position`
  drop the either/or pair, `ck_*_one_place` and the duplicate partial
  indexes. Each holds a single non-null `site_id` with one ordinary unique
  constraint.
- **Organisation-only tables key on `site_id` unchanged in shape.**
  `organisation_features` becomes `site_features`,
  `organisation_patient_member` becomes `site_patient_member`,
  `message_organisation` becomes `message_site`. Whether they may later
  attach below the root is a product choice, not a schema change.
- **`site_link` for everything that is not ownership.** Columns: `site_id`,
  `other_site_id`, `relation`, `created_at`, `created_by`. `relation` is a
  validated list: `hosts`, `teaches_at`, `partners_with`, `shares_service`.
  Unique on the triple. This replaces the old many-to-many for the niche
  cases.

### Backend

- **Scoping becomes subtree scoping.** "Admin of my organisations" becomes
  "admin at a place governs that place and everything under it", resolved
  with a recursive CTE. Both PostgreSQL and the SQLite test database
  support this.
- **`organisations.py` becomes `sites.py`** with the same two questions:
  `get_member_site_ids` (direct membership) and `get_reachable_site_ids`
  (walk up the tree to the root, plus any `teaches_at` links). Reach still
  flows downward and still does not confer membership.
- **The three parent-reconciliation helpers go.** `_require_parent_in_org`
  and `_require_parent_shares_org_with` collapse into "the parent must be
  in the caller's subtree". `_require_site_in_own_org` becomes "the site
  must be in the caller's subtree".
- **Root resolution is one query.** `get_root(site_id)` walks `parent_id`
  to the row with `parent_id IS NULL`. Features and patient membership are
  read from the root until a product decision says otherwise.

### API

- **Additive during the move**, per the expand-contract rule in
  `.claude/rules/backend.md`.
- `/api/sites` grows to cover both: `GET /api/sites?roots=true` lists
  organisations, `POST /api/sites` accepts a null `parent_id` for an
  organisational kind.
- `/api/organisations` keeps working as a filtered view of root sites, and
  `/api/organisations/{org_id}/sites/{site_id}` link and unlink routes
  return 410 once the frontend has switched.
- `/api/sites/{site_id}/links` for the typed links.
- The old routes are retired only after the frontend has switched and the
  `oasdiff` breaking-change gate has been approved by a human.

### Frontend

- **Two admin pages, one model.** "Organisations" lists root sites, "Sites"
  shows the tree under one. Both use one `Site` type with `kind` and
  `parentId`, so the split is presentational only.
- `pages/admin/organisations/` and `pages/admin/sites/` share the same
  components and hooks. `AddSiteToOrgPage` becomes "add child site".
- A "Links" tab on a site shows and edits its `site_link` rows.

## Migration steps

Each step is a separate pull request and leaves the app working.

1. **Add `kind` to `sites` and backfill** from `type`. No behaviour change.
2. **Make the organisation link one-to-many.** Add `sites.organisation_id`
   (nullable), backfill from `organisation_site` where a site has exactly
   one organisation, and report any site with more than one for a human to
   resolve into a root plus links. Stop writing `organisation_site`. This
   is the step that removes most of the reconciliation helpers before any
   table merge.
3. **Add `site_link`** and its routes. Migrate any multi-organisation cases
   from step 2 into links.
4. **Insert a root site row for every organisation** with the organisation's
   name, kind and location. Point `sites.parent_id` of each organisation's
   top-level sites at that root. Drop `sites.organisation_id`.
5. **Move membership.** Copy `organisation_member` rows into `site_member`
   against the root sites. Switch readers, then writers, then drop the
   table.
6. **Move `PractisingCompetency` and `Position`.** Backfill `site_id` from
   `organisation_id` via the root rows. Drop the organisation columns, the
   check constraints and the partial indexes.
7. **Move features, patient membership and conversation links** the same
   way.
8. **Switch scoping and reach** to subtree queries. Delete
   `organisations.py`.
9. **Retire `/api/organisations`** once the frontend reads root sites from
   `/api/sites`. Drop the `organisations` table.
10. **Change `parent_id` to `ondelete=RESTRICT`** and add the kind-to-parent
    check constraint. Done last so the backfill steps are not blocked by it.

## Risks

- **A site with more than one organisation today.** Step 2 must refuse to
  guess. Each such site is either promoted to a root or given links, by a
  human.
- **Recursive queries in hot paths.** Every admin route currently does one
  join through `organisation_site`. Measure the CTE on the admin list pages
  before step 8 and add a materialised `path` column only if it is needed.
- **Feature resolution changes meaning.** Today a user at a site linked to
  two organisations gets both feature sets. After the merge they get the
  root's. Anyone relying on the union is relying on the ambiguity this plan
  removes; confirm there is nobody before step 7.
- **Registration.** The public `register` route inserts teaching delegates
  into `site_member`. It must keep working at every step, and its tests
  must run at every step.

## Testing

- Backend: `just ub -k "site or organisation or position or practising"`
  at each step, and the full `just ub` before each pull request is marked
  ready.
- Add tests for: a root cannot have a parent, a non-root must have one,
  deleting a parent with children is refused, subtree scoping does not leak
  a sibling trust's sites, reach does not confer membership, and a
  `teaches_at` link grants reach without admin rights.
- Frontend: `just uf src/pages/admin` and the Storybook suite, since the
  admin pages and their components change shape.
- E2E: the existing organisation and site admin journeys must pass
  unchanged until step 9, then be updated together with the route
  retirement.

## Out of scope

- Attaching features or patient membership below the root.
- Replacing `kind` and `relation` string lists with YAML catalogues.
- Any change to CBAC resolution or to system permission levels.
