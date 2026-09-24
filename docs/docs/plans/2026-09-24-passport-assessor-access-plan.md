# Passport assessor access plan

An assessor invited by email to sign off one competency gets a link that does
not work. The email points at `/passport/requests`, which is not a route; the
inbox is at `/passport/inbox`. Fixing the link is one word, and it uncovers a
larger problem underneath.

`assess_clinician_passport` is the only competency gating the passport feature.
It sits on all 36 routes of `backend/app/features/passport/router.py` as
`_DEP_PASSPORT`, and on the whole route subtree in `frontend/src/main.tsx` as a
single `RequireCompetency`. So it answers "may this person reach the passport
at all", and nothing answers the narrower question "may this person do anything
here except sign off the request they were named on".

That matters because `external_assessor`, the base profession
`accept_assessor_invite` gives an invited clinician from elsewhere, grants
exactly `assess_clinician_passport`. The backend is safe: every route checks
ownership separately, so `_require_holder` returns 404 to anybody who is not
the holder and `_require_signoff_reader` limits an assessor to the one sign-off
naming them. The frontend is not: the same competency guards
`/passport/cpd`, `/passport/logbook`, `/passport/certificates` and the rest, so
an external assessor passes the guard for pages that will show them nothing.

This plan splits the one competency into two, so that reaching the feature and
using the whole of it become separate questions.

## The three people who arrive at the inbox

- **Naive to Quill.** Invited by email, registers through
  `accept_assessor_invite`, and is created with `external_assessor`. Sees the
  inbox and nothing else.
- **Has a Quill account, no passport access.** `accept_assessor_invite` links
  the existing account rather than creating one, and deliberately changes
  nothing about it. The code comment says "all fourteen clinical professions
  already carry `assess_clinician_passport`", which is true of clinicians and
  false of `teaching_delegate`. Sees the inbox and nothing else.
- **Has a Quill account and a passport of their own.** Reaches the inbox from
  the email, and their own passport as before.

## The three competencies

Three verbs, three questions, and no id resembling another. The names were
argued over precisely because four ids in this area sounded alike, and somebody
meeting one in a route guard has to know which it is without looking it up.

- **`review_clinician_passport`** — may open the assessor queue, and review a
  passport they were asked to assess. Somebody else's record, never their own,
  which is why it carries no `own`. All that `external_assessor` grants.

- **`read_own_clinician_passport`** — may open the passport feature and read
  their own record, including exporting it. Also the door: holding it is what
  puts the passport pages within reach at all.

- **`write_own_clinician_passport`** — may add to their own record. Sold, so no
  base profession grants it, and it is the renamed `passport_write`.

**Write implies read.** A route asking whether somebody may read their own
passport is satisfied by either competency, and holding both is the ordinary
state of a paying holder rather than a mistake. The implication runs one way
only: reading never implies writing.

**A lapsing entitlement must never cost somebody their own record.** Reading
and exporting a passport you hold is derived from owning it, never from paying,
and that guarantee predates this plan. Dated grants lapse per row by `ends_on`,
so nothing stops a badly written grant dating both together. The rule is that
only `write_own_clinician_passport` is ever dated, and it is worth a test
rather than a comment: grant both, expire the write, and assert the holder can
still read and export.

### Why these names and not the earlier ones

Three earlier attempts are recorded here because each failed for a reason worth
not repeating.

- **`access_clinician_passport`** was retired on 21 September for meaning both
  "reach the feature" and "hold a passport". The YAML entry for the new ids
  should say plainly that it is not an earlier version of any of them.

- **`assess_clinician_passport`** reads as `access_clinician_passport` to
  somebody with dyslexia: one transposed letter, and the two would sit side by
  side in every route guard. `review_` shares no letters with `access`.

- **`full_access_clinician_passport`** promised more than it granted. "Full
  access" reads as including writing, which is sold separately, so a reader
  could not tell whether `write_` was included or additional. That is the same
  conflation the retirement was meant to end.

**`review_` is also deliberately broader than `sign_off_`.** An assessor may
later need to read a whole passport rather than one request, and an id naming a
single action would have to be renamed again when that happens.

## How they layer

They are not alternatives. A consultant assessing a registrar holds
`review_clinician_passport` from their profession *and*
`read_own_clinician_passport`, and probably `write_own_clinician_passport` too
if their organisation pays. `external_assessor` is the only profession holding
the review competency and nothing else, which is what this split exists to
express.

