# Replace system permissions with a platform role

## Why

The organisation-scoped work made the shape of this obvious rather than arguable.
`admin`, `staff`, `trainee` and `patient` are all things a person is **somewhere** — at an
organisation, or at a site. `superadmin` is not. It says the person operates Quill itself,
which is true everywhere or nowhere and has nothing to do with any place.

So the four-level hierarchy `single-user < staff < admin < superadmin` is one field holding
two unrelated ideas, in the same way `site_staff_member.role` held three. That column has
just been split into membership, competencies and positions, and the same argument applies
here.

**The proposal: `system_permissions` becomes `platform_role`, with `superadmin` and nothing
else.** Everything the other three levels expressed is already expressible per place.

## What the code says

Counted rather than assumed, before writing any of this down.

- **`single-user` gates nothing.** Six mentions, every one of them the definition: the
  constant, the docstring, the column default, the ordered list. Not one comparison.
- **`staff` gates one thing.** `DEP_REQUIRE_STAFF` exists and has **no consumers at all** —
  dead code. The only live check is `messaging.py`, letting a staff member self-join a
  conversation, and that check already sits immediately beside an organisation-membership
  lookup.
- **`admin` is never global.** 84 mentions in `main.py`, and `CLAUDE.md` itself describes it
  as _"scoped to own orgs"_. Twenty of those pair directly with `get_user_org_ids` or
  `_require_own_org`. The rest are on routes where the place comes from elsewhere in the
  request.
- **`superadmin` is the only one that stands alone**, appearing in checks like
  `!= "superadmin"` where no place is involved.

## The rule this settles on

- **`platform_role`** answers _is this person a Quill operator?_ One value, `superadmin`,
  and its absence.
- **Membership** answers _where are they?_
- **Competencies** answer _what may they do there?_
- **Positions** answer _who holds the post?_

### A superadmin is not a clinician

Being a Quill operator confers no clinical access whatever. A superadmin who lacks
`access_patient_records` cannot read a record, and nothing about the platform role changes
that — the competency check is separate and stays separate.

The likely exception is the ordinary one: a superadmin is also a person, so they may well
hold self-scoped competencies such as viewing their own records. That is not an exception to
the rule; it is the rule working, since those competencies are held like anyone else's.

This is worth stating because the current hierarchy invites the opposite reading. `superadmin`
sitting at the top of a ladder that includes `staff` suggests it subsumes clinical access. It
does not, and removing the ladder removes the suggestion.

## Steps

- [x] **Delete `require_staff` and `DEP_REQUIRE_STAFF`.** Dead code, no consumers. Doing this
      first shrinks the problem before anything harder starts.
      - Also corrected a stale line in `docs/docs/code/fastapi/system_permissions.md`, which
        named all three of `require_staff`, `require_admin` and `require_superadmin` as
        living in `app.deps`. The other two still do; this one no longer exists.
- [ ] **Replace the `messaging.py` staff check with membership.** **Blocked on
      `2026-09-09-membership-and-reach-plan.md`.** The premise recorded here was wrong: the
      membership check below is not asking the same question. `get_user_org_ids` reads the
      organisation staff table, and `register` writes students into it, so that check says
      yes to a student. The level check is currently the only thing keeping them out of
      staff conversations, and deleting it would let a teaching delegate self-join any
      conversation at their organisation.
      - It becomes safe once the organisation table carries a capacity, because the
        membership check can then ask what kind of member rather than merely whether one.
- [ ] **Give the admin gates a competency.** `manage_users` already exists in
      `competencies.yaml`, and `_require_own_org` is already the place check. Each admin
      route becomes that pair. Do it in batches by area — organisations, sites, users,
      teaching — not in one commit.
- [ ] **Then rename the column** to `platform_role`, narrowing its values to `superadmin` and
      one value meaning "not an operator", validated in code the way `SITE_CAPACITIES` is.
      - Autogenerate proposes drop-and-create for a rename. Write it by hand, as
        `site_member` had to be, and rename the auto-named constraints explicitly.
- [ ] **Remove `default_system_permission` from `shared/base-professions.yaml`.** All 22
      professions declare one — 17 `staff`, 3 `single-user`, 2 `admin` — and none of them
      should default to being a Quill operator. Regenerate the frontend types.
