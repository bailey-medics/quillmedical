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
shared layout makes the switch a change of theme rather than a redesign. The
look comes first: Phase 1 builds the template as static HTML and puts it in
front of a human before any code that renders or sends it is written.

## Phase 1: Design the template, with no plumbing

- [x] **Hand-write the base layout as static HTML mock-ups** in
      `frontend/src/stories/emails/mockups/`: one `base.html` with
      `{{placeholder}}` slots, `themes.ts` holding each theme's values, and
      `content.ts` holding the example emails, filled in by
      `renderMockup.ts`. That is the shape the Jinja2 renderer takes in
      Phase 3, a base template, theme values and per-email blocks, so the
      approved mock-up moves across without being rebuilt. Two themes,
      `quill` and `ldd`. There is no co-branded theme: each email is one brand or the
      other, and the move between them is told in words, not in a blended
      design. Brand values are copied by hand from
      `theme.ts` for now (navy `#001a36`, amber `#C8963E`, white, Atkinson
      Hyperlegible); Phase 2 replaces the copies with shared tokens once the
      design is settled. No backend, no Jinja2, no Resend.

- [x] **Take the `ldd` theme from letsdodigital.org**, so the email looks
      like the site and the social account people already know. The site
      is a Quarto build on Bootstrap, and its values are:

      - **Body** — white `#ffffff`, text `#343a40`, headings at weight 400.
      - **Header band** — the navbar's light grey `#f8f9fa`, with a
        `#dee2e6` rule beneath it.
      - **Logo** — the dual face (one half a grey wire-mesh digital head,
        one half a blue human silhouette), a 714px transparent PNG at
        `letsdodigital.org/media/ldd-logo.png`. Large enough for a 2x
        header image, so no other copy is needed.
      - **Accent** — the logo's own blue `#0848a9` for buttons and links.
        Not the site's Bootstrap primary `#2780e3`: white on that is
        3.97:1, under the 4.5:1 that WCAG AA needs for body-size text,
        where the logo blue gives 8.37:1. The site's link colour `#2761e3`
        (5.38:1) is an acceptable second choice if the darker blue reads
        as too heavy.
      - **Font** — `'Source Sans Pro', Arial, sans-serif`, from Google
        Fonts as the site loads it. As with Quill's font, Apple Mail will
        use it and Gmail and Outlook will fall back to Arial.

- [x] **Build it for email clients, not browsers, from the start.** A
      mock-up that only works in a browser proves nothing, so it follows the
      rules the real template must: a single table, fluid up to 900px wide
      (a fixed 600px for classic Outlook on Windows, which ignores
      `max-width`), with
      `role="presentation"`, inline styles (Gmail strips `<style>` in some
      views and no client understands CSS variables), `lang="en-GB"`, and a
      hidden preheader line for the inbox preview. Regions: a header band
      with the theme's logo, a content slot, an optional call-to-action
      button built as a bulletproof table button so Outlook renders it, and
      a footer saying who sent it and why the recipient is receiving it.
      Font stack `'Atkinson Hyperlegible Next', Arial, sans-serif`: Apple
      Mail will use the web font, Gmail and Outlook will fall back, and the
      layout must read well either way. Every image has `alt` text, because
      many clients block images until asked.

- [x] **Choose a light body under a navy header for the `quill` theme**,
      not the app's all-navy surface. Mail clients apply their own dark mode
      (Outlook and Gmail invert colours they judge to be light, Apple Mail
      honours `prefers-color-scheme`), and a fully navy email inverted by a
      client comes out unreadable. Declare `color-scheme: light dark` and
      `supported-color-schemes` meta tags and add a small
      `prefers-color-scheme: dark` block for the clients that honour it.

- [x] **Fill each mock with real content, not lorem ipsum.** The password
      reset email (short, one button), the passport assessor invite (a cold
      message to somebody who has never heard of Quill) and a sample
      newsletter (long, several sections, images). Those three stretch the
      layout in different directions, so a design that suits all three will
      suit the rest. The newsletter signs off from Mark with his personal
      avatar, the anime digital-health doctor used on his own social
      accounts: a newsletter from a recognisable person is opened more
      than one from a brand, and that face is the one constant through
      every stage of the rebrand. Transactional emails do not carry it;
      a password reset comes from Quill, not from a person.

