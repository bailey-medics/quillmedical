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
      - It also depends on the step below. Until one resolver answers *which places can this
        person reach*, removing the organisation row would make delegates invisible to
        everything outside teaching.
- [x] **Backfill by capacity, not by guesswork.** Done in the same migration, since a
      NOT NULL column cannot be added without deciding what existing rows say. A row becomes
      `trainee` when that person is a trainee at a site belonging to **that same
      organisation** — scoped deliberately, because someone may be a trainee at one trust and
      staff at another, and marking both from a single site membership would remove access
      they should keep.
- [ ] **Replace the two resolvers with one.** A single function answering *which places can
      this person reach*, applying the rule: organisation memberships, plus the sites of
      those organisations, plus direct site memberships. Delete teaching's upward roll-up.
- [ ] **Walk the call sites in batches.** 29 calls to the app-wide resolver — 15 in `main.py`,
      7 in the teaching router, 5 in `messaging.py`, 2 internal — and 17 in teaching's own.
      Fifty references to the organisation table in total.
- [ ] **Filter the organisation admin page to staff**, so students stop appearing on it.

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
