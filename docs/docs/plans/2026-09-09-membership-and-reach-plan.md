# Membership at a place, and how far it reaches

## The rule

- **A person is granted membership of a place** — an organisation, or a site. The two are
  independent. Being on a site does not put you in the organisation.
- **Each membership carries a capacity** — `staff` or `trainee` now, `patient` later.
  What kind of member this person is here.
- **Reach flows downward only.** Organisation membership reaches the organisation and every
  site linked to it. Site membership reaches that site, and stops.

Two rules operating together, and they must not be confused:

- **Where you can reach** — inherited downward, organisation to site.
- **What you may do there** — never inherited. A practising competency is granted per place,
  which is what lets a ward manager administer their ward without trust-wide authority. That
  was settled in `2026-09-06-org-scoped-access-findings.md` and this does not disturb it.

**Teaching is delivered downward, so there is no upward path to design.** A question bank
belongs to an organisation and is made available to its sites; a student at a site receives
what has been delivered there. The student is not reaching up into the organisation.

**Organisation members reach site people, not only site things.** A trust administrator or
clinical director is expected to see and work with the staff of any linked site. That is
what makes downward reach worth having.

## What is wrong today

- **`organisation_staff_member` has no capacity.** Two columns, organisation and user. So a
  student and a consultant are the same row, and nothing reading the table can tell them
  apart. `site_member` already solved this; organisations did not get the same treatment.
- **Students are written into it anyway.** `register` inserts an organisation row and a site
  row, and refuses a site without an organisation. Admin user creation and update do the
  same. There is no route that produces a site-only member.
- **So the organisation admin page lists students as staff.** `get_organisation` selects
  everyone in that table, filtering only superadmins out of an admin's view. Nothing marks
  the students, because nothing can.
- **There are two resolvers that disagree.** `organisations.get_user_org_ids` reads the staff
  table alone. Teaching's `_get_user_org_ids` also walks site membership *upward* into
  organisation membership. The second exists because teaching needed site people to reach
  organisation content, and rolling them up was the available fudge.

That upward roll-up is the opposite of the rule above, and it is why the same question has
two answers depending on which function you call.

## Where this work currently lives

Written down because the plan files themselves are spread across unmerged branches, so
reading them on `main` shows an older state than reading them here.

Three pull requests, which must merge in this order:

- **#572** — deletes `require_staff` and `DEP_REQUIRE_STAFF`, and ticks the first step of
  `2026-09-09-platform-role-plan.md`. Independent of the other two.
- **#576** — this plan, and the correction to that plan's messaging step.
- **#577** — the organisation capacity work, stacked on #576, so it carries #576's commits
  until that one lands.

**The hazard to know about.** All three touch the same plan documents. A tick applied on one
branch is invisible on the others and on `main`, so a step can look undone when it is done,
or be done twice. If any of them is reworked rather than merged, check the checkboxes against
the code rather than trusting them — that is exactly how the teaching plan came to show
thirty-four outstanding items when the work had shipped.

**What is actually built and unmerged**, as distinct from planned: the capacity column and
its migration, the rename of the table and its 49 references, eight tests, and the deletion
of the unused staff guard. Everything else on the lists below is still a plan.

## The change

- [x] **Give the organisation table a capacity and rename it** — `organisation_member`,
      with `capacity` validated in code. Autogenerate did propose drop-and-create, exactly as
      predicted, so the migration is hand-written and renames the primary key and both
      foreign keys explicitly.
      - **One vocabulary, not one per table.** Sites already said `trainee` where this plan
        said `student`. Two membership tables using different words for the same person is
        the mistake this work exists to undo, so both now share `MEMBER_CAPACITIES` and
        `validate_member_capacity`. `trainee` is the name, confirmed — this plan said
        `student` in an earlier draft, which was a slip.
      - Registration records a delegate as `trainee` at the organisation as well as the
        site. The other three write sites say `staff` explicitly.
      - **The column defaults to `trainee`, not `staff`.** An insert that forgets to say gets
        the narrower capacity. A first attempt defaulted to `staff` on the reasoning that a
        wrongly-marked trainee complains where a wrongly-marked staff member does not — which
        optimises for discovering mistakes over surviving them, the wrong trade here and
        against `CLAUDE.md`'s own rule of least privilege and fail-safe defaults.
      - Existing rows are a separate question and do say `staff`, because they were added
        when the table meant staff and those people are staff. The migration sets them, then
        flips the default, so history and future inserts get the answers they each need.
- [x] **Backfill by capacity, not by guesswork.** Done in the same migration, since a
      NOT NULL column cannot be added without deciding what existing rows say. A row becomes
      `trainee` when that person is a trainee at a site belonging to **that same
      organisation** — scoped deliberately, because someone may be a trainee at one trust and
      staff at another, and marking both from a single site membership would remove access
      they should keep.
