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
- [x] **Replace the `messaging.py` staff check with membership.** The two checks are one:
      `get_member_org_ids(db, user.id, capacity="staff")` intersected with the
      conversation's organisations. Membership, not reach — a site trainee reaching the
      organisation's teaching content must not thereby self-join its staff conversations.
      - **This was blocked, and the recorded premise was wrong.** The original step said the
        membership check beside it asked the same question. It did not: `get_user_org_ids`
        read the organisation table without regard to capacity, and `register` writes
        delegates into it, so that check said yes to a trainee. The level check was the only
        thing keeping them out. What unblocked it was the capacity column plus the unified
        resolver, which together let the membership check ask *what kind* of member.
      - **The order changed, and for the better.** The level check ran *before* the
        conversation lookup, so a stranger naming a conversation that does not exist got 403
        where `test_join_nonexistent` says the contract is 404. The lookup now comes first.
      - **`SingleUserCannotSelfJoin` is no longer raised but is not yet deleted.** Its error
        code is API surface, so it is retired in a later deploy — the contract half of
        expand-contract. `NotInMessageOrganisation` now covers both rejections and its
        message says "staff at", which is the actual reason.
      - **Five fixtures in `test_messaging.py` were inserting membership without a
        capacity**, so all five silently meant `trainee` while describing staff and admins.
        They now say `capacity="staff"`. Worth noting the default did its job: it did not
        break anything quietly, it made an unstated assumption visible the moment something
        started reading the column.
