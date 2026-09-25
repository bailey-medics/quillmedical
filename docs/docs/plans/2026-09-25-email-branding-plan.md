# Email branding plan

Quill's emails are plain. Each one is hand-assembled HTML: the five in
`backend/app/main.py` (email verification three times, password reset,
invitation), the passport assessor invite in
`backend/app/features/passport/email_templates.py`, and the teaching
certificate emails rendered from each question bank's Markdown in
`backend/app/features/teaching/email_templates.py`. They share no layout,
escape their own values one call at a time, and carry nothing of the brand
that Storybook's `Colours` and `Typography` foundations define. An email is
often the first thing somebody sees of Quill — a consultant at another trust
receiving a passport invite has never heard of it — and it should look like it
came from the same product.

The outcome is one base email layout, fed by the same brand tokens as
`theme.ts`, used for every transactional email and exported for mailing lists.
It takes a theme, so the same layout also carries Let's Do Digital's lighter
look. That matters because Let's Do Digital has a list of 800+ people who
should, over several months, come to know the work as Quill Medical, and a
shared layout lets the brand shift by degrees rather than by a redesign on the
day.

## Phase 1: Shared brand tokens

- [ ] **Move the brand values into `shared/brand.yaml`.** Today they live
      only in `frontend/src/theme.ts` — `brandColours` (navy `#001a36`, amber
      `#C8963E`, white), the `primaryScale` ramp, the font stack and the type
      scale. The backend cannot read TypeScript, so an email template built
      from copies of those hex values would drift the first time the theme
      changed. The YAML holds a `themes` map with `quill` and `ldd` entries,
      each naming the colours an email needs — header background, header
      text, body background, body text, link, button fill and button text,
      muted text, divider — plus the logo asset for that theme.

- [ ] **Generate the frontend's copy with `yarn generate:types`** into
      `src/generated/`, as the competency and profession YAML already are,
      and have `theme.ts` import `brandColours` and `primaryScale` from it.
      The `Colours` story then shows what emails use, because it is the same
      data. Run `just uf src/theme.test.ts` and the full frontend suite: this
      touches `theme.ts`, which every component depends on.

- [ ] **Load it in the backend** with a Pydantic model in
      `backend/app/email/brand.py`, `extra='forbid'`, read once at import and
      validated, so a missing colour for a theme fails at startup, not in
      somebody's inbox.

## Phase 2: Base layout and renderer

- [ ] **Add Jinja2 as a backend dependency** and create
      `backend/app/email/templates/base.html.j2` with a `jinja2.Environment`
      in `backend/app/email/render.py`, autoescaping on for `.html.j2`.
      Autoescaping replaces the hand-written `html.escape` calls scattered
      through each template, so a new email cannot forget one. This is a
      dependency change, so rebuild the test image with `just utr`.

- [ ] **Build the layout for email clients, not browsers.** A single
      600px-wide table with `role="presentation"`, inline styles (Gmail
      strips `<style>` in some views and no client understands CSS
      variables), `lang="en-GB"`, and a hidden preheader line for the inbox
      preview. Regions: a header band with the theme's logo, a content
      slot, an optional call-to-action button built as a bulletproof table
      button so Outlook renders it, and a footer saying who sent it and why
      the recipient is receiving it. Font stack `'Atkinson Hyperlegible
      Next', Arial, sans-serif`: Apple Mail will use the web font, Gmail and
      Outlook will fall back, and the layout must read well either way.

- [ ] **Choose a light body under a navy header for the `quill` theme**,
      not the app's all-navy surface. Mail clients apply their own dark mode
      — Outlook and Gmail invert colours they judge to be light, Apple Mail
      honours `prefers-color-scheme` — and a fully navy email inverted by a
      client comes out unreadable. Declare `color-scheme: light dark` and
      `supported-color-schemes` meta tags and add a small
      `prefers-color-scheme: dark` block for the clients that honour it.
      Test in Litmus or Email on Acid's free tier, or failing that by
      sending to Gmail, Outlook.com and Apple Mail by hand.

- [ ] **Host the logos on the public site, not the app.** Email clients
      block SVG and relative paths, so each theme's logo is an absolute URL
      to a PNG at 2x resolution on the GCS public site
      (`quill-medical.com/email/…`), which stays up when the app is being
      deployed. Start from `frontend/public/quill-logo-white.png` and
      `quill-name-long-white-amber.png`. Every image has `alt` text, because
      many clients block images until asked.

- [ ] **Send a plain-text part alongside the HTML.** Extend `send_email`
      in `backend/app/email_send.py` with an optional `text_body`, passed to
      Resend as `text`, and have the renderer produce it from the same
      template context. A plain-text part improves deliverability and is
      what screen readers in some clients fall back to.

- [ ] **Expose one function, `render_email(template, theme, context)`**,
      returning subject, HTML and text. Tests in
      `backend/tests/test_email_render.py` cover escaping of hostile names,
      each theme rendering with its own colours, a missing context value
      failing loudly (`jinja2.StrictUndefined`), and the preheader and
      footer being present.

## Phase 3: Move the transactional emails onto it

- [ ] **Convert the `main.py` emails first** — verification, password
      reset and invitation — into child templates of `base.html.j2`, one
      per message. They are the most-sent and the simplest, so they prove
      the layout before anything unusual is put in it. Keep the wording as
      it is; this is a presentation change, and reviewing new copy at the
      same time would hide what changed.

- [ ] **Convert the passport assessor invite.** Its module docstring
      already says what it must do — name who is asking, what they are asked
      to do and how long the link lasts, and never mention a patient — and
      that stays true. Only the markup moves.