Nothing checks for the review competency *without* the others, and nothing
should: "assessor only" describes where somebody sits, never a test a route
performs.

## What an inbox-only assessor may reach

Five routes:

- `GET /requests/inbox`, their queue
- `GET /{passport_id}/sign-offs/{signoff_id}`, the request naming them
- `POST /{passport_id}/sign-offs/{signoff_id}/sign-off`
- `POST /{passport_id}/sign-offs/{signoff_id}/decline`
- `GET /{passport_id}/sign-offs/{signoff_id}/verify`, so they can confirm
  afterwards that a sign-off they made was recorded

Everything else needs `read_own_clinician_passport`. The ownership checks inside
each route stay exactly as they are; this narrows who reaches them, and
nothing else.

## The feature gate stays as it is

`RequireFeature feature="passport"` asks whether the passport feature is
enabled on an org unit the user belongs to. An external assessor has no
passport feature of their own, so on its face this would refuse them.

It does not, because an assessor is made a member of the *holder's* org unit
with capacity `external`, where the feature is enabled. Membership of the place
they are assessing for is what carries the reach, not anything about where they
work.

**Today only `accept_assessor_invite` writes that membership**, and only
somebody with no Quill account is sent there. An existing account goes straight
to the inbox, so a `teaching_delegate` who clicks the link is never made a
member and never granted the competency, and sees a 404 with nothing to
explain it. Phase 3 moves the grant to the moment of asking, so both paths
grant the same thing and the inbox link stays direct.

## Phase 1: The dead link

- [ ] **Change `/passport/requests` to `/passport/inbox`** in
      `_email_sign_off_request`, `backend/app/features/passport/router.py`.
      One word, and it is wrong for every assessor who already has an account.

- [ ] **Add a test that the emailed URL names a real route.** A literal string
      in a template cannot be typechecked, so the test asserts the path
      against the route table rather than against another literal.

## Phase 2: The three competencies

Renaming two live ids and adding a third, in one phase because a half-renamed
catalogue grants nothing coherent. Nobody is using production, which is what
makes renaming cheaper now than it will ever be again.

- [ ] **Rewrite the three entries in
      `shared/competency-definitions/passport.yaml`**:
      `assess_clinician_passport` becomes `review_clinician_passport`,
      `passport_write` becomes `write_own_clinician_passport`, and
      `read_own_clinician_passport` is new.

      Keep the retired `access_clinician_passport` entry exactly as it is.
      Deleting it revokes nothing and leaves the id with nothing describing it, which is what
      an audit trail needs in order to say what somebody was authorised to do
      at the time. Add a line to its comment saying the three new ids are not
      versions of it.

      Ids must be unique across the whole directory, not just this file.

- [ ] **Update `shared/base-professions.yaml`.** The 15 professions holding
      `assess_clinician_passport` take `review_clinician_passport` and
      `read_own_clinician_passport`. `external_assessor` takes
      `review_clinician_passport` alone, which is the whole point of that
      profession.

      No profession takes `write_own_clinician_passport`, exactly as none took
      `passport_write`: it is sold, and a profession granting it would hand
      every clinician the paid feature at provisioning.

- [ ] **Run `yarn generate:types` in `frontend/`** so
      `src/generated/competencies.json` carries all three.

- [ ] **Rename every use in the backend.** `passport_write` appears eight times
      in the router and in `entitlements.py`, `_require_writer` and the
      competency checks. A rename with no behaviour change, so the tests that
      already cover writing should pass untouched.

- [ ] **Add `_DEP_PASSPORT_READ`** to the router, requiring
      `read_own_clinician_passport`, and leave `_DEP_PASSPORT` requiring
      `review_clinician_passport`. The five assessor routes keep
      `_DEP_PASSPORT` alone; the other 31 take `_DEP_PASSPORT_READ` as well.

- [ ] **Make write imply read wherever reading is checked.** A route asking
      whether somebody may read their own passport passes on either
      `read_own_clinician_passport` or `write_own_clinician_passport`. One
      helper, so the implication is stated once rather than assumed at 31 call
      sites.

