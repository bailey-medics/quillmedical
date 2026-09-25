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
front of a human before any code that renders or sends it is written. It
also carries the partners Quill works for, such as EoEETA, on the emails
sent for them.

## Phase 1: Design the template, with no plumbing

- [x] **Hand-write the base layout as static HTML mock-ups** in
      `frontend/src/stories/emails/mockups/`: one `base.html` with
      `{{placeholder}}` slots, `themes.ts` holding each theme's values, and
      `content.ts` holding the example emails, filled in by
      `renderMockup.ts`. That is the shape the Jinja2 renderer takes in
      Phase 3, a base template, theme values and per-email blocks, so the
      approved mock-up moves across without being rebuilt. Two themes,
      `quill` and `ldd`. There is no co-branded theme: each email is one
      brand or the other, and the move between them is told in words, not
      in a blended design. Brand values are copied by hand for now; Phase 2
      replaces the copies with shared tokens. No backend, no Jinja2, no
      Resend.

- [x] **Take the `ldd` theme from letsdodigital.org**, so the email looks
      like the site and the social account people already know. The site
      is a Quarto build on Bootstrap, and its values are:

      - **Body** — white `#ffffff`, text `#343a40`, headings at weight 400.
      - **Header band** — white, with a `#dee2e6` rule beneath it.
      - **Logo** — the dual face (one half a grey wire-mesh digital head,
        one half a blue human silhouette), a 714px transparent PNG at
        `letsdodigital.org/media/ldd-logo.png`.
      - **Accent** — the logo's own blue `#0848a9` for buttons and links.
        Not the site's Bootstrap primary `#2780e3`: white on that is
        3.97:1, under the 4.5:1 that WCAG AA needs for body-size text,
        where the logo blue gives 8.37:1.
      - **Font** — `'Source Sans 3', 'Source Sans Pro', Arial, sans-serif`
        from Google Fonts. Apple Mail uses it; Gmail and Outlook fall back
        to Arial.
      - **Buttons** — 6px corners, Bootstrap's default.