- [x] **Show the mock-ups in Storybook** with `Emails.stories.tsx` under
      `src/stories/`, beside `Colours` and `Typography`. Each mock is
      imported with Vite's `?raw` and shown in a sandboxed `iframe` at
      full width, with controls for theme, phone width and dark mode. Dark mode
      is forced by rewriting the email's `prefers-color-scheme` query, so
      the preview does not depend on the viewer's own setting. Logos are
      email-sized copies in `frontend/public/email/`, which Storybook
      already serves through `staticDirs`. The newsletter's sign-off shows
      a placeholder circle until Mark's avatar image is added there.

- [ ] **Send the mock-ups to real inboxes.** Storybook shows a browser's
      rendering; Gmail, Outlook and Apple Mail each do their own. Send each
      mock to a Gmail, an Outlook.com and an Apple Mail address, on desktop
      and phone, with dark mode on and off, using Litmus or Email on Acid's
      free tier or a one-off `curl` to Resend's API from the development
      key. The logo needs an absolute URL for this, so point it at a copy
      already served publicly; permanent hosting is Phase 3.
      The width needs checking most: the template is 900px, wider than the
      600px most email is built to, so check it in Outlook on the desktop
      and in Gmail's reading pane beside the inbox list, where a narrower
      window will push it into its phone layout or a sideways scroll.

- [ ] **Get the design signed off before Phase 2.** Iterate on the
      mock-ups until the look is agreed, and record here which theme
      variants were approved. Everything after this phase turns the
      approved mock into working code, so it should not need to reopen
      the design.

## Phase 2: Shared brand tokens

- [ ] **Move the brand values into `shared/brand.yaml`.** Today they live
      only in `frontend/src/theme.ts`: `brandColours`, the `primaryScale`
      ramp, the font stack and the type scale. The backend cannot read
      TypeScript, so an email template built from copies of those hex
      values would drift the first time the theme changed. The YAML holds a
      `themes` map with `quill` and `ldd` entries, each naming
      the colours the approved mock-ups use (header background, header
      text, body background, body text, link, button fill and button text,
      muted text, divider) plus the logo asset for that theme.

- [ ] **Generate the frontend's copy with `yarn generate:types`** into
      `src/generated/`, as the competency and profession YAML already are,
      and have `theme.ts` import `brandColours` and `primaryScale` from it.
      The `Colours` story then shows what emails use, because it is the same
      data. Run `just uf src/theme.test.ts` and the full frontend suite:
      this touches `theme.ts`, which every component depends on.

- [ ] **Load it in the backend** with a Pydantic model in
      `backend/app/email/brand.py`, `extra='forbid'`, read once at import and
      validated, so a missing colour for a theme fails at startup, not in
      somebody's inbox.

## Phase 3: Renderer

- [ ] **Add Jinja2 as a backend dependency** and create
      `backend/app/email/templates/base.html.j2` with a `jinja2.Environment`
      in `backend/app/email/render.py`, autoescaping on for `.html.j2`.
      Autoescaping replaces the hand-written `html.escape` calls scattered
      through each template, so a new email cannot forget one. This is a
      dependency change, so rebuild the test image with `just utr`.

- [ ] **Turn the approved mock-up into `base.html.j2`.** The markup moves
      across as it is; only the hard-coded colours become lookups into
      `shared/brand.yaml` and the example content becomes blocks. The
      mock-up is the reference: if the rendered template looks different
      from it, the template is wrong.

- [ ] **Host the logos on the public site, not the app.** Email clients
      block SVG and relative paths, so each theme's logo is an absolute URL
      to a PNG at 2x resolution on the GCS public site
      (`quill-medical.com/email/…`), which stays up when the app is being
      deployed. Start from `frontend/public/quill-logo-white.png` and
      `quill-name-long-white-amber.png`.

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

## Phase 4: Swap the Storybook mock-ups for real renders

- [ ] **Add a `just email-preview` recipe** that renders every template
      with fixture data, in every theme, to
      `frontend/src/stories/emails/rendered/*.html` inside the backend unit
      test container. The renders are committed.

- [ ] **Point `Emails.stories.tsx` at the renders and delete the
      mock-ups.** From here Storybook shows what the backend actually
      produces. Keeping the mock-ups as well would leave two versions of
      the design to drift apart.

- [ ] **Add a backend test that fails when a committed render is stale**,
      comparing a fresh render of each fixture against the file. This is
      the same shape as the API compatibility check: CI's Storybook build
      runs without Python, so it cannot render the templates itself, and
      the test is what stops the previews silently lagging behind the
      templates.

## Phase 5: Move the transactional emails onto it

