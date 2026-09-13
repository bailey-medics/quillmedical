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
- [x] **Give the admin gates a competency.** `manage_users` already exists in
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
      - **Unblocked for the routes; the open question is who holds the competency.** The
        eleven place checks are in, so the swap itself is straightforward. What is not
        settled is that `manage_users` and today's admins are different sets:
        - `teaching_admin` defaults to `system_permissions: admin` and does **not** hold
          `manage_users`.
        - `clinic_manager` holds `manage_users` but defaults to `staff`.
        - Only 2 of 22 professions grant it, and it is a bare entry in `competencies.yaml`
          — an id and a display name, with no risk level or description, unlike the
          clinical competencies around it.
        - **Nobody is locked out by any of this**, because no real people use production
          yet. The mismatch matters as a design question — who *should* administer what —
          not as a migration hazard, and it should be decided on what is right rather than
          on preserving current access.
      - **Decided: `manage_users` moves to its own `admin.yaml`.** Settled while the
        competency catalogue was being split into `shared/competency-definitions/` on
        `feature/clinician-passport-phase-0` (#600).
        - **`clinical-admin.yaml` stays as it is**, for administration that is patient
          centric rather than teaching or passport. `admin.yaml` is for administering a
          *place* — the org or site someone is at.
        - **What it permits:** adding, editing and deleting users and their competencies,
          at the organisation or site the holder is at. The competency answers *what*; the
          existing `_require_own_org` and `_require_site_in_own_org` answer *where*, so no
          new place mechanism is needed.
        - **It is the root competency, deliberately.** `update_user` writes
          `additional_competencies` wholesale with no check on which ids are granted, so a
          holder can mint any competency in the catalogue — including `manage_users`
          itself, and every clinical one. Capping it to competencies the granter holds was
          considered and rejected for now; the rule is that it is granted rarely, and
          `admin.yaml` should say so in its header rather than leave the next reader to
          discover it.
        - **`access_clinic_admin` is enforced nowhere** — checked across the backend and
          frontend. Worth knowing before adding more admin vocabulary: the catalogue
          already contains an admin competency that no route asks for. Left in place with
          a comment saying so, rather than retired: retirement is one way, and this is a
          competency awaiting a gate rather than one withdrawn.
        - **Done: `admin.yaml` exists and holds `manage_users`.** The loader globs the
          directory, so a new file needs no registration, and
          `check-competencies-not-deleted.sh` concatenates every file before comparing —
          it treats a move between files as a move, not a deletion. Nothing to change in
          either.
        - **Superadmins have to hold the competency, and now do.**
          `has_competency` has no rank bypass — it reads the competency list and nothing
          else — so swapping the gates would have refused the one role meant to reach
          everything. Fixed at the source rather than with a rank check inside each gate,
          which would have left a rung in the ladder this plan removes.
          - **`superadmin_profession`** is the profession a superadmin is provisioned with. It
            grants `manage_users` and nothing else — no clinical competency, per "A
            superadmin is not a clinician" above.
          - **A promoted user keeps their own profession** and gains the operator
            competencies alongside it. Overwriting would strip a consultant of their
            clinical competencies the moment someone made them an operator.
          - **`base_profession` is NOT NULL defaulting to `patient`**, which is worse than
            the empty case assumed at first: a superadmin provisioned without one is a
            *patient*, holding `access_patient_records` and not `manage_users` — both too
            much and too little. Invisible today because the routes check rank; the swap is
            what would have made it bite.
          - **Found on the way: `update_user` called `db.refresh(user)` with no flush**, so
            any assignment made after the last query in that function was silently
            discarded. The payload writes survived only because SQLAlchemy flushes automatically on
            the queries between them. Now flushed explicitly.
        - **Decided: `teaching_manager` is the third holder.** A new profession, teaching
          admin plus the people — it provisions delegates at its own organisation or site.
          `teaching_admin` deliberately does *not* get `manage_users`: it curates content
          rather than accounts, and `manage_users` can mint any competency including
          itself, so it is given to few. Three professions hold it now:
          `clinic_manager`, `system_administrator`, `teaching_manager`. That is enough to
          proceed with the route swap.
        - **`admin` has not been removed from `system_permissions`.**
          `PERMISSION_ADMIN` is still in `permissions.py` and still in `PERMISSION_LEVELS`,
          and two professions still default to it — `system_administrator` and
          `teaching_admin`. Removing it is the *last* step of this plan, not a
          precondition, and the 31 route gates still compare against the string today.
      - **Batch 1 of 4 done: the three patient routes.** `deactivate_patient`,
        `activate_patient` and `revoke_external_access` now carry
        `DEP_REQUIRE_MANAGE_USERS` in their `dependencies=[...]`, with
        `_require_shared_org_with_patient` still beside them. 31 string gates down to 28.
        - **`DEP_REQUIRE_MANAGE_USERS` is the shared constant**, matching
          `DEP_REQUIRE_CSRF` and the rest. Its comment says the thing worth repeating: it
          answers *what*, never *where*, and a route carrying it without a place check
          beside it is strictly weaker than the rank it replaced.
        - **The `test_admin` fixture had no profession**, so it took the column default of
          `patient` and held `access_patient_records` and nothing an administrator needs.
          Invisible while the routes compared ranks; a refusal the moment they ask for a
          competency. It now carries `system_administrator`.
        - **Two tests pin the pair**, and each fails for a different deletion: rank without
          the competency is refused 403, and the competency without a shared organisation
          is refused 404. Neither half alone is the gate.
      - **Batch 2 of 4 done: the ten site routes.** `list_sites`, `create_site`,
        `get_site`, `update_site`, `toggle_site_active`, `delete_site`, `link_site_to_org`,
        `unlink_site_from_org`, `add_site_staff` and `remove_site_staff`. 28 string gates
        down to 18.
        - All ten already had a place check — `_require_site_in_own_org` or
          `_require_own_org`, and `list_sites` filters rather than gates, which is right
          for a listing — so this batch was the swap the step originally described.
        - **Two superadmin comparisons inside route bodies are deliberately left.**
          `list_sites` skips its filter for a superadmin and `get_site` hides superadmin
          staff from an admin's view. Neither is a gate; both go when the column does.
      - **Batch 3 of 4 done: eight of the nine user routes.**
        `create_user_with_cbac`, `update_user`, `deactivate_user`, `reactivate_user`,
        `send_invite_email`, `list_users`, `get_user` and `link_patient_to_user`. 18 string
        gates down to 10.
        - **`update_my_competencies` is deliberately not swapped**, and wants a decision
          before it is. It is self-scoped by construction — `UpdateCompetenciesRequest`
          carries no target user — so there is no place check to pair a competency with,
          and gating it on `manage_users` would make the escalation self-referential:
          holding the competency would be what lets a holder keep granting it to
          themselves. Today the rank check is the only thing standing between an admin and
          an unbounded grant. Leaving it on the rank keeps that visible until the
          end-to-end work settles whether the route should exist at all.
      - **Batch 4 of 4 done: the nine organisation routes.** `list_organisations`,
        `get_organisation`, `update_organisation`, the four staff and patient membership
        routes, `list_org_features` and `toggle_org_feature`. All nine already had
        `get_user_org_ids` beside them.
      - **Step complete: 30 of the 31 gates are competencies.** The one left is
        `update_my_competencies`, on the rank deliberately — see the batch 3 note.
        - **Two test helpers had no profession** and so took the column default of
          `patient`: the `test_admin` fixture in `conftest.py` and `_make_admin` in
          `test_organisation_features.py`. Both now carry `system_administrator`. Worth
          expecting wherever a test builds an admin by hand.
        - **One assertion tested the refusal's wording**, not its effect —
          `test_get_organisations_forbidden` checked for "admin" in the detail. It now
          checks for `manage_users`, which is the point of the change: the refusal names
          what is missing rather than what someone is not.
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
      - [x] **Three patient routes** — `deactivate_patient`, `activate_patient`,
            `revoke_external_access`. Each takes a `patient_id` and never asks whether the
            caller shares an organisation with that patient.
            - **`check_user_patient_access` cannot be the fix, though this step said it
              was.** Its first line returns `True` for any admin or superadmin — "always
              True for admin pages", as its own docstring puts it. Calling it from an
              admin-gated route is therefore a no-op: it would compile, read as a place
              check, and permit exactly what it appears to forbid. That is worse than no
              check at all, because the next reader stops looking.
            - The escape hatch dates from when `admin` was taken to mean global authority.
              It is the same assumption this plan exists to remove, met one layer down.
            - **So these need `get_shared_org_ids` directly**, which is the part of
              `check_user_patient_access` that actually asks about place. Its two current
              callers in `messaging.py` are both non-admin paths, so the hatch is doing no
              work for them either — but changing the shared helper would alter those two
              routes as a side effect, and that is its own unit of work.
            - **Done:** `_require_shared_org_with_patient` in `main.py`, applied to all
              three, with `test_admin_patient_route_scoping.py` covering each.
            - **The no-op claim was tested, not assumed.** Rewiring the helper to call
              `check_user_patient_access` and re-running leaves exactly the same four
              tests failing as deleting the check entirely. That is the evidence for
              preferring a second helper over the one that already existed.
            - **`check_user_patient_access` still carries its admin hatch**, now used only
              by the two `messaging.py` callers. Worth removing when those are looked at,
              since an admin reading a patient record they share no organisation with is
              the same hole in a different room.
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
      - [x] **`list_sites`** — returned every site in the deployment to any admin. Not a
            by-id leak; no id was needed at all. Now filtered to the caller's organisations
            via `organisation_site`, as `list_organisations` already filters, with
            superadmins keeping the unfiltered view. **This will look like a regression**
            to anyone relying on seeing the whole estate.
            - **An empty organisation list must not invert the filter.** An admin who
              belongs nowhere gets `IN ()`, the classic way a restriction becomes its
              opposite. Tested explicitly: the answer is no sites, not all of them.
            - **An unlinked site is not listed.** Sites are created from inside an
              organisation and linked in the same action, so a site belonging to nothing is
              an anomaly rather than a shared resource.
      - [x] **`create_site` — decided, not patched.** `organisation_id` is now required
            and the link is written in the same transaction, so a site is never ownerless.
            `_require_site_in_own_org` already assumed this was impossible when it called a
            site's organisation "the site's owner"; now it is true.
            - **Required immediately rather than optional-then-contract.** A deliberate
              choice: the field is a breaking change either way, and an optional field
              would have left the ownerless path open for however long the deprecation ran.
              `api-compatibility/` carries the decision file, `forces_reload: false`, and
              the change needs the `api-breaking-change-review` environment approval before
              merge.
            - **A stale client gets 422 and creates nothing**, which is the safe direction:
              the old behaviour on a half-failed two-call sequence was to leave an orphan.
            - **`parent_id` was unscoped too, and is fixed here.** The route checked that a
              parent site existed and not that it was the caller's, so an admin at one
              trust could hang a ward inside another trust's building — a write into a
              structure they do not own. The rule is same-organisation rather than "one of
              the caller's", which differ when an admin belongs to several: a ward in
              Trust A's building is Trust A's ward, whoever created it.
            - **`update_site` carried the identical fault** and is fixed with it. One
              shared organisation is enough there, since requiring all of them would refuse
              a legitimate parent whenever a site is linked to two.
            - **Nothing walks the parent chain for authorisation**, checked before deciding
              severity — `parent_id` is only ever read or written directly. So this was a
              structural write rather than an access path into another organisation.
            - **The frontend already does this in two calls**, not one:
              `AddSiteToOrgPage.tsx` posts `/sites`, then posts
              `/organisations/{id}/sites/{site_id}` with the returned id. So a site exists
              unlinked between the two requests, and is invisible to `list_sites` in that
              window — and permanently so if the second call fails. That is the argument
              for taking the organisation at creation rather than adding a check: the gap
              is in the shape of the API, not in a missing guard.
            - Changing this touches the frontend as well as the route, so it is a wider
              unit than the scoping fixes and wants its own branch.
- [x] **Then rename the column** to `platform_role`, narrowing its values to `superadmin` and
      one value meaning "not an operator", validated in code the way `SITE_CAPACITIES` is.
      - Autogenerate proposes drop-and-create for a rename. Write it by hand, as
        `site_member` had to be, and rename the auto-named constraints explicitly.
      - **235 references across five areas**, counted before starting: 74 in `backend/app`,
        76 in tests, 63 in the frontend, 21 in scripts, 1 in a migration. Too large for one
        reviewable change, so it runs as expand, migrate the callers, contract — the
        sequence this plan already names.
      - [x] **Expand: `platform_role` added alongside.** Column, `PLATFORM_ROLES`,
            `validate_platform_role`, and a hand-written migration that backfills it.
            Nothing reads it for authorisation yet and `system_permissions` is untouched,
            so the two can disagree while callers move — pinned by a test, because a column
            silently derived at read time would make the migration look finished when it
            was not.
            - **The backfill is not a copy.** Every row becomes `member` except those that
              said `superadmin`. The other three levels described a relationship to a
              place, and a place is not what this column records.
            - **A named value, not an empty string or null**, so "not an operator" is
              something someone chose rather than the absence of one. Whether it should
              be nullable instead was already an open question at the foot of this plan;
              this answers it for now and can be revisited before the contract step.
            - **It was `member` at first, and is now `standard`.** `member` already means
              belonging to an organisation or a site, with its own tables and its own
              capacity column — so the word would have carried two unrelated ideas, which
              is the mistake this column exists to undo. Renamed in
              `b4d1e9c72a05`, by hand: autogenerate cannot see it, because
              `compare_server_default` is off and a Python-side `default=` never reaches
              the schema. The two paragraphs above describe what the merged expand
              migration did and are left as they were.
      - [x] **Migrate the callers** — the 21 frontend `RequirePermission` guards, then the
            backend reads. The gates are already competencies, so what remains is genuinely
            about *operating Quill*, which should be a much smaller set than the raw count
            suggests.
            - **The guard counts include the component's own tests.** The tally of 21 —
              13 `admin`, 4 `staff`, 4 `superadmin` — comes from grepping `level="..."`
              across `.tsx`, and `RequirePermission.test.tsx` renders the guard to test
              it. Real route call sites: **2** superadmin, both in `main.tsx`
              (`organisations/new`, and the `teaching/modules` subtree). Re-count the
              admin and staff figures the same way before sizing those batches.
            - **`platform_role` reached the frontend nowhere**, so no guard could read it.
              The expand step added the column but no response schema exposed it —
              `MeOut`, `UserOut` and `UserSummaryItem` all carried only
              `system_permissions`. Migrating any guard therefore starts with a backend
              change, which is additive and needs no decision file.
            - **The guard consults two fields while this runs.** `level="superadmin"`
              reads `platform_role`; `staff` and `admin` still read `system_permissions`
              until they become competency checks. Ugly but honest, and it is what
              expand-migrate-contract looks like from inside.
            - [x] **Superadmin guards migrated.** `platform_role` added to `MeOut` and to
                  the frontend `User` type, and both route guards now ask it. A test pins
                  a user who says `superadmin` in the old column and `standard` in the
                  new one: the guard must refuse them.
            - [x] **Two of those five now read `platform_role`.**
                  `AdminOrganisationsPage.tsx` and `UserInfoUpdatePage.tsx` each asked
                  `system_permissions === "superadmin"` on its own, which is the platform
                  question exactly. Both test mocks gained the field, since a mock without
                  it reads as `undefined` and silently hides what the test asserts.
            - [x] **The other three moved with the route guard, not before it.**
                  `SideNavContent.tsx`, `teaching/TeachingMainNav.tsx` and `LoginPage.tsx`
                  asked `admin || superadmin` — _may this person reach admin pages_,
                  not _do they operate Quill_ — so `platform_role` would have hidden
                  the admin nav from admins. They now ask `manage_users`, the same as
                  the `/admin` guard, so a link cannot advertise a route that answers
                  404.
            - **The guard counts were wrong by an order of magnitude.** Recounted against
                  the code after the superadmin work merged: **one** real `admin` guard
                  (`main.tsx:280`, wrapping the whole `/admin` subtree) and **zero**
                  `staff` guards. The plan's "13 admin, 4 staff" counted the component's
                  own docstring examples and its test cases. So the remaining frontend
                  work is one guard, not seventeen.
      - [x] **Migrate the backend reads — this is the bulk of what is left.** 76
            references across nine files, 59 of them in `main.py`. Counted and
            classified rather than estimated, because this plan's figures have been
            wrong three times running.
            - [x] **Ten caller checks migrated.** The `== "superadmin"` and
                  `!= "superadmin"` comparisons on `current_user` at 1722, 1758, 3675,
                  3954, 4016, 4426, 4614, 4632, 4662 and 4694 now read `platform_role`.
                  Every one was read before being changed, and all ten ask the platform
                  question with no place involved — the four helper guards included
                  (`_require_site_in_own_org`, `_require_own_org`,
                  `_require_shared_org_with_patient`, `_require_shared_org_with_user`),
                  where the superadmin early-return is exactly that question.
                  - **Every writer had to move with the readers.** `test_superadmin` in
                    `conftest.py`, four inline users in `test_main_endpoints.py`, and
                    `create_superuser.py`, `seed_ci.py` and `admin_cli.py` all set
                    `system_permissions` alone, so every superadmin they created would
                    have been refused the moment the routes stopped reading it. Expect
                    this shape for the rest of the migration: a read cannot move until
                    every writer does.
                  - **Two tests pin it by making the columns disagree.** A swap like
                    this passes trivially while both columns agree, so
                    `TestTheRoutesReadTheNewColumn` builds a stale superadmin (old
                    column yes, new column no) and a true operator (the mirror), and
                    asserts 403 and 200 against `POST /api/organisations` — the
                    plainest superadmin gate in `main.py`, with no place check or
                    competency beside it.
            - **Two of the three "query filters" were misclassified**, found by reading
              them rather than grepping. 3775 and 4736 test `current_user.
              system_permissions == "admin"`, which is the admin question, so they
              belong with the sixteen org-scoping branches below.
            - [x] **The target-user filters migrated.** At 2499, 3775 and 4736 the
                  comparison is on the _listed_ user rather than the caller —
                  `User.platform_role != "superadmin"` now — which hides operators
                  from an admin's view of the user list, an organisation's staff and
                  a site's staff. Same column as the caller checks, opposite side of
                  the comparison, which is why it was its own unit.
                  - **The `== "admin"` caller half of each branch stays.** Each filter
                    sits inside `if current_user.system_permissions == "admin"`; that
                    half is the admin question and moves with the admin work.
                  - **`User.system_permissions.in_(allowed)` at 2456 is not one of
                    these.** It implements the `permission_level` query parameter, a
                    public filter over the four-level hierarchy rather than a
                    superadmin check, so it moves with the contract step. The plan
                    listed three sites; reading found a fourth that does not belong.
                  - **Verified by reverting.** Putting the old column back turns
                    `test_an_operator_is_hidden_from_the_user_listing` red, and
                    restoring it turns it green — so the test pins the change rather
                    than passing because both columns happen to agree.
            - **About sixteen are `== "admin"` org-scoping branches** — 3749, 3891,
              4067, 4151, 4211, 4263, 4311, 4356, 4734 and neighbours. These ask _is
              this person an admin here_, which is the competency question, not the
              platform one. They belong with the `admin` work below, not with the
              rename.
            - **Four are composite** (`in ["admin", "superadmin"]` at 2803, 3615, 5239
              and 5419). Each needs splitting into its platform half and its place half
              before either half can move.
            - **`check_permission_level` is not a composite, and is not a caller check
              at all.** One live call site, at 4075 inside `add_org_staff`, and it asks
              about the **target**: is the user being added to an organisation `staff`
              or above? A 400 with "User must have staff-level permissions or above" if
              not. The caller was already gated by `manage_users` and the org place
              check three lines above.
              - **It is the last consumer of the hierarchy as a ladder.** Everywhere
                else compares for equality; this is the only place the ordering of
                `single-user < staff < admin < superadmin` is actually used. That makes
                it the blocker for the final step of this plan, which deletes
                `check_permission_level` and the ordered list.
              - **The replacement is probably nothing.** Under the new model, eligibility
                to be staff somewhere is membership capacity, and the row written two
                lines later already carries `capacity="staff"`. Adding someone as staff
                is what makes them staff; requiring them to hold a staff rank elsewhere
                first is the old model asking a question the new one answers by writing
                the row.
              - [x] **Decided and done: deleted.** The call site is gone, along with the
                `PERMISSION_STAFF` and `check_permission_level` imports in `main.py`,
                which had no other consumer there. A `single-user` can now be added as
                organisation staff, which is the intended behaviour change rather than a
                regression: the membership row is what makes someone staff.
                - **One test asserted the old 400 and is now its mirror.**
                  `test_add_staff_rejects_patient_user` became
                  `test_add_staff_accepts_a_single_user`, asserting 200 and that the
                  membership row exists. Rewriting rather than deleting keeps the case
                  covered — the interesting user is still the `single-user`, only the
                  expected answer changed.
                - **`PERMISSION_LEVELS` stays in `main.py`.** It backs the
                  `permission_level` query parameter at 2456, which is the four-level
                  hierarchy as a public filter and moves with the contract step.
            - **The remainder are not checks at all** — schema fields, docstrings, and
              payload passthrough on create and update. They move with the contract
              step, not before it.
      - [x] **Then the `admin` half** — the one frontend guard at `main.tsx:280`, the
            three `admin || superadmin` checks in `SideNavContent`, `TeachingMainNav`
            and `LoginPage`, and the seventeen backend branches.
            - **Not a competency step after all.** All seventeen were read, and not one
              asks whether the caller may administer anything: every route already
              carries `DEP_REQUIRE_MANAGE_USERS` at the decorator, so by the time a
              branch runs, the competency question is settled. What each branch asks is
              _is this person **not** a superadmin, and therefore confined to their own
              place_ — which is the platform question inverted, and moves to
              `platform_role` exactly like the ten caller checks did.
            - **Three shapes, all the same question.**
              - **Place scoping, eleven of them** — 1526, 3747, 3887, 4063, 4146, 4206,
                4258, 4306, 4351 and neighbours. Each reads `if admin: if org_id not in
                get_user_org_ids(...)` and refuses. A superadmin skips the check because
                they are global, which is the platform role and nothing else.
              - **Superadmin-target protection, five of them** — 1635, 1696, 1848, 1911
                and 2607. `admin` caller **and** `superadmin` target: cannot modify,
                deactivate, reactivate, view, or grant the rank. Both halves are the
                platform question, on opposite sides — the target half is already
                `platform_role` for the two listing filters, and these should match.
              - **Query scoping, two** — 2467 (`list_users`) and the pair at 3771 and
                4729 whose target half already moved. The caller half is the same
                inverted platform question.
            - **So it is one mechanical step, not a design problem.** `== "admin"`
              becomes `platform_role != "superadmin"`. The behaviour is identical while
              both columns agree, which is why it needs the same divergent-column tests
              the earlier batches used.
            - **One wrinkle worth care.** `== "admin"` excludes `staff` and
              `single-user`; `!= "superadmin"` includes them. That widens each branch's
              _scoping_ to callers who could not previously reach these routes at all —
              harmless only because `manage_users` gates the door. Worth a test that a
              competency-holding non-admin is scoped rather than left unscoped.
            - **1696 is the exception and does not move.** It refuses an admin granting
              `system_permissions: superadmin` through the payload. That is about the
              old column's own values, so it dies with the contract step rather than
              migrating.
            - [x] **The sixteen backend branches migrated**, with their comments
                  rewritten: they said "Admin users can only…" where the condition now
                  says "anyone but an operator", and a comment that describes a
                  narrower rule than the code is worse than none.
                  - **The first tests written for this did not pin it.** They exercised
                    `GET /organisations`, whose scoping came from the earlier merged
                    work rather than from any of these sixteen — so reverting all
                    sixteen left them green. Rewritten against
                    `GET /organisations/{id}`, which carries the branch at 3747, and
                    re-checked: green with the change, red without.
                  - **A whole-file revert is not the check.** Replacing every
                    `platform_role != "superadmin"` also reverts the three helper
                    guards from the previous branch, so an older test fails first and
                    hides whether the new ones would have. Revert by line number.
            - [x] **The frontend half, done as one unit.** It was never the three nav
                  checks alone: `main.tsx:280` gated `/admin` on
                  `RequirePermission level="admin"`, so moving the nav without the
                  guard would have advertised links that answer 404.
                  - **Decided: a separate `RequireCompetency`**, rather than teaching
                    `RequirePermission` to take a competency. The alternative would
                    leave one component answering two unrelated questions through one
                    prop — the conflation this whole plan exists to undo. It mirrors
                    the backend, where the competency gates the door and
                    `platform_role` scopes what is behind it.
                  - **`level` loses `"admin"`**, leaving `staff` and `superadmin`.
                    The union is the enforcement: nothing can pass `admin` again
                    without the type failing.
                  - **All four now ask `manage_users`** — the route guard, the two
                    navigations, and `LoginPage`'s post-login redirect safety net,
                    which reads `user.competencies` since it has the user in hand
                    rather than a hook.
                  - **`fallback="redirect"` is now unreachable for `level="staff"`.**
                    `single-user` is the only level left below it and always gets 404,
                    so the test that asserted a redirect now asserts the 404 and says
                    why. The prop stays for `superadmin`.
                  - **Mock users needed the competency added.** Three in
                    `SideNavContent.test.tsx` and one in `TeachingMainNav.test.tsx`
                    described admins by rank alone, so the admin link vanished until
                    they held `manage_users`. The same shape as the backend fixtures:
                    a read cannot move until every writer does.
      - **The read side is finished.** 39 references remain, down from 76, and only
            two are authorisation reads — both deliberately kept: the payload guard at
            1710 refusing an admin granting `superadmin`, and `update_my_competencies`
            at 3644. Everything else is carriage: schema fields, docstrings, the
            `permission_level` filter, and one analytics label. Nothing else in the
            codebase decides access on the old column.
      - [ ] **Contract: drop `system_permissions`.** Breaking API change, three response
            schemas, so it needs a decision file and the `api-breaking-change-review`
            approval.
            - **This cannot come next, though the plan long listed it there.** A column
              with 76 live references is not droppable; every step above has to land
              first. Recorded because the ordering error survived several readings.
            - **46 backend references remain, and 8 frontend files**, counted after the
              admin work. Down from 76, and what is left is not one job:
              - [x] **Four superadmin-target comparisons migrated** at 1636, 1849, 1912
                and 2608 — `update_user`, `deactivate_user`, `reactivate_user` and
                `get_user`, each refusing a non-operator acting on an operator. The
                caller half already asked `platform_role`; these were the target half,
                and the last authorisation reads left on the old column. **The plan
                never listed them as a unit**, which is why they were nearly missed.
                - **The branch had to stack.** Cut off plain `main` first, and all four
                  would have conflicted: the caller half changed on the previous branch
                  sits on the line immediately above each target half, inside the same
                  `if`. Stacking on that branch is what made it a clean change.
                - **Five tests, verified by reverting.** Four refusals plus a mirror so
                  they cannot pass by refusing everyone. `get_user` answers 404 rather
                  than 403, so the refusal does not confirm the account exists.
              - [x] **The composites, and the plan was wrong about them twice.** It
                said all four mean "may reach admin pages" and all four become
                `manage_users`. Reading them showed three different questions:
                - **`list_patients` (2801) asks `platform_role`** for the unfiltered
                  list. Seeing every patient in the deployment is reach unbounded by
                  any place, not an administrative act at one. **A visible
                  narrowing**: an admin at a trust now sees only the patients they
                  share an organisation with.
                - **Seeing _deactivated_ patients is a narrower question**, applying
                  within the list a caller already reaches, so it asks
                  `manage_patient_membership`. Found only because a half-finished
                  rename left `is_admin` undefined and ruff caught it — the second
                  use was never the same question as the first.
                - **The two external-access routes (5232, 5412) ask
                  `manage_patient_membership`**, not `manage_users`. Inviting someone
                  to a patient's record is patient centric, and a patient is not a
                  user.
                - **`update_my_competencies` (3613) keeps the rank**, as decided
                  earlier: it is self-scoped, so a competency gate would make the
                  escalation self-referential.
              - **The `permission_level` query parameter** at 1360, 1422, 2454 — a
                public API filter over the four levels. It cannot move; it is removed,
                which is itself the breaking change.
              - **The rest are carriage**: schema fields, payload passthrough on create
                and update, and one analytics label at 5433. They go when the column
                goes.
            - **Two required-reviewer approvals gate this step**, both human-only and
              neither of which a diff can satisfy: `api-breaking-change-review` for the three
              response schemas, and `db-destructive-migration-review` for the
              `drop_column`. Expect the decision file too.
            - **Split into three merges, because one would be unreviewable.** Scoping
              the contract showed five units rather than one, two of them design
              decisions rather than deletions. A single branch would produce a diff too
              large to read properly and end in two approval gates granted while
              looking at it.
              - [x] **1. The backend reads — and only two of the four were reads.**
                    Counted as four places consulting the old column for access.
                    Reading them found three different kinds of change:
                    - **`require_superadmin` was dead code.** No consumers anywhere,
                      so it was deleted rather than migrated — the same finding as
                      `DEP_REQUIRE_STAFF` at the top of this plan, and worth expecting
                      again.
                    - **`require_admin` became `require_operator`.** Its single
                      consumer sends a test push notification to *every* subscribed
                      client in the deployment, unbounded by any organisation. That is
                      the platform question, so it asks `platform_role` rather than a
                      competency. Renamed because a helper called `require_admin` that
                      checks the platform role does not describe itself.
                    - **A test pins it by making the columns disagree**: a user who is
                      `admin` in the old column and `standard` in the new one is
                      refused. Verified by reverting.
                    - [x] **`check_user_patient_access` is its own unit, and a
                      security fix.** Its first line returned `True` for any admin —
                      "always True for admin pages", as its own docstring said — so it
                      granted access to any patient. `main.py:4670` already carries a
                      comment saying it is *deliberately not* used for that reason: a
                      previous unit routed around the hatch rather than closing it.
                      - **"Both non-admin paths, so the hatch does nothing for them
                        today" was wrong**, and it is the sort of wrong worth
                        recording. Neither `messaging.py` caller sits behind an admin
                        gate — `POST /conversations` and
                        `GET /patients/{id}/conversations` carry
                        `DEP_REQUIRE_CLINICAL` and nothing more — so the hatch fired
                        for any admin who reached them. It was the live grant, not
                        dead code: an admin sharing no organisation with a patient
                        could start a conversation about them, or list every
                        conversation about them by naming the id.
                      - **Decided: gate on `access_patient_records`**, paired with the
                        shared-organisation check that follows it. The competency
                        answers _what_ and the membership answers _where_, which is
                        the pattern the rest of this plan settled on. Deleting the
                        hatch outright and keeping a superadmin-only hatch were both
                        considered; the second was rejected as leaving an operator
                        bypass on clinical data, against "A superadmin is not a
                        clinician".
                      - **It removes an old-column read as a side effect**, which is
                        why it belonged in this unit at all. A mechanical swap to
                        `platform_role` would have preserved a superadmin hatch and
                        contradicted that rule.
                      - **`system_administrator` holds `access_patient_records`**, for
                        technical support, so an IT admin at the patient's own
                        organisation is still granted access. This broke the first
                        version of the "shared organisation, no competency" test,
                        which assumed the opposite; `receptionist` is the profession
                        that genuinely lacks it. Worth expecting wherever a test
                        wants a user who is staff somewhere but may not read a record.
                      - **Done:** the hatch is gone from `organisations.py`, with
                        `test_patient_access_competency.py` covering both halves, the
                        two cases the hatch got backwards, and the two routes in it
                        does not touch — self-access and external grants.
                    - [x] **The teaching router check — a display preference, not a
                      gate.** The plan cited "line 2315" in `main.py`; the check
                      actually lives at `features/teaching/router.py:2315`, inside
                      `list_delegates`, as
                      `User.system_permissions.notin_(["admin", "superadmin"])`.
                      - **It filters the listed users, never the caller.** The route
                        already carries `_DEP_MANAGE` at the decorator and already
                        scopes to `get_member_org_ids`, so both the _what_ and the
                        _where_ are settled before the query runs. Nothing about
                        access depended on it.
                      - **Decided: dropped entirely.** An administrator who is also a
                        trainee is an ordinary case, and hiding them made their
                        assessment results unreachable to the person meant to review
                        them. Narrowing it to `platform_role != "superadmin"` was the
                        alternative and preserves a distinction nobody asked for.
                      - **The scoping is asserted beside the change**, so dropping a
                        display filter cannot later be mistaken for dropping the place
                        check. `test_list_delegates_lists_everyone.py`.
              - [x] **2. The form and the badge.** Decided rather than derived, so the
                    reasoning is recorded here:
                    - **The badge shows only operators.** `PermissionBadge` renders a
                      SUPERADMIN pill where it applies and nothing otherwise. The
                      alternatives were showing the platform role for everyone — a
                      STANDARD pill on every row, which is noise — replacing it with
                      competencies, which makes the lists busy, or dropping it. The
                      rare case is the informative one.
                    - **Renamed to `PlatformRoleBadge`.** A component called
                      `PermissionBadge` showing one value no longer describes itself,
                      and the name matches `CompetencyBadge`, which is the pattern the
                      codebase already uses. `OperatorBadge` was the alternative and
                      was rejected: it stops fitting if platform roles gain values.
                    - **The create-user control stays a dropdown**, with two options
                      rather than a checkbox. A checkbox reads more naturally for a
                      yes/no, but the dropdown leaves room for more platform roles
                      without redesigning the step.
                    - **The create API must accept `platform_role`**, which it does not
                      today. That backend work belongs with this unit rather than the
                      column drop, since the form cannot set what the API will not take.
                    - **Done, in two commits.** The badge first, then the form and the
                      write paths.
                      - **The badge could not read the column, because nothing served
                        it.** `MeOut` carried `platform_role`; `UserSummaryItem` and
                        `UserOut` carried only `system_permissions`, so the user list
                        and the user page had nothing to show. Added to both, with
                        their three construction sites in `main.py`. Additive, no
                        decision file. Expect this shape again: a frontend read cannot
                        move until the response schema behind it does.
                      - **Every reference to the column was a read.** The expand step
                        added `platform_role` and backfilled it, and the routes
                        migrated to consult it, but no route ever *wrote* it — an
                        operator could only be made by hand in the database. Both
                        request schemas now accept it, validated through
                        `validate_platform_role`.
                      - **Only an operator may make another.** `manage_users` opens
                        these routes and says what someone may administer; it does not
                        say they may promote someone to run the platform. The guard
                        mirrors the one over `system_permissions`, and the promotion
                        adds `superadmin_profession`'s competencies alongside the
                        person's own profession — without them a new operator would be
                        refused by every competency gate.
                      - **The create default is `standard`.** An operator is made
                        deliberately, never by omitting a field.
                      - **The summary row keeps plain text beside the badge.** The
                        badge renders nothing for a standard account, so a label
                        pointing at an empty space reads as a fault rather than an
                        answer. The row shows the badge for an operator and the word
                        "Standard" otherwise.
                      - **The user list's permission filter still reads the old
                        column.** Filtering on two values, one of which renders
                        nothing, offers the reader no way to narrow anything, so it
                        goes with the column in unit 3.
                      - **The step heading and the summary label are both "Platform
                        role"**, so five form tests asserting the text by name became
                        ambiguous. They now match the heading by role, which is what
                        they meant: step 4 rendered.
              - [ ] **3. The column itself.** `drop_column`, the three response schemas,
                    and the `permission_level` query parameter. The only unit needing
                    the two approvals above.
                    - **Blocked on the migration merging, not on anything in the code.**
                      Units 1 and 2 are on `feature/contract-backend-reads` (#657),
                      which is open. Dropping the column on top of that branch would
                      put the destructive migration and the migration it depends on in
                      one diff, so both approval gates would be granted while looking
                      at work that is still under review — and a change requested on
                      #657 would rebase the drop underneath it. Expand, migrate,
                      **then** contract: start this unit from a branch cut after #657
                      lands.
                    - **87 references remain, not the 46 recorded above.** Counted
                      after unit 2: 36 in `backend/app`, 33 test files, 18 frontend
                      files outside tests, and four scripts —
                      `create_superuser.py`, `admin_cli.py`, `seed_ci.py` and
                      `update_system_permissions.py`, the last of which exists only to
                      write the column. The plan's figures have now been wrong four
                      times; count before sizing this unit rather than trusting the
                      number above.
                    - **Most of that is carriage, and could move first.** Only the
                      `permission_level` filter and the three response schemas are the
                      breaking change. Migrating the scripts, tests and frontend types
                      onto `platform_role` needs neither approval and would leave the
                      contract diff small enough to review properly — worth doing as
                      its own branch if this unit stays blocked for long.
                    - **The frontend carriage was not carriage.** Counted as types to
                      retype; reading it found three different things, two of them
                      dead code and the third a gap.
                      - **`RequirePermission` was a hierarchy nobody climbed.** Its
                        `level` prop compared against the four rungs, but only its own
                        tests ever passed anything below `superadmin`, and that branch
                        already read `platform_role`. So `PERMISSION_HIERARCHY`, the
                        `single-user` fallback and the prop itself could not run.
                        Replaced by `RequireOperator`, which takes no level and asks
                        the one question left. The fourth dead thing this plan has
                        turned up, after `DEP_REQUIRE_STAFF`, `require_superadmin` and
                        `update_system_permissions.py` — check for consumers before
                        migrating anything else here.
                      - **Three `AdminPage` fetch gates could never fail.** Each read
                        `!["admin", "superadmin"].includes(userPermissions)` before
                        loading users, patients or organisations, on a page whose whole
                        subtree sits behind `RequireCompetency manage_users` in
                        `main.tsx`. Removed, along with the `userPermissions`
                        derivation they were the last consumers of.
                    - **`NewMessageModal` blocks, and the competency it wants does not
                      exist.** `system_permissions === "single-user"` decides whether
                      the composer hides the patient picker. The obvious migration is a
                      competency meaning "only their own health" — but `patient` holds
                      exactly one competency, `access_patient_records`, and **nineteen
                      professions hold that same one**. It distinguishes nobody; the
                      scoping happens in the route, not the competency.
                      - **So what marks a patient account is an open question.** The
                        candidates are holding no staff competency at all, or being
                        linked to a patient record — `User.fhir_patient_id` exists and
                        is nullable, but `MeOut` does not serve it. Either way it is a
                        modelling decision plus a backend change, not a retype.
                      - **Answered with `fhir_patient_id`, and it is not a
                        stopgap.** `MeOut` serves the patient record an account is
                        linked to, and the modal asks that. It is how the backend
                        already answers the same question — `organisations.py:174`,
                        `main.py:5314` and `main.py:5500` all test
                        `user.fhir_patient_id == patient_id` — so the interface
                        stops inferring what the API knows. Additive, no decision
                        file.
                      - **The split did not replace it, though it was written as
                        though it would.** `access_own_patient_records` now belongs
                        to `patient` alone, so a competency *can* mark a patient —
                        the condition under which this field was said to become
                        removable. It does not become removable, for two reasons
                        found on re-reading:
                        - A clinician registered at the trust they work in holds
                          both competencies, so a modal asking for the own-records
                          one would hide the patient picker from someone messaging
                          about a patient they treat.
                        - The modal needs *which* record is theirs, to name it on
                          the conversation. A competency says what someone may do
                          and never which record it applies to.
                      - **So the two answer different questions** and the comments
                        saying otherwise were corrected, along with the test that
                        asserted no competency could ever serve. It now asserts the
                        case that keeps the field: someone who is both.

## Finding: the staff picker's rank filter is removed, not replaced

`?permission_level=staff` populates three "add staff" pickers —
`AddStaffToOrgPage`, `AddSiteToOrgPage` and `EditSitePage`. It filters by the
retiring column, and `PERMISSION_LEVELS` exists only to serve it, so it is the
last thing standing between this plan and the column drop.

**Every replacement filter was wrong, and the example that broke them is a
patient becoming a healthcare assistant.** Filtering on existing staff
membership, on holding a staff competency, or on not being linked to a patient
record each hides exactly that person — the one case the picker most needs to
support. A filter cannot express "could become staff" without deciding who
never can.

**Decided: anyone with an account can be added as staff.** The parameter goes
and nothing takes its place; the picker lists users. One fewer concept rather
than a substitute for one.

- **A `staff` competency was considered and rejected.** It would name a
  category of person where every other competency names an action, and it would
  duplicate what `capacity="staff"` membership already records — two sources of
  truth that can disagree, which is the fault `site_staff_member.role` was split
  apart to remove.
- **`fhir_patient_id` was considered and rejected**, and the reasoning is worth
  keeping: nearly every staff member is or will one day be a patient, so a
  consultant registering at their own trust would trigger it. It also
  contradicts the "a patient is not a user" finding below, which records that
  field as the *link* between two roles the same human holds.

### The confirmation is where the judgement moves

**Warn when the target holds no staff-like competency**, and in the same step
offer to grant one.

- **It survives every edge case.** A patient, an advocate, and an LPOA holder
  all hold nothing staff-like and all get the prompt. A consultant who is also
  a patient holds clinical competencies and does not.
- **The grant is the point, not the warning.** Adding someone as staff today
  writes a membership row and nothing else, so a new HCA can do nothing until
  somebody separately remembers to edit their competencies. Asking *which*
  competency makes that one action instead of two, and makes the person adding
  them state what the new starter will actually do.
- **"Staff-like" means anything in the competency catalogue except the
  patient's own-records competency.** Exact once `access_own_patient_records`
  exists — see the finding below — which is why this waits on that split.
- **Decided: both, in that order.** The prompt offers a profession first,
  because that is how the job is described — "they are starting as a healthcare
  assistant" — and then individual competencies, either alongside it or on their
  own. A profession without the second step is rigid: it grants what the
  template says and nothing else, when the point of `additional_competencies` is
  that real people diverge from templates.
  - **Granting a profession must keep what the person already holds.** A patient
    becoming an HCA keeps their own-records competency and gains the HCA set;
    the profession adds, never replaces.
  - **Done: the grant is additive.** `update_user` now carries the old
    profession's competencies into `additional_competencies`, minus anything
    the new profession grants in its own right, so nothing is lost and nothing
    is duplicated. It previously assigned the field alone, dropping every
    competency from the old profession unless separately listed — silently,
    with nothing recording why.
    - **The merge runs after an explicit `additional_competencies` payload.**
      Written the other way round first, where a request carrying both fields
      discarded the carried-over set. Ordering is the whole of the change.
    - **`removed_competencies` still wins**, applied after the merge, so a
      profession change cannot quietly undo a deliberate removal — the same
      silent surprise in the other direction.
    - **Verified by reverting.** Restoring the bare assignment turns
      `test_a_patient_becoming_a_delegate_keeps_their_own_records` red, so the
      test pins the fix rather than passing because the professions happen to
      overlap. `teaching_delegate` is the profession that exposes it:
      `healthcare_assistant` grants `access_patient_records` too, so the loss
      is invisible on the obvious example.
  - **It is the same conclusion as the stored-profession finding below**,
    reached from the other end: that finding argues a profession should
    initialise a user and then be let go, which is what "keep what they had and
    add the new set" means in practice. Two routes to one answer is a reason to
    trust it.
  - **So the two are one unit of work.** Making the grant additive and making
    `base_profession` a template rather than stored state are the same change,
    and the staff-picker prompt is what will exercise it.

### Finding: `patient_advocate` is accepted but does not exist

Surfaced while testing the rule above against an advocate — a relative holding
LPOA for someone who cannot manage their own care.

- **The grant mechanism is built.** `ExternalPatientAccess` is per-patient,
  invite-based and revocable, and its docstring names patient advocates.
- **The profession is not.** `InviteExternalIn` validates `user_type` against
  `^(external_hcp|patient_advocate)$` and `accept_invite` writes it straight to
  `base_profession`, but neither id appears in `base-professions.yaml`.
- **`get_profession_base_competencies` returns `[]` for an unknown id**, with no
  error, so an accepted advocate invite creates an account holding no
  competencies at all. Latent while nobody uses it, and wrong regardless: a
  validated field writes a value that silently resolves to nothing.
- **The grant does still admit them**, checked rather than assumed. The
  external-grant branch of `check_user_patient_access` runs after the competency
  check and returns on the grant alone, so an advocate holding no competencies
  reaches the record they were invited to. The empty profession is therefore
  latent rather than breaking — but it means an advocate's access rests entirely
  on one table row, with no competency recording what they may do with it.

### Decided: `access_granted_patient_records`, and both professions defined

Not yet built. Recorded here so the reasoning survives.

**The third route gets a competency, like the other two.** Reading a record you
were invited to is a different permission from reading your own and from reading
your patients', and it was the only one of the three naming no competency at
all.

- **`access_granted_patient_records`**, in `clinical.yaml`. It names what the
  holder may do rather than how the scope is decided — `read_defined_other_patient_record`
  was the first suggestion and describes the mechanism instead, which no other
  id in the catalogue does. It reads symmetrically beside the split recorded
  below:
  - `access_own_patient_records` — your own record
  - `access_granted_patient_records` — someone else's, by invitation
  - `access_patient_records` — your patients', by clinical role
- **`patient_advocate` and `external_hcp` both hold it**, and nothing else.
  Neither is staff anywhere and neither reaches a caseload.
- **The grant branch must require it.** The `ExternalPatientAccess` row says
  *which* patient and the competency says *what*, the same pairing organisation
  and site membership already use. Without it, revoking a competency could not
  cut access — only deleting the row could, and the competency would be
  documentation rather than a gate, which is the `access_clinic_admin` fault
  this plan already records.
- **It is a behaviour change, not an addition.** An existing advocate account
  without the competency loses access when the pairing lands. Harmless with no
  real users, and worth stating because it touches who may read a patient
  record.

**Three routes reach a record, and only one is a competency**: your own record
via `fhir_patient_id`, someone else's via a grant, and your patients' via a
competency plus a shared organisation. A model that assumes the third is the
only one will keep mis-sorting advocates.

## Finding: nobody grants themselves competencies

Surfaced while deciding what should gate `update_my_competencies` once the rank
column goes, and the question turned out to be wider than that route.

**Two routes write competencies, and both could be pointed at the caller.**
`PATCH /api/cbac/my-competencies` is self-scoped by construction, and
`PATCH /users/{id}` takes any id including one's own. Neither checked *which*
competencies were being granted, so a holder of `manage_users` could award
themselves anything in the catalogue — clinical ids included, and more
`manage_users`. The competency was the key to its own lock.

**Decided: nobody edits their own competencies, profession or platform role.**
Ask another holder of `manage_users`, so the person granting and the person
gaining are never the same.

- **Both routes needed it.** Guarding only the self-route would have been
  decorative: an admin could pass their own id to `PATCH /users/{id}` and
  achieve the same thing.
- **An operator is exempt**, because they already reach everything and somebody
  has to be able to bootstrap a deployment.
- **Name, email and password stay editable on oneself.** Ordinary self-service,
  available on the profile routes anyway, so blocking it here would be
  inconsistent rather than stricter.

### Why not "you cannot grant what you do not hold"

The textbook rule, and it breaks on the ordinary case. **The person who
administers accounts is usually not the person qualified to judge clinical
competence**: an IT administrator should be able to record that a doctor may
prescribe without being able to prescribe themselves.

That is what the NHS Registration Authority model separates — the RA does not
decide someone is a consultant, they record that an employer verified it. So
the authority to grant and the evidence for granting are different things.

**What that suggests, and is not built here:** granting a clinical competency
should require pointing at something — a qualification, a sign-off, a named
person who vouched. The clinician passport work is already part of the way
there. Recorded as a direction rather than a decision.

## Finding: the three-way split sits inside the industry standard

Researched before building the competency split, to check whether the model was
eccentric. It is not, and the closest comparator is the one nobody here had
heard of.

### NHS national RBAC is almost the same design

The Spine's [national RBAC](https://digital.nhs.uk/developer/guides-and-documentation/security-and-authorisation/national-rbac-for-developers)
maps onto this codebase directly:

- **Job Roles ("R" codes)** — `base_profession`
- **Activities ("B" codes)** — competencies
- **Role profiles, which are organisation-scoped** — membership

Three details match decisions reached here independently:

- **Activities can be assigned to a role profile directly**, not only through a
  job role — which is `additional_competencies`. The e-Referral Service has
  "activities but no associated roles" at all, so a competency without a
  profession is a supported shape rather than a workaround.
- **The organisation is a separate element of the role profile**, not part of
  the activity. That is "the competency says what, membership says where",
  which this plan arrived at by splitting `site_staff_member.role`.
- **Several hundred attributes** are granted in combination nationally, so the
  catalogue here is conservative rather than over-elaborate.

### Where this codebase sits outside the norm, deliberately

**Most EPRs keep patients out of the permission model entirely.** Epic, Cerner
and the Spine put the portal on a separate plane with its own identity;
patients hold a portal account, not activities. `access_own_patient_records`
brings the patient inside one model, which is the unusual choice.

It is defensible, but the evidence for it is weaker than it first looked — see
the correction below.

### The advocate design matches practice closely

[NHS proxy access](https://www.england.nhs.uk/long-read/proxy-access/) states
the same shape this plan reached from the LPOA example:

> "Proxy has their own account and login credentials"

> "The level of access can be different from that of the patient... A patient
> may choose to have more than one proxy, and each can have a different level
> of access."

Separate account, per patient, individually revocable, audited — which is
`ExternalPatientAccess` plus `access_granted_patient_records`.

[FHIR's Permission resource](https://build.fhir.org/ig/HL7/data-access-policies/en/StructureDefinition-Permission.html)
splits the same way, `rule.data` for which records and `rule.activity` for what
actions. Notably it does **not** distinguish a `RelatedPerson`'s delegated
access from a `Practitioner`'s role-based access, so the three-way split here is
more explicit than the standard requires.

- **The sector says "proxy" or "shared access" where this says "granted".**
  Worth knowing when reading the literature; not a reason to rename, since
  "granted" describes the mechanism this codebase actually uses.

### Two gaps, both known

- **No break-the-glass.** Near universal in EPRs, and already recorded as out
  of scope under the cross-organisation search finding.
- **No safeguarding on the invite.** NHS proxy access requires identity checks,
  a capacity assessment and explicitly "assessment of the risk of coercion"
  before a proxy account is created. The invite route here asks for an email
  address. A product gap rather than a modelling one, and it matters most for
  exactly the LPOA case that prompted this research.

### Employees use two systems to see their own data

[Analysis of Employee Patient Portal Use and Electronic Health Record Access at
an Academic Medical Center](https://pubmed.ncbi.nlm.nih.gov/32557441/)
(*Applied Clinical Informatics*, 2020) followed employees at a large medical
centre who looked at their own health data. Of 28,631 who did, 25,193 used the
patient portal and 13,318 went to the EHR — so roughly 9,900 used both.

The paper attributes the double use to the portal showing *less* than the EHR:
clinical notes were over 42% of employees' EHR accesses. That is an argument
about what each system displays rather than about how identity is modelled, so
it supports a unified model only indirectly. Recorded because it is the best
available measure of how often one person is both staff and patient — nearly a
third of the employees who looked at all.

## Finding: `access_patient_records` names two different permissions

Surfaced while migrating `NewMessageModal` off `system_permissions`.

**For a consultant it means "read the records of patients I am treating". For a
patient it means "read my own record".** One id, two permissions, and the
`patient` profession carries a comment — *"Own records only (filtered by
system)"* — explaining that the competency does not mean what it says. That is
the same fault as `system_permissions` holding rank and place in one column,
one layer down.

**The counts show it.** Eighteen staff professions hold `access_patient_records`
alongside `patient`, from `healthcare_assistant` with three competencies to
`consultant` with twenty-eight. Only `patient` holds it alone, so today a
patient is identifiable only by holding *nothing else* — an inference rather
than a fact.

- **The split:** `access_own_patient_records` for the patient, leaving
  `access_patient_records` as the clinical one scoped by shared organisation.
  `isPatientUser` then becomes an honest competency check.
- **Nothing is mis-scoped today.** `check_user_patient_access` lets a patient
  through on `fhir_patient_id == patient_id` before any competency is consulted,
  so this is about naming a permission correctly, not closing a hole.
- **It touches shared YAML and the generated types**, which `CLAUDE.md` flags as
  wide blast radius, and it needs the two `main.py` self-access routes and
  `check_user_patient_access` to learn the new id.
- **Built ahead of the column drop after all.** The advocate work needed it:
  `patient_advocate` and `external_hcp` had to hold *something*, and
  `access_patient_records` would have given them a caseload.
  - **`access_own_patient_records`** now belongs to the `patient` profession,
    which previously carried the clinical id under a comment explaining it did
    not mean what it said.
  - **`access_granted_patient_records`** belongs to both external professions,
    paired in `check_user_patient_access` with the grant row.
  - **The old id keeps its name and its eighteen holders**, so nothing was
    retired and the CI deletion guard stays green.
  - **26 messaging tests failed, all for one reason.** The `test_user` fixture
    declared no profession, took the column default of `patient`, and was then
    placed as *staff* at an organisation to read a patient there — relying on
    the patient profession to carry a clinical competency, which is exactly the
    conflation being removed. It now carries `registered_nurse`.
  - **One test asserted a bare grant admits anyone**: it gave a clinician an
    `ExternalPatientAccess` row and expected entry. The pairing refuses that,
    and the fixture is now `external_hcp`.
                    - **No CLI replacement for `update-permissions`.** A
                      `set-platform-role` action and a `just spr` recipe were written
                      and then removed: the admin pages already set a platform role
                      through `PATCH /users/{id}`, with the same operator-only guard,
                      and `create-superadmin` still makes the first operator on a new
                      environment. The only gap left is promoting an existing user
                      when nobody can sign in as an operator, which is rare enough not
                      to justify a second command writing a second column. When the
                      column goes, `update-permissions` goes with it and nothing
                      replaces it.
                    - **`update_system_permissions.py` was dead** — no callers, and
                      `admin_cli.py`'s `update-permissions` action does the same job
                      behind `just up`. Deleted rather than migrated, the same finding
                      as `DEP_REQUIRE_STAFF` and `require_superadmin` before it. That
                      is three dead things this plan has turned up; expect more.
- [x] **Remove `default_system_permission` from `shared/base-professions.yaml`.** 25
      professions declared one by the time it went — the count moved twice while this
      plan was being worked through, with `teaching_manager`, `superadmin_profession`
      and `patient_manager` added.
      - **It has exactly one real consumer, and it is a feature.**
        `UserInfoUpdatePage.tsx` reads it when creating a user: picking a profession
        pre-fills the system permission field. The backend only *declares* the field in
        `BaseProfessionEntry` and never reads it. So removing it is not tidying an unused
        field — it removes a convenience from the create form, and something has to replace
        it or the form loses a step.
      - **What replaces it depends on the rename.** If `platform_role` ends up holding only
        `superadmin` and its absence, then pre-filling it from a profession is close to
        meaningless: the answer is "not an operator" for every profession but one. The
        field stops being useful at the same moment the column narrows.
      - **So this step should follow the rename, not precede it.** Doing it first would
        mean designing a replacement for a form field that is about to change shape
        anyway. The plan lists it before the rename; that ordering looks wrong.
      - **Done, and nothing replaced it.** The worry above was that removing the
        pre-fill would cost the create form a step. It does not: the dropdown it fed
        still stands, and becomes a platform-role control in the contract step, when
        three of its four values stop existing. Pre-filling it from a profession was
        decorating a field already on its way out.
        - **Removed from four places**: the 25 YAML declarations and the header
          paragraph documenting them, the `BaseProfessionEntry` field (and the
          `SystemPermission` import that became unused with it), the hand-maintained
          declaration in `frontend/src/generated/index.d.ts`, and the pre-fill in
          `UserInfoUpdatePage.tsx`.
        - **One test went with it.**
          `test_base_profession_entry_rejects_invalid_permission_level` existed only
          to check that field's validation, so it tested nothing once the field was
          gone. Deleted rather than left asserting an absence.
- [ ] **Delete `check_permission_level` and the ordered list.** A hierarchy of one is not a
      hierarchy. This is the step that makes the change irreversible in a good way: nothing
      can silently reintroduce a rung.
      - **Its only consumer is already gone**, removed with the backend reads — see the
        `check_permission_level` note under that step. What remains is deleting the
        function and `PERMISSION_LEVELS` themselves, which waits on the
        `permission_level` query parameter moving in the contract step.
      - **Not a separate step any more, in practice.** `PERMISSION_LEVELS` has one
        consumer left — the `permission_level` query filter at `main.py:2461` — and
        that filter is removed by the contract step itself. So this deletion happens
        as part of unit 3 rather than after it, and the box stays open until the code
        is actually gone.

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

- [x] **Scope `get_learning_content` to the caller's organisation**, resolved through site
      membership, and require a competency to read it.
      - **The scoping half landed from another worktree**, in `6885365f` under a different
        plan file, and is stricter than this one described: `resolve_visible_module` gates
        on `is_live` rather than merely a promoted version, and `list_learning_modules` is
        filtered the same way. This plan's checkbox read as open the whole time, because a
        tick applied on an unmerged branch is invisible here — verify items against the
        code, not the box.
      - **The competency half was still missing**, and is what this branch adds.
        `_DEP_VIEW_CASES` existed but was wired only to `grant_video_access`, so the slides
        were cheaper to reach than the video of them — the same asymmetry the section below
        already notes about video being stricter. Both learning routes now carry it.
- [x] **Add a test that fails without the scoping**, as the site-route fixes did. Covered by
      `TestLearningContentGate` from the other worktree, and by
      `TestLearningRoutesRequireTheViewCompetency` here for the competency half — verified
      by removing the dependency and watching both refusals fail.
      - **The listing refuses with 403 rather than an empty list.** It answers `[]` for
        someone who may read nothing, so a missing competency has to refuse outright or it
        would be indistinguishable from having nothing delivered.
- [x] **Check the same endpoint's siblings.** Swept all 28 routes on the teaching router.
      **No further holes.** Every one is either scoped or gated, and most are both.
      - **Authentication is not the missing half.** Every route on the teaching router was
        checked and each already requires a signed-in user, so the sweep is looking for
        missing _scoping_, not missing sign-in.
      - **Three shapes of scoping, all sound.** Eight assessment routes are self-scoped by
        `assessment.user_id != user.id`; the admin and bank routes resolve the caller's
        organisations; the learning and video routes go through
        `resolve_visible_module`. Every refusal is 404, so none of them can be used to
        enumerate what exists elsewhere.
      - **The certificate route deserved the closest look** and is fine:
        `download_certificate` checks `assessment.user_id != user.id` before generating a
        PDF that names a person.
      - **Nothing to commit but the sweep itself.** The value of this step was the audit;
        the code was already right. Worth recording so the next reader does not repeat it.
      - **A scan of route signatures alone gives false positives.** `list_delegates` looked
        unguarded until the decorator was read: its `_DEP_MANAGE` sits in
        `dependencies=[...]` rather than in the parameters. Any future sweep must read the
        decorator block as well as the signature.

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
  - **This count is inflated by the guard's own test file**, found when migrating the
    superadmin ones: only 2 of the 4 are real routes. Treat the 13 and the 4 as upper
    bounds until each is checked against `main.tsx`.
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

## Finding: `base_profession` should initialise a user, not be stored against them

Surfaced while deciding how a superadmin comes to hold `manage_users`. Recorded here
because it is a separate question from this plan and should not be smuggled into it.

**A profession describes a person at one moment, and people do not stay still.** They
progress through training grades. They lose competencies by not practising. They have
accidents and stop practising medicine altogether — at which point the person who was a
consultant is a patient, and no edit to a stored profession expresses that honestly.

**The field is already a template pretending to be state.** `base-professions.yaml` says
so itself: *final user competencies = base_profession competencies + additional −
removed*. The `additional`/`removed` machinery exists precisely so reality can diverge
from the template. So the profession answers *what should this person start with*, which
is a question asked once.

**Storing it makes changing it destructive and silent.** `PATCH /users/{id}` will set
`base_profession` to anything. When it does, every competency from the old profession
vanishes unless separately listed in `additional`, every competency from the new one
appears, and `additional`/`removed` are left untouched — so a `removed_competencies` entry
that existed to strip something from *consultant* now applies to a different base and
quietly does nothing, or something else. Nobody sees this happen and nothing records why.

**So the shape is: use a profession to initialise, then let it go.** Creating a user
expands the profession's competencies into that user's own list; after that the user has
competencies and the profession is not consulted again. The audit trail then records what
someone actually holds, not a label that stopped being true.

**The staff-picker decision above reaches the same conclusion from the other
end**, and the two are one unit of work: granting a profession there must keep
what the person already holds, which is this finding stated as behaviour rather
than as a model. Whichever is built first settles both.

**Nothing tests the destructive overwrite.** No test in `backend/tests` exercises
a `base_profession` change through `PATCH /users/{id}`, so the current
behaviour is unpinned — nothing goes red when it is fixed, and nothing would
have gone red if it had been introduced by accident. A test asserting the
silent loss should come first, as the escalation test did for
`update_my_competencies`, so the fix is a visible change to a red test.

- **This is a breaking API change.** `base_profession` is in two response schemas —
  `UserCompetenciesResponse` in `schemas/cbac.py` and the user response in
  `schemas/auth.py` — so removing it needs an `oasdiff` finding and a decision file, and
  the column needs a migration that expands each user's profession into their competencies
  before it is dropped.
- **It interacts with per-place competencies.** `2026-09-06-org-scoped-access-findings.md`
  argues a competency is held *somewhere*; a single global profession is the wrong shape
  for that regardless, so these two questions may be answered together rather than
  separately.
- **The superadmin decision does not wait on this.** Adding to `additional_competencies`
  on promotion is right either way: being a superadmin is an addition to whoever someone
  already is, not a replacement for it.

## Finding: a patient is not a user, and should not become one

Surfaced while deciding which competency `list_patients` should ask. The question
raised was whether a patient linked to an organisation or site ought to be a Quill
user as well, merely one with no login details created yet. If so, one membership
table would serve both and the question below would not arise.

**The answer is no, and the standards are explicit about it.** Researched rather
than reasoned from first principles, because it is a modelling decision the
industry has already made.

- **FHIR separates the human from their roles.** `Patient` is someone receiving
  care, `Practitioner` someone providing it, `RelatedPerson` family involved in
  another's care. The same human gets a _separate record in each role_, and a
  fourth resource, `Person`, exists only to link them and assert they are one
  individual. The specification states that Person instances are never referenced
  as actors, and does not recommend creating a `Patient` for someone not receiving
  care.
- **NHS login draws the same line.** Authentication — username, password, a
  verified account — is one system. Clinical identity — the NHS number, checked
  against the Personal Demographics Service — is another, with a verification step
  bridging them at a stated assurance level. A login is a credential _matched_ to a
  patient record, not the record itself.
- **Collapsing them breaks on the ordinary case.** A consultant who becomes a
  patient at their own trust would need one row that is both, and the account
  table carries password hashes, TOTP secrets and email verification state that
  mean nothing for someone who never logs in.

**Quill already has the right shape.** `User.fhir_patient_id` is nullable and
points from an account to a patient record where the two are the same human — the
`Person` linkage, in effect. The two membership tables are correct to be separate:
`organisation_member` keys on `user_id`, `organisation_patient_member` on a FHIR
`patient_id` with no foreign key, because FHIR owns patient identity.

### What follows for the competencies

- **`manage_users` is currently doing two jobs.** It gates both account
  administration and patient-to-organisation membership at 4146 and 4258. Those are
  different populations, and the conflation is the same shape as
  `system_permissions` holding two ideas in one column.
- [x] **Done: `manage_patient_membership`**, added to `clinical-admin.yaml` — which
  already existed for exactly this, described in `admin.yaml`'s header as
  "administration that is patient centric". The two routes at
  `/organisations/{id}/patients` now carry `DEP_REQUIRE_MANAGE_PATIENT_MEMBERSHIP`
  instead of `DEP_REQUIRE_MANAGE_USERS`, with their place checks unchanged.
  - **A new `patient_manager` profession holds it, and nothing else does.**
    `clinic_manager` was tried first and is the wrong scope: it reads as running a
    clinic — rooms, rotas, appointment slots — where this competency is about an
    organisation's caseload. `system_administrator` says "technical support only",
    and `superadmin_profession` carries no clinical competency by rule.
    - **The gap it fills is real**: every existing administrative profession is
      clinic-level or IT. There was no organisation-level administrator at all.
    - **The name is a placeholder**, and the profession is deliberately thin —
      one competency. Nobody has described this job yet, and with no real
      patients the question is close to moot. Revisit when it is not.
  - **It grants no access to a record.** Adding a patient to an organisation and
    reading their notes are different acts; the second is
    `access_patient_records`.
  - **Four tests moved to a new `clinic_manager` fixture**, three in
    `test_main_endpoints.py` and one in `test_messaging.py`. They had used the
    admin fixture, which now correctly fails these routes — the fixtures make the
    distinction visible rather than hiding it.

### Finding a patient at another organisation

Asked alongside the above: who may search across organisations to pull in a patient
who has moved hospital or is being treated elsewhere? Nothing in the codebase does
this today, and every place check refuses it by design.

**It is not a permissions question, and should not be solved by widening one.** The
industry names both halves:

- **An EMPI** — enterprise master patient index — is the component that matches
  records across organisations, as distinct from an MPI that resolves identities
  within one application.
- **Break-the-glass** is the recognised pattern for reaching a record outside normal
  access. It is permitted and it triggers a privacy audit; the audit is the point,
  not an afterthought.

So this is a feature with consent rules and an audit trail, not a step in this plan.
Recorded here so the next reader does not mistake it for one.

## Not addressed here

- What replaces `staff` for "may reach clinical workflows at all", if anything still needs
  it once the competency checks are in place.
- Cross-organisation patient search — an EMPI-style match plus break-the-glass access,
  with its own consent and audit design. See the finding above.
- Whether `platform_role` should be nullable rather than carrying an explicit
  "not an operator" value.