- [ ] **Delete `check_permission_level` and the ordered list.** A hierarchy of one is not a
      hierarchy. This is the step that makes the change irreversible in a good way: nothing
      can silently reintroduce a rung.

## Live: learning content is readable across organisations

Found while planning self-hosted video. `get_learning_content`
(`GET /api/teaching/modules/{module_id}/learning`) is guarded by two things and
neither is enough:

- `requires_feature("teaching")` on the router — the **caller's** organisation must have
  teaching enabled.
- `_DEP_USER` — the caller must be signed in.

There is no competency check, not even `view_teaching_cases`, where the admin routes beside
it require `manage_teaching_content`. And there is no organisation scoping at all: anyone at
any organisation with teaching enabled can fetch any module's slides by naming its id.
`_SAFE_BANK_ID` restricts the characters allowed in that id, not who owns the module.

**It cannot be fixed by adding a check alone.** The content path is
`modules/{module_id}/learning/content.mdx` — the bucket layout carries no organisation, so
there is nothing in the path to compare against. Ownership lives in `QuestionBankConfig`,
which is per organisation, so the check is a database lookup before the GCS fetch.

**The rule to enforce:** a person may read learning materials only for the organisation they
belong to, reached through their site. That is the downward delivery described in
`2026-09-09-membership-and-reach-plan.md` — a trainee at a site receives what their
organisation has made available there — so this is an instance of that rule rather than a
separate policy.

- [ ] **Scope `get_learning_content` to the caller's organisation**, resolved through site
      membership, and require a competency to read it.
- [ ] **Add a test that fails without the scoping**, as the site-route fixes did. A module
      belonging to another organisation must return 404 rather than 403, matching
      `get_organisation`: the response should not confirm that a module exists to someone who
      may not see it.
- [ ] **Check the same endpoint's siblings.** Learning content was found by chance while
      planning video; nothing has swept the other teaching read routes for the same shape.
      - **Authentication is not the missing half.** Every route on the teaching router was
        checked and each already requires a signed-in user, so the sweep is looking for
        missing _scoping_, not missing sign-in.

**Not odd that the video plan is stricter.** Video is the expensive, signed-URL case where a
leak is obvious, so it got the attention. Slides being laxer is the anomaly, not video being
tighter.

**Settled: all teaching material is private.** It is reachable only by an authenticated
user, and only for their own organisation. There may one day be content offered freely, and
that will still be behind authentication — free means no charge, not no sign-in.

So this is not a question of how guessable a module id is. How hard an id is to guess is the
argument for content that is merely obscure; it is not the argument for content that is
private, because a private thing readable by the wrong signed-in person is a leak whether
they guessed the id or were handed it. Treating the material as private is what makes the fix straightforward: there
is no case to carve out, and no "public modules" branch to maintain.

## What this costs

- **34 files outside `backend/app/` mention it**, including `AuthContext`, `RequirePermission`,
  the navigation components and their tests.
- **The frontend guard is used 21 times** — 13 `level="admin"`, 4 `level="staff"`,
  4 `level="superadmin"`. The admin and staff ones become competency checks, which the
  frontend already has hooks for (`useHasCompetency`).
- **`system_permissions` is in three response schemas**, so removing or renaming it is a
  **breaking API change** needing an `oasdiff` finding and a decision file per change.
- It is a rename plus a semantic change, so the sequence is expand, migrate the callers,
  contract — the same shape as the `role` work, and for the same reason.

## Risks

- **The admin batch is where a mistake would land.** Twenty-odd gates change from a string
  comparison to a competency plus a place check. A missed place check is a
  cross-organisation hole of exactly the kind closed last week, so each batch wants a test
  that fails without it, as those fixes did.
- **`RequirePermission` disappearing changes the shape of route guards**, and there is no
  equivalent of a "level" once levels are gone. Expect the frontend to end up asking about
  competencies at a place, which needs the interface to know which place it is looking at —
  a question the org-scoped findings deliberately left to the interface.
- **Do not start this while the staff and patient namespaces are unsettled.** If patients end
  up needing a platform-side representation, the shape of this field could change again.

## Not addressed here

- What replaces `staff` for "may reach clinical workflows at all", if anything still needs
  it once the competency checks are in place.
- Whether `platform_role` should be nullable rather than carrying an explicit
  "not an operator" value.
