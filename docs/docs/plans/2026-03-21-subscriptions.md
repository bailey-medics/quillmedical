# Public site email subscriptions

_Revised 26 September 2026. The first version, never built, stored signups in
Firestore behind a Cloud Function, with no double opt-in and a later export to
a mailing service. Phase 7 of the
[email branding plan](2026-09-25-email-branding-plan.md) settled that mailing
lists run in Resend, which Quill already uses for its own email, so the list
now lives there and this plan is rewritten to match. The original is in git
history._

A visitor to quill-medical.com can ask to hear from Quill Medical, confirm by
clicking a link in an email, and so join the newsletter list in Resend with a
record of when and how they agreed. Nothing about them is stored in Quill.

Double opt-in is not optional here. The Let's Do Digital list showed what a
list without recorded consent costs: most of it cannot be emailed at all
(Phase 8 of the email branding plan). Every contact this form adds arrives
with the evidence PECR asks for, and an address typed by somebody else never
joins, because its owner never clicks the link.

## Phase 1: Resend (Mark, in the Resend dashboard)

- [ ] **Create the list as Resend has it now.** Resend has replaced
      Audiences with contacts, grouped into segments, and topics a contact
      opts in or out of (`POST /contacts` takes `segments` and `topics`).
      Create a "Quill Medical" segment and a "Newsletter" topic, and note
      both ids. The email branding plan's Phases 7 and 8 say "audience"
      throughout; read it as "segment".

- [ ] **Make an API key that can add contacts,** stored in GCP Secret
      Manager as `resend-contacts-api-key` and read by Terraform, not kept in
      GitHub. The sending key the backend holds today may be send-only.

## Phase 2: Backend

- [ ] **Settings.** `RESEND_CONTACTS_API_KEY` (`SecretStr`),
      `RESEND_NEWSLETTER_SEGMENT_ID` and `RESEND_NEWSLETTER_TOPIC_ID` in
      `backend/app/config.py`. With any of them unset, the subscribe route
      answers 503 rather than pretending to work.

- [ ] **`POST /api/newsletter/subscribe`**, public, in a new
      `backend/app/newsletter/router.py`. Takes an email address, the page
      it came from, and a honeypot field. Rate limited per address and per
      IP with the existing limiter. Sends a confirmation email and always
      answers the same "check your inbox" whether the address is new, already
      subscribed or refused, so the form cannot be used to find out who is on
      the list. A filled honeypot gets the same answer and no email.

- [ ] **The confirmation email**, a new
      `backend/app/email/templates/newsletter_confirm.html.j2` in the
      `quill` theme: one sentence on what they asked for, a button, how long
      the link lasts, and "if this was not you, ignore it and nothing
      happens". Add it to the Storybook previews. The link carries an
      `itsdangerous` token signed over the address, the source page and the
      time, valid for seven days.

- [ ] **`POST /api/newsletter/confirm`**, public, taking the token. Creates
      or updates the contact in Resend: in the segment, opted in to the
      topic, with properties `consent_source` (the page),
      `consent_wording_version` and `consent_confirmed_at`. Idempotent, so a
      second click does nothing new. Confirmation is a POST from a page, not
      the GET a link makes, because mail scanners open links on their own
      and would confirm addresses nobody meant to.

- [ ] **Tests** with Resend stubbed: the same answer for every case, the
      honeypot, the rate limit, a forged or expired token refused, confirm
      sending the right segment, topic and properties, and a second confirm
      changing nothing.

## Phase 3: Public site

- [ ] **Design the `EmailSignup` component first, for Mark's review,** as
      `CLAUDE.md` requires of a new component: an email field, one sentence
      of consent wording ("We'll email you news about Quill Medical, about
      once a month. Unsubscribe any time."), the hidden honeypot and a
      `PublicButton`. Stories and tests alongside, in
      `frontend/src/components/`.

- [ ] **Place it** on the homepage and the contact page, and add a
      `/newsletter/confirm` page that reads the token and POSTs it.

- [ ] **Allow the public site's origin** in the backend's CORS settings for
      the two routes, and nothing else.

## Decisions

- **Resend holds the list, Quill holds nothing** — a contact list is
  personal data with no clinical purpose, and Resend already manages
  consent, unsubscribes and suppression.

- **The FastAPI backend, not a Cloud Function** — the first version chose a
  function so the form would work while the app was down. The confirmation
  email needs the branded renderer and the rate limiter, both in the
  backend, and a signup form briefly unavailable during a deploy costs
  little.

- **Double opt-in built in Quill** — Resend's contacts API has none, so
  Quill sends the confirmation and only then creates the contact.