- [x] **Replace the two resolvers with one.** `get_reachable_org_ids` in
      `app/organisations.py` answers *which places can this person reach*; teaching's
      `_get_user_org_ids` is now a four-line wrapper adding only its own 403, and the
      duplicated roll-up query is gone.
      - **It is two functions, not one, and deliberately so.** `get_member_org_ids` answers
        *is this person a member here*, `get_reachable_org_ids` answers *can they get here*.
        Collapsing them is the mistake, not the goal: reach is why a site trainee sees the
        trust's teaching content, and membership is why they are not thereby its staff. Both
        take an optional `capacity=`, which is what the messaging self-join check needs.
      - **A third copy was found**, in the delegates route, resolving the caller's
        organisations inline. It now calls `get_member_org_ids` — membership, not reach,
        since that route lists the people *below* the caller and a trainee reaching up via a
        site link must not thereby list its staff.
      - **`get_org_staff_ids` says staff and returns everyone**, and was left that way. A
        first attempt narrowed it to `capacity="staff"` and broke admin user listing, which
        genuinely wants everybody at the organisation — a trainee an admin cannot see is a
        trainee they cannot administer. The name is wrong; the fix is call sites moving to
        the explicit `get_org_member_ids(..., capacity=...)`, not a silent change under
        them. **Worth remembering: the capacity column makes it possible to narrow a query,
        which is not the same as it being right to.**
- [ ] **Walk the call sites in batches.** 29 calls to the app-wide resolver — 15 in `main.py`,
      7 in the teaching router, 5 in `messaging.py`, 2 internal — and 17 in teaching's own.
      Fifty references to the organisation table in total.
      - [x] **Batch one: the membership half.** All 24 `get_user_org_ids` call sites outside
        teaching now say `get_member_org_ids` — 18 in `main.py`, 4 in `messaging.py`, 2
        internal to `organisations.py`. Behaviour-identical, because `get_user_org_ids`
        already delegated there; what changes is that each site states the question it asks.
        - **Every one of them meant membership**, read individually rather than assumed:
          admin place checks (`if org_id not in ...`), membership deletion scoping, the
          patient-sharing check, and messaging's org overlap. Not one wanted a site trainee
          to reach up into the trust, and several would be wrong if they did —
          `get_shared_org_ids` gates patient records, and `_ensure_shared_org` decides
          whether an admin may see a user at all.
        - **`test_admin_routes_ask_membership.py` pins the routes**, which no test did;
          `test_place_resolver.py` only ever pinned the resolvers. Verified by temporarily
          pointing `get_organisation` at `get_reachable_org_ids`: the new test went red with
          `assert 200 == 404`, which is the widening it exists to catch.
        - **`get_user_org_ids` now has no callers.** Left in place so this batch reads as a
          rename and nothing else; deleting it is a one-line follow-up.
      - [ ] **Batch two: the reach half**, in teaching's router — nine call sites through
        `_get_user_org_ids`, which already wraps `get_reachable_org_ids`. This is where the
        widening actually lives, so it wants its own review rather than being buried among
        renames.
- [ ] **Stop registration writing an organisation row for a student.** A student registers
      into a site. Remove the requirement that a site needs an organisation alongside it, in
      `register` and in the two admin user routes.
      - **The reason for this step has changed since it was written**, and it is worth
        re-examining rather than doing on the original grounds. It was written because the
        organisation row was a lie — it called a delegate staff. It no longer is: the row now
        says `trainee`.
      - What remains is a duplication argument rather than a correctness one. Reach into an
        organisation should come from the site-to-organisation link, not from a second row
        that says the same thing; two sources of truth for one fact will eventually
        disagree. That is a good reason, but a weaker one, and it should be weighed against
        the cost of the resolver having to walk the link on every request.
      - **It depends on the call-site walk above**, which is why it now sits after it.
        Until the call sites ask *which places can this person reach*, removing the
        organisation row would make delegates invisible to everything outside teaching.
      - **Re-examined, and the dependency is on the call-site walk rather than the resolver
        split.** `get_reachable_org_ids` exists and that box is ticked, but almost nothing
        calls it: `get_user_org_ids` — 19 call sites in `main.py` alone, plus messaging and
        teaching — delegates to `get_member_org_ids`, which deliberately does *not* walk the
        site link. So removing the organisation row today would make delegates invisible to
        every one of those callers, which is exactly the failure this bullet predicted.
      - **This item was listed before the walk until that was found, and has been moved
        below it.** Each call site moves to `get_reachable_org_ids` where it means reach;
        only then is the organisation row genuinely redundant and safe to stop writing.
      - **The cost objection is smaller than it looks.** `get_reachable_org_ids` is one extra
        query — a join of `organisation_site` against `site_member` — not a walk per
        membership. Worth weighing against duplication on its merits, not as a performance
        worry.