- [ ] **Migrate the existing rows.** Rewrite `competency_id` in
      `user_competency` from `assess_clinician_passport` to
      `review_clinician_passport` and from `passport_write` to
      `write_own_clinician_passport`, and insert a
      `read_own_clinician_passport` row for every user whose base profession is
      in the 15.

      **Also insert one for every current holder of
      `write_own_clinician_passport`**, dated to never expire. Write implies
      read, but the implication lives in the code, and a paying holder whose
      term lapses must be left holding read on its own. Relying on the
      implication alone would mean a lapse silently removed both.

      Follow `2026_09_23_1730-56f3ad035100` for the shape. An `UPDATE` of a
      column value is not destructive, so no `allow-destructive` marker is
      needed, but read the generated `upgrade()` and `downgrade()` before
      committing.

## Phase 3: The frontend

- [ ] **Split the route guard in `frontend/src/main.tsx`.** The inbox and
      `/passport/sign-off/:signOffId` keep
      `RequireCompetency competency="review_clinician_passport"`. Every other
      passport route moves inside a nested guard requiring
      `read_own_clinician_passport`. `RequireFeature feature="passport"` wraps both,
      unchanged.

- [ ] **Update `featureNavItems.ts` to ask the new competency.** It already
      distinguishes the two cases: `assessesOnly` is `canAssess && !canWrite`,
      and it already sends such a person straight to the queue rather than to
      a passport they cannot create. Change `hasPassport` to ask
      `read_own_clinician_passport`, and keep `assessesOnly` for the inbox entry, so
      somebody with neither sees no passport entry at all.

- [ ] **Grant an existing account what it needs at the moment of asking**,
      in `request_sign_off`, rather than sending it through the accept page.

      `_email_sign_off_request` already looks up whether the address matches a
      `users` row, and sends an existing account straight to `/passport/inbox`.
      That link is correct and should stay. What is missing is that nothing
      grants them anything on the way, so they arrive holding nothing and see
      a 404.

      Where the lookup finds a user, grant `review_clinician_passport` through
      `sync_competency_rows` with `source="invitation"`, and add them to the
      holder's org_unit with capacity `external`, exactly as
      `accept_assessor_invite` does. Both helpers exist: `_holder_org_unit`
      returns the place, and the membership insert is the same few lines.

      **Asking somebody is the grant.** A holder naming an assessor is the
      decision that they may assess, so nothing is gained by asking them to
      confirm a second time on a page that tells them what they already know
      from the email. The accept page earns its place for somebody with no
      account, where it collects a username, a password and a registration
      number; for somebody already signed in it collects nothing.

      **Idempotent, as the accept flow is.** A second request to the same
      assessor must not write a second membership row or extend anything:
      check for a current grant and an existing membership first.

      **It grants the narrow competency only.** Being asked to assess never
      confers `read_own_clinician_passport`, so a `teaching_delegate` gains their
      queue and nothing else. Somebody who already holds the wide grant keeps
      it, because the grant is additive and closes nothing.

## Phase 4: Tests

- [ ] **A `teaching_delegate` invited as an assessor can open the inbox and
      sign off, and cannot open the holder pages.** This is the case that
      currently 404s, and the one a reader will want to see pinned.

- [ ] **An `external_assessor` reaching a holder-only route gets 403 from the
      new dependency**, not 404 from an ownership check. The two are easy to
      confuse and only one proves the split works.

- [ ] **A passport holder still reaches everything**, so the 15 professions are
      demonstrably unaffected.

- [ ] **Asking an existing account grants it the narrow competency and the
      membership, and asking twice writes neither again.** The grant now
      happens in `request_sign_off`, so this is what proves an assessor can
      reach their queue without an accept page.

- [ ] **A lapsed `write_own_clinician_passport` leaves reading intact.** Grant
      both, expire the write row, and assert the holder still reads and
      exports in full. This is the guarantee the whole read/write split exists
      to protect, and the one a careless migration would quietly break.

- [ ] **Being asked never confers `read_own_clinician_passport`.** A
      `teaching_delegate` asked to assess gains a queue and no holder pages,
      which is the whole point of the split.

## What this does not change

- **No ownership check moves.** `_require_holder`, `_require_writer` and
  `_require_signoff_reader` keep their present behaviour, including answering
  404 rather than 403 where a passport's existence would otherwise be
  confirmed to a stranger.
- **Writing is still sold.** `write_own_clinician_passport` comes from no base
  profession, exactly as `passport_write` did.
- **`RequireFeature feature="passport"` is untouched.**
