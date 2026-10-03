# Marketing email

Quill sends two kinds of email, and only one of them is a choice.

- **Service messages** – password resets, invitations, email
  verification, certificates and course reminders. Quill sends these
  itself, through `backend/app/email_send.py`, and they are always sent:
  an account does not work without them.

- **Marketing** – news about Quill Medical, new courses and product
  updates. These are newsletters, sent by hand from Resend as broadcasts
  to the "Newsletter" topic. Quill never sends one. Its only job is to
  keep each person's entry on Resend's list matching what they chose.

**A service message must never carry marketing.** The choice below is
the only thing standing between a person and the newsletter, and a
"by the way, our new course..." paragraph in a certificate email goes
round it.

## The choice

Registration is an opt-out. The registration form says that news will be
sent and offers an unticked box, "I would rather not get news and
updates". Left alone, the person is sent news. The words are in
`frontend/src/lib/marketing/wording.ts`.

- **Somebody who registers** – subscribed unless they tick the box.

- **An account an admin creates** – not subscribed. They were never shown
  the sentence. They can switch news on in Settings.

- **Anybody, later** – the "News and updates by email" switch in
  Settings, or the unsubscribe link in any newsletter.

## Where it is held

- **`users.marketing_emails`** – the current answer.

- **`marketing_preference_change`** – one row for every answer given:
  what they chose, when, where (`registration`, `settings` or `resend`)
  and which wording was on screen. This is the evidence that somebody
  was offered the choice. Rows are never updated.

- **Resend** – the list itself. A contact is in the "Quill Medical"
  segment and opted in to or out of the "Newsletter" topic. Somebody who
  refused is still held there, opted out, so a later import of addresses
  cannot subscribe them by accident.

Every change in Quill goes through `set_marketing_preference` in
`backend/app/marketing/preferences.py`. If the sentence on the
registration form changes, bump `MARKETING_WORDING_VERSION` beside it.

## Keeping Resend in step

- **Quill to Resend** – when an address is verified, and when the
  Settings switch changes. Never at registration: an address that was
  mistyped, or typed for somebody else, is never verified and so never
  joins the list. Only the address and the name are sent.

- **Resend to Quill** – a webhook, `POST /api/marketing/resend-webhook`,
  called when a contact changes. It is public, and authenticated by
  Resend's signature over the request body.

- **An opt-out has to reach Resend.** Resend sends the newsletter, so an
  opt-out held only in Quill would stop nothing. Switching off in
  Settings fails, and is undone, if Resend cannot be told.

- **When Resend was down** – `users.marketing_synced_at` is left empty.
  `just marketing-sync` goes back over those people on the dev stack; in
  production it is the admin job's `marketing-sync` action.

## Settings

All optional. With any of the first three unset, nothing is sent to
Resend and people still register.

- **`RESEND_CONTACTS_API_KEY`** – a Resend key allowed to manage
  contacts. Separate from `RESEND_API_KEY`, which sends email.

- **`RESEND_NEWSLETTER_SEGMENT_ID`** – the "Quill Medical" segment.

- **`RESEND_NEWSLETTER_TOPIC_ID`** – the "Newsletter" topic.

- **`RESEND_WEBHOOK_SECRET`** – the webhook's signing secret. Without it
  the webhook answers 503.

See the [marketing opt-out plan](../plans/2026-10-03-marketing-opt-out-plan.md)
for how this came to be, including the legal basis for an opt-out.