- [ ] **Convert the `main.py` emails first** (verification, password
      reset and invitation) into child templates of `base.html.j2`, one per
      message. They are the most-sent and the simplest, so they prove the
      layout before anything unusual is put in it. Keep the wording as it
      is; this is a presentation change, and reviewing new copy at the same
      time would hide what changed.

- [ ] **Convert the passport assessor invite.** Its module docstring
      already says what it must do (name who is asking, what they are asked
      to do and how long the link lasts, and never mention a patient) and
      that stays true. Only the markup moves.

- [ ] **Wrap the teaching certificate emails without taking away the
      coordinators' control.** A bank's `config.yaml` supplies subject and
      Markdown body, converted and sanitised with `nh3`. Keep that, and
      place the sanitised HTML in the base layout's content slot, so a
      coordinator writes the words and Quill supplies the frame.

## Phase 6: Sending domains

- [ ] **Split transactional and marketing mail onto separate
      subdomains** in Resend — for example `mail.quill-medical.com` for
      transactional and `news.quill-medical.com` for lists. Reputation is
      tracked per sending domain, so a campaign that draws complaints must
      not be able to push password resets into spam. Set SPF, DKIM and a
      DMARC policy for each, in Terraform where the DNS lives, and update
      `EMAIL_FROM` in `backend/app/config.py` and the deployed environments.

- [ ] **Add the Let's Do Digital domain to Resend as a sender**, so early
      campaigns can go out under the name subscribers signed up to. It is
      authenticated with MailerLite today, which sends the list now, so
      Resend's DKIM record is added beside MailerLite's rather than in place
      of it, and the SPF record includes both. MailerLite's records come out
      only once the last MailerLite send is done (Phase 8).

## Phase 7: Mailing lists

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

## Phase 8: Bringing the Let's Do Digital list across

- [ ] **Sort the list by what allows each address to be emailed, before
      anything else.** Nobody on the list signed up to it: every contact
      was added from conference and course registrations. So there is no
      newsletter consent to carry across, and each address needs another
      lawful basis under PECR, the UK law on marketing email. Tag every
      contact with one of three:

      - **Work address** — `nhs.net`, a trust, a university or a company
        domain. PECR's consent rule covers individual subscribers, not
        corporate ones, so these can be emailed, provided every email
        names the sender and carries a working unsubscribe. UK GDPR still
        applies: record a short legitimate interests assessment saying
        why clinicians who came to a Let's Do Digital event would expect
        to hear about Quill Medical.
      - **Soft opt-in** — a personal address (Gmail, Hotmail, iCloud and
        so on) given while booking a paid conference or course with
        Bailey Medics, where the booking form offered a chance to opt out
        of marketing. The soft opt-in covers similar products and services
        from the same company, so it holds for Let's Do Digital events and
        is arguable for Quill Medical. Check what the booking forms
        actually said before relying on it.
      - **No basis** — a personal address from a free event, a form with
        no opt-out, or a source nobody can now trace. **Do not email
        these at all, including to ask for consent.** The ICO treats an
        email asking permission to send marketing as marketing itself, and
        has fined companies for exactly that (Honda and Flybe, 2017).
        Invite this group through social posts and the public signup form
        instead, where they can opt in themselves.

- [ ] **Name Bailey Medics in the privacy notice for both brands.** Let's
      Do Digital and Quill Medical are both trading names of Bailey Medics,
      so the data controller does not change and the list is not being
      handed to anybody new. That only holds for subscribers if they can
      see it: the privacy notice linked from the Let's Do Digital signup
      forms and emails, and Quill Medical's, should each say "Bailey Medics,
      trading as Let's Do Digital and Quill Medical" before any email
      mentions the move.

- [ ] **Export the list from MailerLite.** The 800+ contacts live there
      today. Export active subscribers and, separately, the unsubscribed,
      bounced and complained groups, each with the fields MailerLite holds
      about consent: subscription date, signup source or form, and the
      double opt-in confirmation date where there is one. Keep the export
      files out of the repository and off shared drives; they are personal
      data, stored once, somewhere access-controlled.

- [ ] **Import into a Let's Do Digital audience in Resend.** Only the
      work address and soft opt-in contacts come in as subscribed, with
      their basis, original source and date as contact properties so the
      record of why each is on the list travels with them. The no basis
      group is not imported as subscribed.
      Unsubscribed, bounced and complained contacts come in as
      unsubscribed, not left out: leaving them out loses the record that
      they said no, and a later import from anywhere else could then mail
      them again. Check the audience's counts against MailerLite's before
      sending anything.

