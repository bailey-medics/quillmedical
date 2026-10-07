# Marketing email

Quill sends two kinds of email, and only one of them is a choice.

- **Service messages** – password resets, invitations, email
  verification, certificates and course reminders. Quill sends these
  itself, through `backend/app/email_send.py`, and they are always sent:
  an account does not work without them.

- **Marketing** – news about Quill Medical, new courses and product
  updates. These are newsletters, sent by Quill itself with the command
  under "Sending a newsletter" below, to the people whose answer in
  Quill's own database says they want them. There is no list at a mail
  provider. Newsletters were sent by hand from Resend until the
  cut-over in the
  [Amazon SES email plan](../plans/2026-10-06-amazon-ses-email-plan.md).

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
  `unsubscribe_link`) and which wording was on screen. This is the
  evidence that somebody was offered the choice. Rows are never updated.
  Rows written before the cut-over may carry `resend`, from when Resend
  told Quill of an unsubscribe.

- **`newsletter_send`** – one row for each newsletter sent to each
  person, so a send can be run again without reaching anybody twice.

That is the whole of it. Quill's database is the list, and nothing is
copied to the mail provider beyond the emails themselves.

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

See the [marketing opt-out plan](../plans/2026-10-03-marketing-opt-out-plan.md)
for how this came to be, including the legal basis for an opt-out.
