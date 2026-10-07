# Marketing email

Quill sends two kinds of email, and only one of them is a choice.

- **Service messages** – password resets, invitations, email
  verification, certificates and course reminders. Quill sends these
  itself, through `backend/app/email_send.py`, and they are always sent:
  an account does not work without them.

- **Marketing** – news about Quill Medical, new courses and product
  updates. These are newsletters. Quill can now send them itself, with
  the command under "Sending a newsletter" below, and its own database
  is the list of who gets one. Until the cut-over in the
  [Amazon SES email plan](../plans/2026-10-06-amazon-ses-email-plan.md)
  they are still sent by hand from Resend, as broadcasts to the
  "Newsletter" topic, and Quill keeps each person's entry on Resend's
  list matching what they chose.

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

- **Somebody whose account an admin created** – asked when they set
  their first password. The invite's link carries `invite=1`, and
  `/reset-password` then shows the same sentence and box. Until then they
  are not subscribed, because they have not been shown it. A
  forgotten-password link asks nothing.

- **Anybody, later** – the "News and updates by email" switch in
  Settings, or the unsubscribe link in any newsletter.

**Closing an account changes none of this.** Deactivating somebody does
not take them off the list: it is usually an admin who does it, and it
says nothing about what the person wants to hear. They keep the
unsubscribe link in every newsletter. Taking a contact off the list
altogether is for a request to erase somebody's data.

## Where it is held

- **`users.marketing_emails`** – the current answer.

- **`marketing_preference_change`** – one row for every answer given:
  what they chose, when, where (`registration`, `invite`, `settings` or
  `resend`)
  and which wording was on screen. This is the evidence that somebody
  was offered the choice. Rows are never updated.

- **Resend** – the list itself. A contact is in the "Quill Medical"
  segment and opted in to or out of the "Newsletter" topic. Somebody who
  refused is still held there, opted out, so a later import of addresses
  cannot subscribe them by accident.

Resend holds two switches for a contact, and Quill sets both to match.
The topic is what a newsletter is sent to. The contact's own
"subscribed" status is what Resend's Audience page shows, and what it
checks when a broadcast names the segment and no topic. With only the
topic set, somebody who had refused read as "Subscribed" on that page
and would have been emailed by a broadcast sent without the topic.
**Send every newsletter to the "Newsletter" topic all the same**: the
second switch is a safety net, not the plan.

Every change in Quill goes through `set_marketing_preference` in
`backend/app/marketing/preferences.py`. If the sentence on the
registration form changes, bump `MARKETING_WORDING_VERSION` beside it.

## Sending a newsletter

A newsletter is a **campaign**: a template under
`backend/app/email/templates/campaigns/` that extends
`newsletter.html.j2`, named by its file name less the ending. It fills
`subject`, `preheader`, `content` and `text`, using the same macros as
every other email, so it carries the Quill layout. `trial.html.j2` is
one, for checking that sending works. A campaign is written, reviewed
and merged like any other change: the pull request is where its words
are read before anybody receives them, and the deploy is what makes it
available to send.

`backend/app/marketing/newsletter.py` sends it, a person at a time.

- **Who it reaches** – verified, active users whose `marketing_emails`
  is true. The list is read when the send starts and read again for
  each person just before their turn, so somebody who unsubscribes while
  it runs is not emailed. **Nothing else stops an email to somebody who
  refused**: there is no list at the mail provider to refuse it for
  Quill.

- **Each person's own link** – every email carries an unsubscribe link
  signed for that one person. The footer's link opens `/unsubscribe` in
  the app, which needs no login. The `List-Unsubscribe` and
  `List-Unsubscribe-Post` headers let a mailbox show its own unsubscribe
  button and press it with a `POST`, which mailbox providers require of
  bulk mail (RFC 8058). Both go to `/api/marketing/unsubscribe`, and a
  change is recorded with the source `unsubscribe_link`.

- **A dry run first** – without a confirmation the command only lists
  who would be sent it, addresses mostly hidden, and prints the value to
  pass back, such as `trial:12`. The value names the count, so a dry run
  that is out of date cannot send.

- **Safe to run again** – each send writes a `newsletter_send` row as
  the email leaves. A run that stops half way keeps what it did, and
  the next reaches only the people it missed.

- **A trial to one address** – the last argument sends to one person
  who may be sent newsletters, and records nothing, so the real send
  still reaches them.

```bash
just newsletter-send app trial                      # who would get it
just newsletter-send app trial "" you@example.org   # the same, for one address
just newsletter-send app trial trial:1 you@example.org   # send that trial
just newsletter-send app autumn-update autumn-update:12  # send for real
```

It runs as the `send-newsletter` action of the admin job, which has the
Amazon SES key for the purpose.

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

- **Once a week, Quill is checked against Resend.** A webhook call can be
  lost, and then Quill would show somebody as subscribed for ever after
  Resend had stopped emailing them. The `Marketing reconcile` workflow
  runs the admin job's `marketing-reconcile` action every Tuesday at 05:00
  UTC. It first sends Resend any choice Quill has not yet managed to send,
  then changes Quill to match Resend wherever the two disagree. **Resend
  wins**, in both directions, and each correction is recorded with
  `resend` as its source. A failed run posts to Slack; a clean one says
  nothing. It can be run by hand from the Actions tab.

Nobody is emailed wrongly while Quill is stale: Resend sends the
newsletter and honours its own record. The weekly check corrects what
the Settings switch shows.

**Development has a segment and a topic of its own, and that is only
part of a separation.** The dev stack's `backend/.env` names a "Quill
Medical (dev)" segment and a "Newsletter (dev)" topic, so a newsletter
sent to the real topic never reaches a contact made while testing, and
the weekly check on the dev stack reads only the dev segment.

What it does not separate is the contact. Resend holds one list of
contacts for the whole account, one entry per address, and a segment is a
label on an entry, not a list of its own. An address used on both the dev
stack and the live app is one contact, with one "unsubscribed" switch
between them, so opting out on the dev stack unsubscribes the real
person. **Test with addresses nobody real uses**, which is the rule
chosen over a second Resend account, the only way to two truly separate
lists. A plus-address (`name+test1@...`) is a different contact from the
plain one; add it to `EMAIL_ALLOWED_RECIPIENTS` so the dev stack will
email it.

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