- [ ] **Warm the sending domains gradually.** Moving to Resend means
      sending from different servers than MailerLite used, and the Quill
      Medical subdomain has no history at all. The first campaigns from
      each, stage one for Let's Do Digital and stage four for Quill Medical,
      go out in batches, a hundred or so and then larger, to the
      subscribers who opened most recently in MailerLite first. A domain
      suddenly sending to the whole list from new servers looks like spam
      to mailbox providers.

- [ ] **Line the social accounts up with the email stages.** There are
      two: Mark's own (the anime digital-health doctor) and Let's Do
      Digital's (the dual face). Mark's account is the bridge, since it
      belongs to neither brand and so needs no rebrand: it introduces Quill
      Medical from stage one and carries the story throughout. The Let's
      Do Digital account follows the email stages, its bio and pinned post
      changing at each: stage one mentions Quill, stage two says Let's Do
      Digital is becoming Quill Medical, and from stage four it describes
      itself as Bailey Medics' account for Quill Medical. It keeps its
      handle and followers: Quill Medical has no accounts of its own, and
      opening them waits until it is big enough to need them. Each email
      and post goes out in the same week, so somebody who sees one sees
      the other saying the same thing.

- [ ] **Stage one, Let's Do Digital introducing Quill.** Campaigns in the
      `ldd` theme, from the Let's Do Digital sender, that mention Quill
      Medical as the work Bailey Medics is building. Social posts run
      alongside.

- [ ] **Stage two, announcing the change.** Still in the `ldd` theme and
      from the Let's Do Digital sender, saying plainly that Let's Do
      Digital is becoming Quill Medical, with a visible unsubscribe. The
      email stays wholly Let's Do Digital in look, so subscribers meet the
      Quill theme only once the move has been announced.

- [ ] **Stage three, notice of the move.** One email saying that from a
      named date the newsletter comes from Quill Medical, what it will be
      about, and that nothing else changes: same people, same company,
      same data. A single, prominent unsubscribe link sits beside that
      sentence, not only in the footer. Everybody still subscribed on the
      date moves to the Quill Medical audience. This goes only to contacts
      the first step of this phase cleared, and for them the same company
      under another name, clearly announced, is not a new sender.

- [ ] **Stage four, Quill Medical only.** Campaigns in the `quill` theme
      from the marketing subdomain. The first one repeats, in one line near
      the top, that this is Let's Do Digital's newsletter under its new
      name, for anyone who missed stage three. Retire the Let's Do Digital
      audience once everybody on it has moved or unsubscribed.

- [ ] **Close the MailerLite account** once the first Resend campaign has
      gone out cleanly: delete the list there, remove MailerLite's DKIM and
      SPF entries from the Let's Do Digital domain, and cancel any
      subscription. Two copies of the same personal data in two services is
      one more than needed.

## Decisions

- **Jinja2 in the backend over React Email or MJML** — the backend sends
  every email, and both alternatives need a Node build step feeding
  compiled templates into Python. Storybook still shows the result, through
  committed renders, which keeps the dependency pointing one way.

- **A third-party list service over a home-built one** — consent,
  unsubscribe and suppression are legal and deliverability obligations, not
  features, and getting them slightly wrong has consequences a clinical
  product does not want attached to its name.

- **Notice and opt-out for the cleared contacts, silence for the rest** —
  both brands are trading names of Bailey Medics, so for a work address or
  a valid soft opt-in the controller and the relationship are unchanged,
  and a rename told clearly in advance is not a new sender. Asking
  everybody to opt in again is not the safe alternative it looks like:
  nobody on the list ever gave newsletter consent, and a request for
  consent sent by email is itself marketing, so it would break the rule
  for the very contacts it was meant to protect.

- **A smaller list over a bigger one** — the no basis group is probably a
  large share of the 800. Losing them from email costs reach; mailing them
  risks an ICO complaint landing on a clinical software company. Social
  media and a proper signup form are how they come back.

- **Resend send failures stay out of scope** — `send_email` has no
  exception handling around the provider call. That is already a to-do list
  item and is independent of how the email looks.

## Open questions

- **What did the conference and course booking forms say about
  marketing**, and did they offer an opt-out? This decides whether the
  soft opt-in group exists at all.

- **Were the events paid or free?** The soft opt-in needs a sale, or
  negotiations towards one; a free event on its own does not give one.

- **Is this worth one conversation with the ICO helpline** (0303 123
  1113) or a data protection adviser before Phase 8 starts? The sorting
  above follows ICO guidance, but it is not legal advice, and the no
  basis group is where a mistake would land.
