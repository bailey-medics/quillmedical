# Membership at a place, and how far it reaches

## The rule

- **A person is granted membership of a place** — an organisation, or a site. The two are
  independent. Being on a site does not put you in the organisation.
- **Each membership carries a capacity** — `staff` or `student` now, `patient` later. What
  kind of member this person is here.
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

## The change

- [ ] **Give the organisation table a capacity and rename it** — `organisation_member`, with
      `capacity` validated in code the way `SITE_CAPACITIES` is. Same shape as the site work,
      and the same trap: autogenerate proposes drop-and-create for a rename, so write the
      migration by hand and rename the auto-named constraints explicitly.
- [ ] **Stop registration writing an organisation row for a student.** A student registers
      into a site. Remove the requirement that a site needs an organisation alongside it, in
      `register` and in the two admin user routes.
- [ ] **Backfill by capacity, not by guesswork.** Existing organisation rows that correspond
      to a `trainee` site membership become students; the rest become staff. Anything
      ambiguous stays staff, which is the conservative direction — a wrongly-marked student
      loses access they had, a wrongly-marked staff member keeps access they should not have,
      and the first is safer to discover.
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
Build the model now with `staff` and `student`; the third value arrives with that work.

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
