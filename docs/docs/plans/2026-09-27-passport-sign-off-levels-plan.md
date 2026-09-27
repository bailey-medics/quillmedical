# Passport sign-off levels plan

Some competencies are signed off against a scale rather than simply done or not
done. The oncology radiotherapy competencies use the RCR entrustment scale,
from "Entrusted to observe only" to "Entrusted to act unsupervised". On 27
September 2026 a holder on the live site asked for
`define_radiotherapy_target_volume` to be signed off and was refused with the
server's own error, naming raw level ids. `SignOffRequestForm` has a Level
field, but neither page that uses it passes the competency's levels, so it
never appears and no request for a scaled competency can succeed. Worse, the
request route emails the assessor before it checks the level, so the assessor
was sent an invitation for a request that was then never saved.

The outcome is that the holder asks for a level and the assessor decides it,
which is how entrustment works in workplace-based assessment: the trainee says
what they think they are ready for, and the supervisor makes the entrustment
decision. The assessor sees the requested level already chosen and can change
it, giving a reason when they do. The record keeps both levels, and the kind of
sign-off (first time, reassessment or progression) is worked out from the
level the assessor signed, not the one requested. This reverses one decision
in the [clinician passport plan](2026-09-08-clinician-passport-plan.md); see
Decisions.

## Phase 1: Check a request before anything is emailed

- [x] **Validate the competency and the level before `_email_sign_off_request`**
      in `request_sign_off` in `backend/app/features/passport/router.py`. The
      route mails first on purpose, so that a failed send leaves nothing saved,
      and that reasoning stands. But a check that can refuse the request must
      run before the mail, or the assessor is told about a request that does
      not exist. `service.check_request` holds the checks (the competency
      exists, the level is one it declares, a level is named when it has a
      scale); the route calls it first through `_checked_request`, and
      `service.request_sign_off` still calls it itself, so neither can drift
      from the other. If the service still refuses after the email has gone,
      which would mean the two disagree, the route logs it at error and
      answers 500 rather than a 400 the holder could not act on.
- [x] **Say it in plain English.** "Choose the level you are asking to be
      signed off at", and "That level is not one this competency is signed
      off at", rather than messages naming `define_radiotherapy_target_volume`
      and each level's id. The ids go to the log instead, at error, because the
      form should never send these: arriving there means the form and the
      server disagree, which is what reaches the team through phase 6.
- [x] **Tests**: a request for a scaled competency with no level is refused
      with the plain message, sends no email, saves no invitation and logs an
      error; one naming a level the competency does not declare is refused
      without echoing the id and sends no email. They assert on the email not
      being sent, not only on the status code, since the status was already
      right and the mail was the bug. `test_passport_service.py` pinned the old
      message, with its ids, so those two tests now pin the plain one.

## Phase 2: The holder asks for a level

- [x] **Pass the competency's levels to `SignOffRequestForm`** from both
      `PassportSignOffsPage.tsx` and `PassportCompetencyPage.tsx`, through
      `levelsFor` in `frontend/src/lib/passport/levels.ts`, which reads the
      generated competency catalogue. Imported directly rather than through
      the `@lib/passport` barrel, because the page tests mock that module whole.
- [x] **Make Level required when the competency has a scale**, in
      `SignOffRequestForm.tsx`: `canSubmit` stays false until one is chosen.
      Labelled "Level you are asking to be signed off at", described as "Your
      assessor decides, and may sign off a different level", so it reads as the
      holder's ask rather than the outcome. A competency with no scale shows no
      field, as before.
- [x] **Name the level in the invitation email.** `render_invite` and
      `passport_invite.html.j2` take `level_name`, so the assessor reads "…at
      the level Entrusted to act unsupervised" and that they may sign off a
      different level. A new preview, `passport-invite-with-level`, shows it,
      and `just email-preview` regenerated the committed renders.
- [x] **Tests**: the labelled field; the form will not send a scaled request
      without a level, and sends the one chosen; `levelsFor` gives a scale in
      its order and nothing for a competency without one; the email names the
      level.

## Phase 3: The record keeps the level that was asked for

- [x] **Add `requested_level: LevelRef | None`** to `SignOff` in
      `backend/app/features/passport/schemas.py`, set once when the request is
      made. Until then `level` held the request until signing overwrote it,
      which was fine while the assessor could not change it, and loses the ask
      the moment they can. Optional, so every existing record still loads, and
      additive in `SignOffOut`. A record from before the field existed still
      holds its request in `level`, so `service.sign_off` reads the ask from
      there and writes it into `requested_level` when it signs.
- [x] **Leave `requested_level` out of the fingerprint.** It is in
      `NON_CONTRIBUTING` in `hashing.py`, with the reason: the fingerprint
      covers what the assessor attested, which is `level.id`, and the ask is
      context. Adding a path to `CONTRIBUTING` would also have changed the
      canonical payload of every record already signed, so none would verify.