- [x] **Filter the organisation admin page to staff**, so students stop appearing on it.
      - **The column could tell them apart since it was added; the page still could not**,
        because no caller had been changed to ask. `get_organisation`'s staff query now
        filters on `capacity == "staff"`, which is what its own heading promises.
      - **`staff_count` is derived from the same rows**, so the number and the list cannot
        disagree. Pinned by a test, since a count taken from a second query is exactly the
        kind of drift nobody reports — they just stop trusting the number.
      - **Trainees are not hidden from administration.** They are listed on the delegates
        pages, which read the same table asking for their own capacity.
      - **It broke six fixtures, and they were already wrong.** Every bare
        `insert(organisation_member)` in `test_main_endpoints.py` described an admin or a
        staff member while writing `trainee`, because the column defaults to the narrower
        capacity. The same thing happened to five fixtures in `test_messaging.py` when that
        step landed — the default is doing its job, making an unstated assumption visible
        the moment something reads the column.
      - **Six more bare inserts remain, one in each of six other test files**, latent rather than
        broken: nothing else reads capacity yet. Whoever changes the next caller to ask
        should expect the same failure and read it as the fixture being wrong, not the
        caller.
- [x] **Give staff membership its own competency, `manage_staff_membership`.** Writing a
      membership row is gated on `manage_users` today, which also gates twenty-five other
      routes: creating and deleting accounts, activating patients, editing organisations,
      toggling feature flags, and site CRUD. So the person who should be able to add a
      nurse to their ward can also delete the site.
      - **It pairs with `manage_patient_membership`**, which already exists and already
        made this separation for patients, for the same reason and one layer down. Staff
        membership had no equivalent only because this work replaced the *rank* on those
        routes with a competency and kept the competency's existing breadth.
      - **Four routes carry it**: `add_staff_to_organisation`,
        `remove_staff_from_organisation`, `add_site_staff`, `remove_site_staff`. Their
        place check is unchanged — the competency answers *what*, membership answers
        *where*.
      - **Expand before contract, because narrowing a gate takes access away.** Add the
        competency and grant it to all four professions holding `manage_users`
        (`clinic_manager`, `system_administrator`, `superadmin_profession`,
        `teaching_manager`) in the same change that switches the routes. Nobody loses
        anything at the switch; what becomes possible is granting one without the other,
        which is the point.
      - **Whether site CRUD and organisation feature toggles also want separating is a
        real question and not this one.** Both are further from "managing users" than
        membership is. Recorded so the next reader sees it was considered rather than
        missed.

## Why the batches matter

Every one of those call sites currently means *organisations I am staff of*. After the
change some will mean *places I can reach*, which is a wider set. That is the same shape of
change that produced the cross-organisation holes closed earlier this month, so each batch
wants a test that fails without it — the discipline that caught three bugs this week and
would have caught a fourth.

The direction of the risk is worth naming: this change can only ever **widen** what a call
site admits, never narrow it, because reach adds sites to a set that previously held only
organisations. A missed call site is therefore a permission that is too generous, not too
strict — which is the failure mode that does not announce itself.

## What this unblocks

- **The messaging self-join check.** `join_conversation` currently keeps students out by
  asking what platform level they hold, because the membership check below it cannot tell a
  student from a consultant. With a capacity column it can, and the level check goes — which
  is the step `2026-09-09-platform-role-plan.md` could not take.
- **The organisation admin page**, which stops mixing students into the staff list.
- **Organisations catching up with sites**, which the org-scoped findings predicted would be
  needed and left open.

## Order, and what waits

Do this **before** the platform role work continues past its first step. That plan's second
step is the messaging check, and it is blocked on this; its third step, the admin gates, is
not blocked and can proceed in parallel if wanted.

**`patient` as a capacity waits on something else.** Staff are identified by their login
account and patients by a FHIR record number, bridged only by a nullable column. Adding
`patient` here assumes those have met, which is the `user_patient_link` item in `todo.md`.
Build the model now with `staff` and `trainee`; the third value arrives with that work.

## Communication reach is a different question

Messaging is not needed clinically at present and the self-join check is the only part of it
this plan touches. When it is picked up again, it will want a **contact list**, and the reach
that governs it is not the reach described above.

Someone at a site should be able to contact people at their organisation, people at its
other sites, and — with the right access — people at other organisations and their sites,
and further afield from there.

**That is upward and sideways, where administrative reach is downward only.** The two are
not in conflict; they are answers to different questions:

- **Administrative reach** — whose records and settings may I act on? Downward, because
  authority flows from the organisation to its sites.
- **Communication reach** — who may I contact? Wider, and not shaped by authority at all. A
  trainee needing to reach their clinical lead, or a ward needing to reach another ward, has
  nothing to do with who administers whom.

**The consequence for this plan.** It proposes replacing two resolvers with one, and that
still holds for administrative reach. But the single function should be named for what it
answers rather than sounding like a general-purpose "places this person can see" — otherwise
the contact list will be built on it, and either be wrong or force the downward rule to be
bent until it means nothing.

Better to have a second, deliberately separate question when messaging returns than to
overload the first. A shared function that answers "reach" for every purpose is how the
`role` column came to mean three things.

## Not addressed here

- Whether a person can hold both an organisation and a site membership in the same
  organisation, and what capacity means if the two disagree.
- Whether reach should stop at a site's children — sites nest, and this plan treats a site as
  a leaf.