- [x] **Follow the public site, not the app, for the `quill` theme.**
      Emails are how people outside Quill first meet it, which is the
      public site's job too, so they borrow its look:

      - **Headings** — Cormorant Garamond, as `PublicTitle`, in navy at
        40px and 30px (the face runs small). Words in `*asterisks*` are set
        in italic amber, secondary.6 `#a87b2f` (3.8:1 on white), not the
        site's secondary.5, which is 2.7:1 on white.
      - **Body text** — Atkinson Hyperlegible Next, and nothing in the
        email below 19px, following GOV.UK's minimum.
      - **Header** — the brand navy band with the "Quill Medical" wordmark
        and a 4px amber rule beneath it.
      - **Callout panels** — as `PublicInfoCard`: primary.7 navy, a faint
        amber border, 8px corners, white text and amber links.
      - **Footer** — as `PublicFooter`: brand navy, grey.4 text, white
        links.
      - **Buttons** — as `PublicButton`: amber with brand navy text
        (6.6:1), 8px corners (Mantine 9's default radius), 42px tall.
        `PublicButton` itself moved from `#333` to navy text in the same
        round, because `#333` failed AA on its hover and pressed shades.
      - **Body background** — white, the one deliberate difference from
        the site, which is navy throughout.

- [x] **Build it for email clients, not browsers, from the start.** A
      single card table, fluid up to 900px wide: it fills a narrower window
      rather than scrolling sideways, and stops growing at 900px. Classic
      Outlook on Windows ignores `max-width`, so an Outlook-only
      conditional (`<!--[if mso]>`) gives it a fixed 600px table instead.
      Inline styles throughout (Gmail strips `<style>` in some views and no
      client understands CSS variables), `role="presentation"` tables,
      `lang="en-GB"`, a hidden preheader line for the inbox preview, and a
      bulletproof table button so Outlook draws it. Every image has `alt`
      text. The page behind the card is white and the card has a grey.4
      `#ced4da` outline drawn with `border-collapse: separate`: see the
      inbox test below for why.

- [x] **Choose a light body under a navy header for the `quill` theme**,
      not the app's all-navy surface. Mail clients apply their own dark mode
      (Outlook and Gmail invert colours they judge to be light, Apple Mail
      honours `prefers-color-scheme`), and a fully navy email inverted by a
      client comes out unreadable. Declare `color-scheme: light dark` and
      `supported-color-schemes` meta tags and add a small
      `prefers-color-scheme: dark` block for the clients that honour it.

- [x] **Fill each mock with real content, not lorem ipsum.** The password
      reset email (short, one button), the passport assessor invite (a cold
      message to somebody who has never heard of Quill), an EoEETA pass
      certificate (sent for a partner, with the certificate attached) and a
      sample newsletter (long, several sections, images). The certificate
      body is a question bank's real `student_email` template with its
      variables filled in. The passport invite's expiry line says the link
      works until the invitation is accepted: the backend's "can be used
      once" was wrong, because only `accept_assessor_invite` is single use.

- [x] **Sign the newsletter off with a round logo avatar.** Mark's avatar
      is the Quill quill in light grey `#c9c8ca` on brand navy (half as
      dark as the landing page's `#939296`, which looked dull at 56px); the
      Let's Do Digital newsletter uses its dual face on pale blue. Each is
      one PNG with the circle drawn in, because Outlook ignores
      `border-radius` and would draw a square. A 1024px copy of the Quill
      avatar for reuse is at `frontend/public/quill-avatar-circle.png`.
      Transactional emails carry no avatar: a password reset comes from
      Quill, not from a person.

- [x] **Show a partner on emails sent for one.** Emails that come from a
      partner's activity (certificates, assessment invitations, results)
      name the partner; account emails (verification, password reset) and
      newsletters do not. Quill stays the sender, because the sending
      domain is Quill's and a header claiming to be the partner is the
      mismatch spam filters and careful readers look for. The partner
      shows in three places:

      - **A white strip under the header**, with their logo (72px tall, so
        EoEETA's small lettering stays legible) and what the email is
        about. With no logo on file, their name stands in. The strip stays
        white in dark mode, because partner logos have transparent
        backgrounds drawn for white.
      - **The sender name**, "EoEETA via Quill Medical".
      - **The reply-to**, their coordinator, so a trainee's reply reaches
        the partner.

      The footer says "Sent by Quill Medical on behalf of …". EoEETA's logo
      is in `frontend/public/email/partners/`, with a 2x email copy.

- [x] **Show the mock-ups in Storybook** with `Emails.stories.tsx` under
      `src/stories/`, beside `Colours` and `Typography`. Each mock is
      imported with Vite's `?raw` and shown in a sandboxed `iframe`, with
      controls for theme, phone width, dark mode and the partner logo. The
      inbox line above each shows sender, subject, preheader and reply-to.
      Dark mode is forced by rewriting the email's `prefers-color-scheme`
      query, so the preview does not depend on the viewer's own setting.
      Logos are email-sized copies in `frontend/public/email/`, which
      Storybook serves through `staticDirs`.

- [x] **Send the mock-ups to real inboxes.** The EoEETA certificate was
      sent through Resend to Proton, Gmail and Outlook, with its images
      attached inline by `cid:` because they are not hosted yet. What
      that found, all now fixed in the mock-up:

      - **Proton on a laptop** puts its own white margin round every
        email, so a grey page showed as a grey box inside a white frame.
        The page is now white.
      - **Proton then showed no left or right edge on the card.** The
        outline was too pale and collapsed table borders let the client
        drop it. It is now darker and drawn separate.
      - **Outlook scrolled sideways** at a fixed 900px. The card is now
        fluid, with 600px for classic Outlook.

      Apple Mail and each client's dark mode have not been checked in a
      real inbox. Do that against the first real renders in Phase 5,
      where the images will be hosted and nothing is inlined.

- [x] **Get the design signed off before Phase 2.** Mark reads the
      Foundations/Emails stories and ticks this box. Everything after this
      phase turns the approved mock into working code, so it should not
      need to reopen the design. **An unattended run stops here until it
      is ticked.** Signed off by Mark on 25 September 2026, both themes,
      with the partner strip.

## Phase 2: Shared brand tokens

- [ ] **Move the brand values into `shared/brand.yaml`.** Today they live
      only in `frontend/src/theme.ts` (`brandColours`, the `primaryScale`
      and `secondaryScale` ramps, the font stacks and the type scale) and,
      for emails, as hand copies in `frontend/src/stories/emails/mockups/
      themes.ts`. The backend cannot read TypeScript, so an email template
      built from copies would drift the first time the theme changed. The
      YAML holds the palette once, plus a `email_themes` map with `quill`
      and `ldd` entries carrying every field of the mock-up's `EmailTheme`
      interface: fonts and font links, heading sizes and accent, page,
      card and card outline, header and header rule, text, muted, link,
      button fill, text and radius, panel colours, footer colours, the
      logo and avatar assets, the newsletter's "why you are receiving
      this" line, and the dark-mode set. Theme entries name palette
      shades where they are one (`primary.8`), so a palette change carries
      through. HTML fragments such as the header's logo markup do not go
      in the YAML: the template builds them from the asset fields.

- [ ] **Generate the frontend's copy with `yarn generate:types`** into
      `src/generated/`, as the competency and profession YAML already are,
      and have `theme.ts` import its brand colours and ramps from it, and
      the mock-up's `themes.ts` read its values from it rather than its own
      copies. The `Colours` story then shows what emails use, because it is
      the same data. Run `just uf src/theme.test.ts`, the mock-up tests,
      and the full frontend suite: this touches `theme.ts`, which every
      component depends on.

- [ ] **Load it in the backend** with a Pydantic model in
      `backend/app/email/brand.py`, `extra='forbid'`, read once at import
      and validated, so a missing colour for a theme fails at startup, not
      in somebody's inbox.

- [ ] **Fix `PublicButton`'s pressed state.** With navy text,
      `--button-active-bg` (`#a07728`) gives 4.3:1, just under WCAG AA.
      Lighten it so it is no darker than the hover shade (secondary.6,
      4.6:1), keeping a visible difference from hover, and extend the
      theme test to check contrast for the resting, hover and pressed
      fills against `--button-text-dark`.

## Phase 3: Renderer

- [ ] **Add Jinja2 as a backend dependency** and create
      `backend/app/email/templates/base.html.j2` with a `jinja2.Environment`
      in `backend/app/email/render.py`, autoescaping on for `.html.j2`.
      Autoescaping replaces the hand-written `html.escape` calls scattered
      through each template, so a new email cannot forget one. This is a
      dependency change, so rebuild the test image with `just utr`.

- [ ] **Turn the approved mock-up into `base.html.j2`.** The markup moves
      across as it is, including the Outlook conditional and the partner
      strip; only the hard-coded values become lookups into
      `shared/brand.yaml`, and the example content becomes blocks
      (`preheader`, `body`, `footer`, optional `partner`). The mock-up is
      the reference: if the rendered template looks different from it,
      the template is wrong.

- [ ] **Serve the email images from the public site, at absolute URLs.**
      Email clients cannot follow relative paths, so each image is an
      absolute URL on the public site, which stays up while the app is
      deployed. `frontend/public/` is already the public site's
      `publicDir`, so `frontend/public/email/` is built into it, but
      `.github/scripts/public-site/deploy-to-gcs.sh` syncs only the top
      level and `assets/` recursively. Add a recursive sync of `email/`
      with a shorter cache lifetime than `assets/` (the file names are not
      hashed, so a replaced logo must not be cached for a year), and cover
      it in the script's `.bats` tests. Add an `EMAIL_ASSET_BASE_URL`
      setting to `backend/app/config.py` (`https://quill-medical.com` in
      production, the dev public site locally) that the renderer prefixes
      to every image path.

- [ ] **Send a plain-text part and a reply-to.** Extend `send_email` in
      `backend/app/email_send.py` with an optional `text_body`, passed to
      Resend as `text`, and an optional `reply_to`, passed as `reply_to`.
      The renderer produces the text from the same template context. A
      plain-text part improves deliverability and is what some screen
      readers fall back to; the reply-to is how a partner's email sends
      replies to the partner.

- [ ] **Expose one function, `render_email(template, theme, context)`**,
      returning subject, HTML, text, and the sender name and reply-to where
      a partner is given. Tests in `backend/tests/test_email_render.py`
      cover escaping of hostile names, each theme rendering with its own
      colours, a missing context value failing loudly
      (`jinja2.StrictUndefined`), the preheader and footer being present,
      every image URL being absolute, and the partner strip appearing only
      when a partner is passed.

## Phase 4: Swap the Storybook mock-ups for real renders

- [ ] **Add a `just email-preview` recipe**, following
      `.claude/rules/just.md`, that renders every template with fixture
      data, in every theme, to `frontend/src/stories/emails/rendered/*.html`
      inside the backend unit test container. The fixtures cover the same
      cases the mock-ups show: password reset, passport invite, the EoEETA
      certificate with and without a logo, and the newsletter. The renders
      are committed, with image URLs relative so Storybook can serve them.

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

- [ ] **Convert the `main.py` emails first** into child templates of
      `base.html.j2`, one per message: email verification (sent from three
      places, one template), password reset, and the account invitation in
      `send_invite_email`. They are the most-sent and the simplest, so they
      prove the layout before anything unusual is put in it. Keep the
      wording as it is; this is a presentation change, and reviewing new
      copy at the same time would hide what changed.

- [ ] **Convert the passport assessor invite, and correct its expiry
      line.** Its module docstring already says what it must do (name who
      is asking, what they are asked to do and how long the link lasts,
      and never mention a patient) and that stays true. The one wording
      change is the expiry line: "This link can be used once" becomes "You
      can use this link until you accept the invitation", because the link
      is not single use.

- [ ] **Give each teaching organisation its email branding.** The partner
      strip needs a name, a short name for the sender line, a logo and a
      reply-to address. `TeachingOrgSettings` in
      `backend/app/features/teaching/models.py` is already one row per
      teaching `org_unit` and already holds two of them:
      `institution_name` and `coordinator_email`. Add two nullable columns
      to it, `email_short_name` (for "EoEETA via Quill Medical") and
      `email_logo` (a file name under `frontend/public/email/partners/`),
      with `just migrate`, expose them on `TeachingOrgSettingsIn` and
      `TeachingOrgSettingsOut`, and add them to the settings form in the
      teaching admin page. Nullable, so every existing row stays valid:
      with no short name the sender stays "Quill Medical", and with no
      logo the strip shows `institution_name`. Logos live in the
      repository for now, reviewed in a pull request like any other asset,
      because partners are few and each needs written permission to use
      their logo anyway; an upload flow can come when there are more.

- [ ] **Wrap the teaching certificate emails without taking away the
      coordinators' control.** A bank's `config.yaml` supplies subject and
      Markdown body, converted and sanitised with `nh3`. Keep that, and
      place the sanitised HTML in the base layout's content slot, so a
      coordinator writes the words and Quill supplies the frame. Both the
      student and the coordinator emails get the partner strip, the "via"
      sender and the coordinator as reply-to, from the organisation's
      `TeachingOrgSettings`. The certificate PDF stays an attachment.

- [ ] **Check the real renders in real inboxes.** Send each converted
      email from the development environment to Proton, Gmail, Outlook
      and Apple Mail, with dark mode on and off, now that images come from
      the public site rather than being inlined. Record what was found
      here, and fix it before ticking.

**An unattended run stops at the end of Phase 5.** Phases 6 to 8 are
mostly work outside the repository (DNS, the Resend dashboard, MailerLite,
privacy notices, social accounts) and decisions only Mark can take. The
steps in them that are code are marked **(code)**.

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

- [ ] **(code) Export the base layout as a broadcast template.** Add a
      `just email-export <theme>` recipe that renders `base.html.j2` with
      the content slot replaced by Resend's broadcast placeholders and the
      footer carrying `{{{RESEND_UNSUBSCRIBE_URL}}}`, for pasting into
      Resend. One layout, so a newsletter and a password reset are visibly
      from the same sender.

- [ ] **(code) Point the public site's signup form at a Resend audience.** The
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

- **The public site's look, not the app's** — emails reach people who
  have not used Quill, which is the public site's audience, not the app's.
  They borrow its serif headings, navy panels and footer, and amber
  button, and differ only in having a white body.

- **Quill sends, the partner is shown** — a partner's emails come from
  Quill's domain with the partner in a strip, the sender name and the
  reply-to. Sending as the partner would need their DNS and would look
  like phishing to both filters and readers.

- **Fluid up to 900px, not a fixed width** — a fixed 900px scrolled
  sideways in Outlook and a fixed 600px wastes a wide pane. Fluid with a
  maximum suits every client except classic Outlook on Windows, which
  gets a fixed 600px through a conditional comment.

- **Resend send failures stay out of scope** — `send_email` has no
  exception handling around the provider call. That is already a to-do list
  item and is independent of how the email looks.

## Open questions

- **What did the conference and course booking forms say about
  marketing**, and did they offer an opt-out? This decides whether the
  soft opt-in group exists at all.

- **Were the events paid or free?** The soft opt-in needs a sale, or
  negotiations towards one; a free event on its own does not give one.

- **Does each partner give written permission to use their logo** in
  Quill's emails? EoEETA's logo is already in the repository for the
  mock-up; no real email should carry it until they have agreed.

- **Is this worth one conversation with the ICO helpline** (0303 123
  1113) or a data protection adviser before Phase 8 starts? The sorting
  above follows ICO guidance, but it is not legal advice, and the no
  basis group is where a mistake would land.