- [x] **Tests**: a request stores the requested level; the fingerprint is the
      same with and without it.

## Phase 4: The assessor confirms or changes the level

- [x] **Offer the level as a choice on `SignOffForm.tsx`**, with the requested
      level already selected, described as "Asked for: …", and the full scale
      available, higher or lower. It had shown the level read-only and sent the
      request back unchanged. The API already accepted any level in `level_id`
      and `service.sign_off` already applied it, so only the form enforced the
      old rule.
- [x] **Require a comment when the level differs from the one asked for**, in
      the form and in `service.sign_off`, which raises
      `LevelReasonMissingError` so the API refuses it too. The caveats field
      becomes a required "Why a different level?" while the level differs.
      Keeping the requested level needs nothing extra.
- [x] **Work out `kind` from the level the assessor signs**, in
      `service.sign_off`, by calling `_kind_for` again with the signed level. It
      had been decided once, at request time, from the requested level, so a
      holder who asked for "unsupervised" and was signed at "direct
      supervision" would have been recorded as a progression they never made.
      The record being signed is still `requested`, so it does not count
      towards its own kind. A `correction` keeps its kind, since that is a
      deliberate claim and never derived.
- [x] **Tests**: signing without naming a level signs the one asked for; a lower
      level is signed with the ask kept; a changed level with no comment, or a
      blank one, is refused by the service, the API and the form, and nothing
      is written; `kind` follows the signed level in each direction, including
      a progression asked for and signed as a reassessment.

## Phase 5: The holder sees both levels

- [x] **Show the asked-for level beside the signed one.** The passport index,
      which is what the holder's competency list reads, carries
      `requested_level` and `level_change_reason` on each entry, the second
      only where the signed level differs. `CompetencyRow` then shows "You
      asked for: …" and the assessor's reason under the level, and
      `SignOffCard` shows "Asked for: …". They should never find out that they
      were given something other than what they asked for without being told
      why.
- [x] **Tests**: the index carries the ask and the reason when the level
      changed, and no reason when it did not; the row and the card show both
      only when they differ. Stories for each.

## Phase 6: Hear about it next time

The holder on the live site was failed twice and nobody knew until they said
so. Every email had been failing since 21 September, when the Resend key was
stored with a trailing newline, and nothing had fired: the 5xx alert waits for
more than five in five minutes, and a refused request is a 400, not a 5xx.

- [x] **Alert on any error the backend logs.** `backend_errors` in
      `infra/modules/monitoring/main.tf` is a log-based policy matching every
      entry at error or above from the Cloud Run services, except browser
      reports, which the browser-error policy counts against its own threshold.
      It names the logged message in the alert's subject, through a label
      extractor, and is rate limited to one notification in five minutes. Slack
      and email only, like the browser-error policy. In the week before it
      there were 44 such entries, including 500s on `/api/passport` and on the
      teaching admin, and none reached anybody. Terraform applies it on merge.
- [x] **Log a refusal the form should prevent at error, not warning**, as phase
      1 does, so that a disagreement between the form and the server alerts
      rather than waiting for somebody to complain.
- [x] **Keep the Resend key out of the logs.** `send_email` now strips
      whitespace from the key, so a stored newline cannot stop mail again, and
      re-raises a failed send as `EmailSendError` with the key redacted and the
      original exception detached. The `requests` error for the bad header had
      quoted the key, and `logger.exception` wrote it to the logs.
- [x] **Let the passport tests run on a development machine.**
      `compose.unit-tests.yml` sets `EMAIL_ALLOWED_RECIPIENTS` empty, because
      a development `backend/.env` limiting who may be emailed made every
      passport request test fail with a 400 locally, though CI passed.

## Decisions

- **Reverses "the level is read-only on the form"** from the clinician
  passport plan, decided by the product owner on 27 September 2026. That plan
  chose friction over ambiguity: an assessor who disagreed had to decline, and
  the holder asked again at a lower level. It named this as the direction that
  could safely be relaxed later, provided the substitution was made obvious to
  both people. Phases 3 to 5 are what make it obvious: a reason is required,
  both levels are kept, and the holder sees the difference.
- **An assessor may sign off below a level already held.** Skills fade, and a
  lower sign-off can be a fair judgement. The record shows it, and `kind`
  records it as a reassessment rather than hiding it.
- **The holder asks, rather than the assessor alone choosing.** Leaving the
  level to the assessor would be less typing, but it loses the trainee's view
  of their own readiness, and the invitation could not say what was being
  asked.
- **No email to the holder when the level differs, yet.** The passport sends
  holders no email about sign-offs at all today, so this plan shows the
  difference in the passport instead. A signed-off email, naming both levels,
  belongs with the first plan that notifies holders.