- [ ] **Wrap the teaching certificate emails without taking away the
      coordinators' control.** A bank's `config.yaml` supplies subject and
      Markdown body, converted and sanitised with `nh3`. Keep that, and
      place the sanitised HTML in the base layout's content slot, so a
      coordinator writes the words and Quill supplies the frame.

## Phase 4: Previews in Storybook

- [ ] **Add a `just email-preview` recipe** that renders every template
      with fixture data, in both themes, to
      `frontend/src/stories/emails/rendered/*.html` inside the backend unit
      test container. The renders are committed.

- [ ] **Add a backend test that fails when a committed render is stale**,
      comparing a fresh render of each fixture against the file. This is
      the same shape as the API compatibility check: CI's Storybook build
      runs without Python, so it cannot render the templates itself, and
      the test is what stops the previews silently lagging behind the
      templates.

- [ ] **Add `Emails.stories.tsx`** under `src/stories/`, beside `Colours`
      and `Typography`, importing each render with Vite's `?raw` and showing
      it in a sandboxed `iframe` at 600px, with a theme toggle. This is how
      the emails join the Storybook catalogue without the backend depending
      on Node.

## Phase 5: Sending domains

- [ ] **Split transactional and marketing mail onto separate
      subdomains** in Resend — for example `mail.quill-medical.com` for
      transactional and `news.quill-medical.com` for lists. Reputation is
      tracked per sending domain, so a campaign that draws complaints must
      not be able to push password resets into spam. Set SPF, DKIM and a
      DMARC policy for each, in Terraform where the DNS lives, and update
      `EMAIL_FROM` in `backend/app/config.py` and the deployed environments.

- [ ] **Add the Let's Do Digital domain to Resend as a third sender**, with
      its own SPF and DKIM, so early campaigns can go out under the name
      subscribers signed up to.

## Phase 6: Mailing lists

- [ ] **Run lists in Resend Audiences and Broadcasts, not in Quill.**
      Bulk mail carries obligations transactional mail does not: consent
      records under UK GDPR and PECR, one-click unsubscribe via
      `List-Unsubscribe` and `List-Unsubscribe-Post` headers (required by
      Gmail and Yahoo for bulk senders since 2024), bounce and complaint
      suppression. Resend does all of these and Quill already pays for it.
      Building them into the app would add a system holding personal data
      for no clinical purpose.

- [ ] **Export the base layout as a broadcast template.** Add a
      `just email-export <theme>` recipe that renders `base.html.j2` with
      the content slot replaced by Resend's broadcast placeholders and the
      footer carrying `{{{RESEND_UNSUBSCRIBE_URL}}}`, for pasting into
      Resend. One layout, so a newsletter and a password reset are visibly
      from the same sender.

- [ ] **Point the public site's signup form at a Resend audience.** The
      2026-03-21 subscriptions plan designed a Cloud Function writing to
      Firestore but was never built. Revise it to add contacts to the
      Quill Medical audience through Resend's API instead, with double
      opt-in, so consent is recorded where the mail is sent from and there
      is no second list to reconcile.

## Phase 7: Bringing the Let's Do Digital list across

- [ ] **Import the 800+ contacts into a Let's Do Digital audience**, with
      whatever consent record the current provider holds (date, source,
      wording). Drop anyone already unsubscribed or bounced there; carrying
      them across would breach their choice and damage the new domain's
      reputation on the first send.

- [ ] **Warm the new sending domain gradually.** Send the first campaigns
      in batches — a hundred or so, then larger — to the most engaged
      subscribers first. A new domain sending 800 emails on its first day
      looks like spam to mailbox providers.

- [ ] **Stage one, Let's Do Digital introducing Quill.** Campaigns in the
      `ldd` theme, from the Let's Do Digital sender, that mention Quill
      Medical as the work Bailey Medics is building. Social posts run
      alongside.

- [ ] **Stage two, co-branded.** A `transition` treatment of the layout —
      Let's Do Digital's light body with the Quill logo beside its own —
      saying plainly that Let's Do Digital is becoming Quill Medical, with a
      visible unsubscribe.

- [ ] **Stage three, re-consent.** One email asking subscribers to confirm
      they want to hear from Quill Medical. Those who confirm move to the
      Quill Medical audience; those who do not are not mailed as Quill
      Medical. Consent under PECR is given to a sender the person
      recognises, and a smaller list that chose Quill is worth more than
      a larger one that did not.

- [ ] **Stage four, Quill Medical only.** Campaigns in the `quill` theme
      from the marketing subdomain. Retire the Let's Do Digital audience
      once a final notice has gone to anyone who did not re-consent.

## Decisions

- **Jinja2 in the backend over React Email or MJML** — the backend sends
  every email, and both alternatives need a Node build step feeding
  compiled templates into Python. Storybook still shows the result, through
  committed renders, which keeps the dependency pointing one way.

- **A third-party list service over a home-built one** — consent,
  unsubscribe and suppression are legal and deliverability obligations, not
  features, and getting them slightly wrong has consequences a clinical
  product does not want attached to its name.

- **Re-consent before rebranding the list** — the conservative reading of
  PECR. Whether it is strictly required depends on whether Let's Do Digital
  and Quill Medical are trading names of the same legal entity; even if they
  are, a list that opted in to the new name will complain less.

- **Resend send failures stay out of scope** — `send_email` has no
  exception handling around the provider call. That is already a to-do list
  item and is independent of how the email looks.

## Open questions

- **Where does the Let's Do Digital list live today**, and what consent
  wording did people sign up under?

- **Are Let's Do Digital and Quill Medical the same legal entity**, both
  trading names of Bailey Medics? This decides how much of Phase 7 is legal
  necessity and how much is good practice.

- **What are Let's Do Digital's brand assets** — logo, colours, fonts — for
  the `ldd` theme in `shared/brand.yaml`?
