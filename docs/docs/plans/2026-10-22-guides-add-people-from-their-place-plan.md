# Guides add people from their place plan

The guides "Add a delegate by hand" and "Assign a teaching admin" both
start at Admin, then Users, then the six-step **Create new user** form,
where the admin has to remember to pick the right site or organisation
and has no way of knowing first whether the person already has an
account. Each organisation and site already has an **Add staff** page
that starts with a lookup by username or email: it finds somebody who
already has an account, and for anybody else offers **Create new user**
with the email address and the place filled in.

This plan rewrites both guides to start from that page, and records two
gaps in it that the guides have to work round today. Neither gap stops
anybody: both are recorded so a later change can close them.

## Phase 1: Add a delegate from their site

- [x] **Rewrite `frontend/src/guides/content/add-a-delegate-by-hand.md`
      around the site's Add staff page.** Admin, then Sites, open the
      site, press **Add staff**, type the delegate's email address and
      press **Find**. Somebody new is offered **Create new user**, which
      opens the six-step form with their email and the site already
      chosen; the steps after that are the ones the guide had. Somebody
      who already has an account is chosen for you: give them the role
      **Trainee**, press **Add staff member**, then open them from the
      site's staff table and enrol them on the **Teaching** card with
      **Save enrolment**. That one save gives the two learner
      competencies, the place at the site and the enrolment together
      (`admit` in `backend/app/features/teaching/access.py`), so the
      existing-account path needs no Practice step.
- [x] **Seed somebody with an account at no site**, in
      `backend/scripts/seed_guides.py`, for the existing-account
      pictures: Oliver Grant, a teaching delegate who belongs nowhere.
      The spec adds him to the site and enrols him for real, since the
      member page only exists once he is a member; the guides' stack is
      thrown away after each run.
- [x] **Retake the pictures** in
      `frontend/e2e/guides/add-a-delegate-by-hand.spec.ts`: the site's
      staff table with its Add staff icon, the lookup offering Create
      new user, the form's first two steps filled in from the lookup,
      the lookup finding Oliver with Trainee chosen, and his Teaching
      card with a module ticked.

## Phase 2: Make a new teaching admin from their organisation

- [x] **Rewrite the "Give a new person the role" section of
      `frontend/src/guides/content/assign-a-teaching-admin.md`** to
      start from the organisation's Add staff page: type their email,
      **Find**, **Create new user**, then the form opens with the email
      and organisation filled in. The section for somebody who already
      has an account stays on **Edit user**, for the reason in the next
      phase.
- [x] **Retake its pictures** in
      `frontend/e2e/guides/assign-a-teaching-admin.spec.ts`: the lookup
      offering Create new user, and the form's first step with Teaching
      admin chosen.

## Phase 3: Gaps in the Add staff pages

Not started. Code changes, each its own pull request when picked up.

- [ ] **Offer a profession to somebody who is already staff.**
      `AddStaffToSitePage.tsx` and `AddStaffToOrgPage.tsx` show the
      **Base profession** box only for somebody who holds nothing a
      member of staff would (`holdsStaffLikeCompetency` in
      `frontend/src/lib/cbac/staffLike.ts`). So a nurse or a delegate
      who is to become a teaching admin cannot be given the profession
      there, and the guide sends the admin to **Edit user** instead.
      Showing the box for everybody, still optional, would let the
      guide use one page for both cases. The grant is already additive
      on the backend (`add_member` in `backend/app/org_units/members.py`).
- [ ] **Let adding a Trainee at a site with teaching also admit them.**
      Today **Add staff member** with the role Trainee writes the
      membership only, and the delegate can take nothing until somebody
      opens them and saves an enrolment. Offering the modules on the
      Add staff page itself, and calling `admit` in the same request,
      would make it one step, as registering already is.

## Decisions

- **The existing-account teaching admin path stays on Edit user.** Add
  staff would add the membership but, for anybody already staff, not
  the profession, so the guide would need both pages. Edit user does
  both in one place until the first gap in Phase 3 is closed.
- **The spec really adds and enrols Oliver Grant.** The member page and
  its Teaching card exist only for a member, so the pictures cannot be
  taken without it. He then appears in the site's staff list in any
  guide pictured after this one in the same run, which is a realistic
  list rather than a wrong one.