- [ ] **Give the admin gates a competency.** `manage_users` already exists in
      `competencies.yaml`, and `_require_own_org` is already the place check. Each admin
      route becomes that pair. Do it in batches by area — organisations, sites, users,
      teaching — not in one commit.
      - **Counted before starting: 31 gates, and the premise is wrong for eleven of them.**
        This step assumed the place check was already present and only the level check
        needed replacing. That holds for twenty — twelve paired with `get_user_org_ids`,
        eight with `_require_site_in_own_org` or `_require_own_org` — and not for eleven,
        which have **no place check at all**.
      - **So swapping the level check for a competency would open a hole rather than close
        one.** Today `system_permissions` is the only thing standing between an admin at one
        trust and a user at another; `manage_users` is held by admins everywhere, so on its
        own it is strictly weaker. The place check has to be *added* to those eleven, not
        merely kept.
      - **Reuse `_require_own_org` and `_require_site_in_own_org`**; do not invent a third
        spelling. Both already return 404 rather than 403, so a response does not confirm a
        record exists to someone who may not see it, and the tests should assert 404 to
        match.
      - **The twenty ready routes wait for the eleven.** They could go sooner, but
        splitting the batch by whether each route happened to be safe would leave a worse
        record than doing it in one pass once they are level.

      **The eleven, by shape.** Each needs a place check added before its competency swap,
      and each wants a test that fails without it, as the September org-scoped fixes did.

      - [x] **`update_my_competencies` — not a scoping bug.** `PATCH
            /api/cbac/my-competencies` is gated on admin, then writes
            `additional_competencies` on **`current_user`**, so an admin can grant
            themselves any competency, clinical ones included. A place check would not
            touch it: the route is self-scoped by construction, and
            `UpdateCompetenciesRequest` carries no target user, so it *cannot* edit anyone
            else. The docstring saying it lets "system administrators" edit "a user's"
            competencies describes a route this is not.
            - **Decided: admins keep this for now**, to be revisited with end-to-end tests
              — whether it should be disabled, and how, is a question about real
              provisioning flows rather than about this line of code.
            - **`PATCH /api/users/{user_id}` already does the real job.** `update_user`
              writes the same three CBAC fields for an arbitrary target, refuses admins
              editing superadmins, and is one of the twenty already carrying a place check.
              So the admin path on the self-route is redundant as well as escalating, which
              makes removing it later cheaper than it looks — nothing is lost that
              `update_user` does not already do.
            - **Done: the docstring now describes the route that exists**, and
              `test_admin_can_currently_grant_themselves_a_competency` pins the accepted
              behaviour in `test_security_pentest.py`, beside the test asserting non-admins
              are refused. The test asserts the escalation rather than pretending
              otherwise, so closing it later is a visible change to a red test instead of a
              silent one. The escalation itself stays until the end-to-end work says
              otherwise.
      - [ ] **Three patient routes** — `deactivate_patient`, `activate_patient`,
            `revoke_external_access`. `check_user_patient_access` already exists and
            already encodes the rule; these simply do not call it.
      - [x] **Six fetch-by-id user routes** — `deactivate_user`, `reactivate_user`,
            `send_invite_email`, `get_user`, `link_patient_to_user`, and `update_user`.
            One helper applied six times: does the target share an organisation with the
            caller? `deactivate_user` is the clearest case — it refuses self-deactivation
            and superadmin targets, and never asks which organisation the target belongs
            to, so an admin at Trust A can deactivate a user at Trust B by naming their id.
            `get_user` is a near miss: it already loads the target's organisation
            memberships, but to return them rather than to gate on them.
            - **`update_user` was counted as already scoped and is not.** The earlier count
              looked for `get_user_org_ids` in the body and found it, but it scopes the
              *organisations named in the payload* — which memberships it may remove — not
              the target. So the route fetches a user by id, refuses only a superadmin
              target, and then writes username, email, **password** and competencies.
              An admin at Trust A can reset the password of a user at Trust B.
              **This is the worst of the six** and should be fixed first among them.
            - **The lesson for the remaining counts:** presence of a scoping helper in a
              function body does not mean the *target* is scoped. `list_users` filters its
              result set and `create_user_with_cbac` validates payload organisations, both
              correct; `update_user` looked the same to a grep and was not. The twenty
              "ready" routes deserve the same read before their competency swap.
            - **A user in no organisation is the case the check exposed.** The place check
              asks whether admin and target share an organisation, so a user in none is
              shared with nobody and is refused. That broke
              `test_deactivate_user_success`, which creates a user with no membership and
              expects an admin to deactivate them — and orphans are legitimately
              creatable today, since `organisation_ids` may be empty on
              `POST /users` and both `organisation_id` and `site_id` are optional on
              `register`.
            - **Decided: a holding organisation, and make orphans hard to create.** Rather
              than choosing between refusing orphans and letting every admin reach them,
              a user who is not placed lands in a default organisation of last resort, so
              "belongs nowhere" stops being a reachable state. The membership check then
              needs no special case, because there is no orphan to special-case.
              Separately, the business logic should make creating a user without an
              organisation or site difficult to impossible.
              - **This is its own unit of work**, not part of the place-check change: it
                needs a name and a seeding decision for the holding organisation, a
                migration to create it, a backfill for any existing orphans, and validation
                on both `POST /users` and `register`. Doing it inside this step would mix a
                data-model change into a security fix.
              - **Until it lands, the place check refuses orphans** — failing closed, which
                is the right way round to be wrong while the holding organisation is
                built. Five existing tests placed their users nowhere and were updated to
                say where they are, which is what they meant all along.
            - **Done:** `_require_shared_org_with_user` in `main.py`, applied to all six,
              with `test_admin_user_route_scoping.py` covering each. Verified by deleting
              the helper's six call sites and watching every hole test fail.
            - **The check runs *after* the superadmin guard, not before.** Placed first,
              an admin poking at a superadmin got a 404 about membership instead of the
              clearer "Cannot modify superadmin users", because a superadmin need not
              share an organisation with the admin looking at them. Ordering them the
              other way keeps both refusals saying what they mean. Self is allowed
              explicitly, so an admin in no organisation can still read their own record.
            - **A superadmin's reach comes from the rank, not from membership.** They may
              well belong to organisations and sites like anyone else — the rank does not
              take that away — and they are equally free to act at any place they do not
              belong to. So the check returns early on `system_permissions` and never
              consults the membership tables for them. Reading it as "superadmins are in
              no organisation" would be wrong twice over: they may be in several, and
              being in none is not what grants them their reach.
      - [ ] **`list_sites`** — returns every site in the deployment to any admin. Not a
            by-id leak; no id is needed at all. Filter to the caller's organisations via
            `organisation_site`, as `list_organisations` already filters, with superadmins
            keeping the unfiltered view. **This will look like a regression** to anyone
            relying on seeing the whole estate.
      - [ ] **`create_site` — decide, do not patch.** It creates a site belonging to no
            organisation, so the record cannot be scoped afterwards. The fix is probably to
            require an organisation at creation and link it in the same transaction, which
            is what `_require_site_in_own_org` already assumes when it calls a site's
            organisation "the site's owner".
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
