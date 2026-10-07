# Amazon SES email plan

The public site says "Your data stays in the UK" on the home, security and
about pages. That is not true while Quill sends email through Resend,
which stores names, email addresses and message content in the United
States. The transfer is lawful, but the promise is not kept, and the
privacy policy drafted on 6 October 2026 has to contradict the site to be
honest. Amazon Simple Email Service (SES) in its London region,
`eu-west-2`, keeps email data in the UK, costs $0.16 per 1,000 emails
with no monthly fee and no daily cap. It also keeps a contact list with
its own unsubscribe handling, which this plan first meant to use and
then set aside: see Phase 4.

The outcome is every email Quill sends, service and newsletter, going
through SES in London, the newsletter list held by Quill itself, Resend
closed, and the privacy policy and the site saying the same true thing.
It has to be done, or the site reworded, before the EoEETA service goes live, which is
expected between late October and mid November 2026. This plan was
written in one worktree and is meant to be worked from the primary one,
which controls the dev containers. It stands on its own; the reasoning
behind choosing SES is Phase 5 of the
[Terms and privacy policy](2026-10-06-terms-and-privacy-policy-plan.md)
plan, which this replaces as the working document.

## Phase 1: The AWS account (Mark)

Nothing here touches the repository. The steps down to the renaming were
done on 6 October 2026 and are written as they happened, which is not how
this phase was first drafted: AWS changed how an account is opened, and
the first draft, written from memory, described screens that no longer
exist. The steps still unticked have not been checked against the new
screens.

- [x] **Create the AWS account** at <https://aws.amazon.com>. AWS now has
      two ways to sign up and offered only the new one, "Sign up for AWS
      (new)". It never asks for a company name, has no root login, and
      signs in with an "AWS Builder ID", a profile for a person; that
      profile is `mark@quill-medical.com`, and its page is
      <https://settings.aws.com>, called AWS Settings. What it makes is a
      "project": one AWS account inside an organisation that AWS manages.
      **It also chooses the region.** A United Kingdom address gets
      Europe (Stockholm), `eu-north-1`, the console shows no region
      switch, and AWS's documentation says "You cannot modify your AWS
      Region". SES there would have put email data in Sweden. The other
      way in, "Sign up for AWS (advanced)", is the old one with a root
      login and a free choice of region.

- [x] **Upgrade to the paid plan,** in AWS Settings under Billing. The
      next step requires it. It costs nothing until something is used,
      cannot be undone, and the free tier closes after six months anyway.
      No spend limit was set, because the next step removes one.

- [x] **Activate advanced features,** in AWS Settings under Projects.
      This turns the new kind of account into the old kind and cannot be
      reversed. It was chosen over signing up again the advanced way,
      which would have given one plain account; see Decisions. The team
      name given was Quill Medical, and the management account email
      `aws@quill-medical.com`, an alias made for the purpose so that the
      root login is not a person's own address. The result is an
      organisation, Quill-Medical, of three accounts. Mark renamed
      them on 7 October 2026, and the names in brackets are the ones
      they carry now; the rest of this plan uses whichever was current
      when each step was written:

      - **Quill Medical Emails** (now Quill Medical Emails App) – the
        working account, where SES and
        the backend's key live. It was the original project.

      - **Quill-Medical Management Account** (now Quill Medical
        Superadmin) – billing and the
        organisation's policies. Its root login is `aws@`.

      - **Quill-Medical Identity Delegated Admin** (now Quill Medical
        ID) – the sign-in
        directory: who may log in, and to which accounts. AWS made it
        and sign-in depends on it. Nothing is done there.

- [x] **Give the root login a password and two-factor sign-in.** After
      activation the root login has neither. The password is set by
      signing in at <https://console.aws.amazon.com> as root user with
      `aws@quill-medical.com` and choosing "Forgot your password?"; the
      authenticator is added under Security credentials. Root is for
      being locked out and nothing else. Daily work is `mark@`.

- [x] **Confirm `mark@quill-medical.com` has two-factor sign-in too.**
      It is the login that is used every day and reaches all three
      accounts. It is managed from AWS Settings.

- [x] **Allow London in the region policy.** Activation shows a region
      switch but still refuses every region except Stockholm and two
      American ones. The rule is a service control policy,
      `AdvancedModeRegionRestrictionSecurityControlPolicy`, edited from
      the management account under AWS Organizations, Policies, Service
      control policies. Its last statement, `RegionFloor`, lists the
      regions allowed; `eu-west-2` was added. **A policy like this never
      applies to the management account,** so London looks open there
      whatever the policy says. Test from the working account, and never
      create SES in the management one.

- [x] **Show London in the console.** A second setting, separate from
      the policy, decides which regions the console will open, and
      answers "Region Europe (London) restricted" until it is changed. It
      is per account: in the working account, the gear icon, "See all
      user settings", Account settings, Visible Regions. It hides
      regions in the console only and stops no program using them.

- [x] **Close Stockholm, so nothing is made there by mistake.** Unticked
      in Visible Regions, and `eu-north-1` deleted from `RegionFloor`.
      Signing out and in again and opening SES in London still worked, so
      nothing of AWS's own depended on it. N. Virginia (`us-east-1`) and
      Oregon (`us-west-2`) stay in both places: the same policy already
      limits them to AWS's own global services, sign-in, billing, IAM and
      support among them, so SES cannot be created in either, and hiding
      them breaks those consoles. London is therefore the only region
      where anything of Quill's can exist.

- [x] **Rename the working account** from AWS's default, "Dream It Ship
      It", to Quill Medical Emails: in the management account, AWS
      Organizations, AWS accounts, Actions, "Update account name". A new
      name can take four hours to show everywhere.

- [x] **Put the company on the working account's contact details.** The
      account page (the account name at the top right, then Account)
      shows a primary contact with no company name. Set it to Bailey
      Medics Ltd, with the registered address and the website. The legal
      name already went in with the billing and tax details.

- [x] **Stay on the Essentials plan.** A new SES account starts on it,
      and it is the pay as you go one: no monthly fee, $0.16 per 1,000
      emails, with the deliverability dashboard included. À la carte
      pricing is a little cheaper per email, which is pennies a month at
      a few thousand emails. Pro ($105 a month) and Enterprise ($500 a
      month) are the ones to avoid: they add dedicated sending addresses
      and, on Enterprise, global endpoints, which a few thousand emails a
      month does not need, and sending from more than one region would
      take email out of London.

- [x] **Add `quill-medical.com` as a domain identity in SES,** in the
      working account with the top bar reading Europe (London): under
      Configuration, Identities, "Create identity". Easy DKIM with a
      2048-bit key, DKIM signatures enabled, no default configuration
      set, and "Publish DNS records to Route53" unticked, because the
      domain's DNS is in Google Cloud. Amazon shows three CNAME records.
      Do not add them by hand: they go into Terraform in Phase 2. Copy
      them into that step.

- [x] **Set a custom MAIL FROM domain of `mail.quill-medical.com`,** not
      `send.quill-medical.com`, on the same form, falling back to
      Amazon's default MAIL FROM if the MX record cannot be found. `send`
      is what Resend uses today, and its MX record points at Amazon's
      Ireland feedback endpoint on Resend's behalf. Reusing it would
      break Resend's bounce handling while both run side by side. Amazon
      shows an MX and a TXT record for the new name; copy those too.

- [x] **Request production access, early.** Requested on 6 October
      2026, once the domain had verified; the form is locked until then.
      Amazon granted it the same evening. A new account is in a
      sandbox: 200 emails a day, and only to verified addresses. On the
      SES account dashboard choose "Request production access", mail type
      Transactional, website `https://quill-medical.com`. Describe it
      plainly: a medical training platform sending account verification,
      password resets, invitations, course certificates and reminders to
      registered healthcare staff, plus a newsletter to people who chose
      to receive it, with an unsubscribe link in every message; bounces
      and complaints are acted on and every unsubscribe is honoured.
      Amazon usually answers within a day. This is the only step with a
      wait, so do it weeks before go-live.

- [x] **Record Amazon's data processing terms.** There is nothing to
      sign. AWS's Data Processing Addendum, and the UK GDPR Addendum to
      it, are part of the AWS Service Terms and apply automatically to
      every customer. They have applied to Quill since the account was
      opened on 6 October 2026. The terms are at
      <https://aws.amazon.com/service-terms/>; use that date and link in
      the step below that updates the privacy policy.

- [x] **Settle where the contact list is held.** No AWS page names
      contact lists, so the first draft of this step was a support case.
      It was not needed. AWS's Data Privacy FAQ commits that "You choose
      the AWS Region(s) in which your content is stored" and that "We
      will not move or replicate your content outside of your chosen AWS
      Region(s), except as necessary to provide the services you
      initiated, or as necessary to comply with the law". A contact list
      is content under its definition. The SES documentation makes every
      other part of the service regional, the account's own suppression
      list among them, and nothing describes the contact list as global.
      Decided on 6 October 2026 that this is enough to build Phase 4 on.

## Phase 2: DNS and credentials

- [x] **Add the SES records in `infra/dns.tf`,** beside the Resend ones,
      under a comment saying they are SES in London: the three Easy DKIM
      CNAMEs, and the MX and SPF TXT for `mail`. The MX value is
      `feedback-smtp.eu-west-2.amazonses.com`. Leave every Resend and
      Proton record alone. Both senders can sign for the same domain,
      because each uses its own DKIM selector. Terraform applies on
      merge; check the run, then wait for SES to show the domain as
      verified.

- [x] **Create an AWS user that can only send from London.** The IAM
      user `quill-backend-ses`, in the Quill Medical Emails account and
      not the management one, with one policy,
      `quill-backend-ses-london`: `ses:SendEmail`, `ses:SendRawEmail` and
      the six contact-list actions Phase 4 needs, each allowed only where
      `aws:RequestedRegion` is `eu-west-2`. Made from the command line,
      signed in with `aws login --profile quill-emails`, which keeps
      short-lived credentials and no key on disk. Its access key was
      created the same way and written straight into the local
      `backend/.env`, never shown. Checked with that key: a send from
      London is accepted, the same send from Ireland is refused, and so
      is listing identities.

- [x] **Put the key in Secret Manager, never in a chat or a file.** Add
      `ses-access-key-id` and `ses-secret-access-key` to the secrets list
      in `infra/main.tf` first, so the containers exist; that went in
      with the Phase 3 code. Then add the values, piped from the local
      `backend/.env`, which holds the only copy, so they are never
      shown, with `printf`, not `echo`, which leaves a trailing
      newline. Only then mount them in `infra/runtime-identities.tf` as
      `SES_ACCESS_KEY_ID` and `SES_SECRET_ACCESS_KEY`: Cloud Run refuses
      a revision that mounts a secret with no version, which is why the
      Resend secrets went in as two changes. After the infra change,
      re-run `deploy.yml` and check the serving revision. The values went
      in on 7 October 2026 and were checked by fingerprint against the
      local copy, with no trailing newline; the mount followed. The
      warning about the serving revision held: merging the mount left
      App production on the revision from the night before, and the one
      Terraform made, with the secrets, had no traffic. The deploy run
      on that merge finished green without moving it. Re-running
      `deploy.yml` by hand did, on the second try: the first failed in
      the frontend image build with "error writing layer blob:
      not_found", a fault in storing the image and nothing in the code,
      and re-running the failed jobs passed.

## Phase 3: Send service email through SES

This phase alone gets verification emails, password resets, invitations
and certificates out of the United States.

- [x] **Add `boto3` to `backend/pyproject.toml`** and rebuild the test
      image with `just utr`, because dependencies are baked into it.
      `mypy --strict` needs its types as well: `boto3-stubs[sesv2]` in
      the dev group, and in the mypy hook's own list in
      `.pre-commit-config.yaml`, which has a separate environment. The
      API schema hook imports the app from the host's Poetry
      environment, so that needs `poetry install` after the change.

- [x] **Add the settings in `backend/app/config.py`:**
      `SES_ACCESS_KEY_ID` and `SES_SECRET_ACCESS_KEY` as `SecretStr`,
      `SES_REGION` defaulting to `eu-west-2`, and `EMAIL_PROVIDER`, a
      `Literal["resend", "ses"]` defaulting to `resend`. The switch lets
      SES be turned on in one environment at a time and turned back off
      without a deploy of code.

- [x] **Send through SES in `backend/app/email_send.py`.** Everything in
      `send_email` above the provider call stays as it is: the
      allow-list, the rate limit, the dry run, the sender header. Only
      the last part is Resend's: setting the key, building
      `resend.Emails.SendParams` and calling `resend.Emails.send`. Add
      the SES equivalent beside it, chosen by `EMAIL_PROVIDER`: an
      `sesv2` client pinned to `SES_REGION`, and `send_email` with the
      message built as a raw MIME message, because attachments
      (certificates) need it. Keep the two properties the Resend path
      has: strip the key of whitespace, and raise `EmailSendError` with
      the secret redacted and `from None`, so a key can never reach a
      log. And a third: a short wait. The Resend client gives three
      seconds to connect, after "forgot password" hung for sixty; the
      SES client is given the same, twenty to answer, and one retry.

- [x] **Test it** in `backend/tests/test_email_send.py`: the SES path
      sends to the pinned region, carries the attachment, the reply-to
      and the text body, redacts the secret on failure, and is not
      reached under `EMAIL_DRY_RUN` or for a recipient outside
      `EMAIL_ALLOWED_RECIPIENTS`. Run `just ub -k "email_send"`, then the
      other email tests that mock the send: `test_account_emails`,
      `test_certificate_email_recipients`, `test_email_verification` and
      `test_passport_invite_email`.

- [x] **Prove the backend's own send from the dev stack.** First
      written as a sandbox test, but production access arrived before
      the code did. Done on 7 October 2026, with `EMAIL_PROVIDER=ses` in
      the local `backend/.env` and `EMAIL_ALLOWED_RECIPIENTS` naming
      Mark's addresses. The running dev backend sent, through its own
      `send_email`: the Quill-themed verification email; the same layout
      with a PDF attached; and a password reset, requested through
      `POST /api/auth/forgot-password`, which took 0.4 seconds. All
      three arrived, laid out correctly, the attachment present. Not
      sent: a real certificate, which the app emails only when an
      assessment is passed, and a verification from registering, since
      every allowed address already had a dev account. The unit-test
      container cannot do this test: it has no network by design. The
      `EMAIL_PROVIDER` line came out of `backend/.env` afterwards,
      because the unit tests read that file, and tests that mock Resend
      would try SES.

- [x] **Switch App production to SES.** `EMAIL_PROVIDER` set to `ses`
      in the backend's environment in `infra/main.tf`, merged on 7
      October 2026 once the serving revision was seen to have the key.
      As with the mount, the merge alone changed nothing: Terraform's
      revision had no traffic until `deploy.yml` was re-run by hand.
      After that the serving revision read `EMAIL_PROVIDER=ses`, the app
      answered healthy, and a password reset requested through
      `POST /api/auth/forgot-password` on the live app was logged as
      sent, the whole request taking about a second. Resend stays
      configured, so removing the line reverses it. Only the backend is
      switched: the admin job has no key and keeps the default. Still
      to see in App production: a verification email from a real
      registration, and a certificate from a passed assessment.

- [x] **Give development its own AWS account.** First placed after the
      production switch, and brought forward on 7 October 2026, so that
      Phase 4's send command is never tried with a key that can email
      anybody. Quill Medical Emails Dev is a third working account in
      the organisation, made from the management account with
      `aws organizations create-account`, under
      `aws-dev@quill-medical.com`. That address did not exist when the
      account was made: an account made inside an organisation is not
      asked to verify it, so nothing failed, and the alias was created
      and tested afterwards. It is the account's recovery address, so
      make it first next time. No root password is set for the account,
      and none is needed. Done so far: the region policy is
      attached to the organisation's root, so it reached the new account
      unasked, and SES there answers in London and is refused in
      Stockholm and Ireland; `quill-medical.com` is added with Easy DKIM
      and the same `mail` MAIL FROM name, whose record serves every
      account in London; a user, `quill-backend-ses-dev`, may send from
      London and do nothing else; and its key has replaced the
      production one in the local `backend/.env`, so the production key
      now exists only in Secret Manager. The account is in the sandbox,
      which suits development: 200 emails a day, to verified addresses
      only. SES took about three minutes to answer in the new account at
      all, refusing with "needs a subscription for the service" until
      then. The three DKIM records merged the same day and the domain
      verified within minutes. Checked with the development key: an
      email to `mark@quill-medical.com` was accepted, and one to an
      outside address was refused as not verified, which is the sandbox
      doing what development wants.

- [x] **Let Mark into the development account as well.** An account
      made through AWS Organizations has one way in, a role the
      management account can use, which is how the command line reaches
      it. It does not show at <https://settings.aws.com/projects>, and
      Mark's own sign-in cannot open it, until two things exist. A role
      in the new account, `AccountFullAccessRole`, trusting the service
      `account-access.amazonaws.com` for `sts:AssumeRole` and
      `sts:SetContext`, with a twelve hour session and administrator
      rights: a copy of the one AWS made in the other accounts, at the
      path `/` because the organisation's policy keeps `/managed/` for
      AWS. And a grant, which AWS calls an entitlement, made in the
      management account with `aws account-access create-entitlement`,
      naming Mark's user in the sign-in directory and that role. Mark
      ran both himself: giving a person administrator rights is not a
      step for an assistant to take. The account then appeared in AWS
      Settings at once. So there are two ways in, and neither depends on
      the other.

- [x] **Set the new account's console to London.** Saving Visible
      Regions from its console failed with "a service control policy
      explicitly denies the action": the console was in a region the
      policy no longer allows, most likely Stockholm, and a save is sent
      from wherever the console is. The first account's was changed
      before Stockholm was closed. Console settings are allowed through
      N. Virginia, so `aws uxc update-account-customizations --region
      us-east-1` set it to London, N. Virginia and Oregon. To change one
      by hand, switch the console to N. Virginia first.

- [x] **Make signing in from the command line check where it landed.**
      `aws login` does not ask which account: it takes whichever AWS
      console session is active in the browser. Twice on 7 October 2026
      it signed a profile in to the sign-in directory account without a
      word. `just al` now takes `emails` or `management`, checks the
      account number afterwards and refuses the wrong one. The numbers
      it checks against are in the local `backend/.env`, as
      `AWS_EMAILS_ACCOUNT_ID`, `AWS_MANAGEMENT_ACCOUNT_ID` and
      `AWS_EMAILS_DEV_ACCOUNT_ID`, and not in the Justfile: this
      repository is public. `backend/.env-sample` names them, with no
      values, regenerated by `scripts/env-samples-update.sh`. The
      development account needs no sign-in: its profile,
      `quill-emails-dev`, reaches it through the management one, by the
      role AWS makes in every account it creates.

## Phase 4: Send the newsletter from Quill's own list

This phase was first written as moving the list to SES: a contact list
there, a sync to keep it in step, and a route to hear of unsubscribes. It
was rewritten on 7 October 2026, after one step of that had been done,
because of two things found on the way. Amazon's unsubscribe page cannot
be themed: it is a fixed page at an Amazon address,
`eu-west-2.user-subscription.com`, showing only the topic's name and
description. And an AWS account has one contact list, which the dev stack
would have shared with production.

So Quill keeps the list itself. `users.marketing_emails` is already the
record of every answer; it becomes the only one. The link in a
newsletter goes to a page of Quill's own, and there is no list at
Amazon, no sync and nothing to drift. What is given up is Amazon
refusing a send to somebody who opted out: Quill has to do that itself,
in the command that sends, and the tests have to pin it down.

- [x] **Create the contact list in London** with one topic, whose
      default is opted out, so nobody is subscribed by being added. The
      list is `quill-newsletter` and the topic `Newsletter`, made on 6
      October 2026 from the command line with `aws sesv2
      create-contact-list`, not in Terraform: the AWS provider was not
      worth adding for one resource. An account has one contact list.
      The SES console has no screen for it; `aws sesv2 get-contact-list
      --contact-list-name quill-newsletter --profile quill-emails` shows
      it. **Superseded the next day**: nothing uses it, and the last
      step of this phase deletes it.

- [x] **Make the unsubscribe link and its routes.** A link signed with
      `itsdangerous`, as the verification and password reset links in
      `backend/app/security.py` are, under its own salt, naming the user
      by id and never by address. It does not expire: a newsletter is
      read months later, and a link that has stopped working is an
      unsubscribe refused. It can do one thing, change that person's
      marketing preference, so a leaked one costs little. Two public
      routes in `backend/app/marketing/router.py`, rate limited, with no
      session and no CSRF token, because the signature is the whole of
      their authentication: `GET /api/marketing/unsubscribe` answers
      what the person's preference now is, and `POST` to the same path
      sets it. The `POST` must also take what a mailbox sends for a
      one-click unsubscribe, a form body of `List-Unsubscribe=One-Click`
      (RFC 8058), and turn the preference off. Both go through
      `set_marketing_preference`, with a new source `unsubscribe_link`
      added to `MARKETING_PREFERENCE_SOURCES`. `resend` stays in that
      list: rows already written carry it. A bad signature answers 404,
      as the route guards do, and says nothing about whether the user
      exists. Built as planned, with three things settled on the way.
      The token rides in the query string, on `GET` and `POST` alike:
      a mailbox pressing the link can send nothing else. A `POST` whose
      body is not JSON is read as the one-click and turns news off,
      whatever it holds, because the link is already proven and off is
      the safe way to be wrong; JSON that is not the page's shape is
      refused with 422 and changes nothing. And while Resend still
      holds a list the route tells it too, but never fails for it: a
      one-click that answered an error because Resend was down would be
      an unsubscribe refused.

- [x] **Build the unsubscribe page.** A page in the app that needs no
      login, at `/unsubscribe`, in the Quill layout: it reads the link,
      says which address it is for with most of it hidden, shows whether
      news is on or off, and turns it off or back on with one button.
      Somebody signed out must be able to use it, so it sits outside
      `<RequireAuth>`. Compose it from the Storybook components there
      are, with a story and a test, and put any new component to Mark
      before building it. The newsletter's "Update your preferences"
      link goes to the same page. Built with no new atomic component:
      the card is the sign-in pages' logo and `BaseCard`, and the
      control is `SolidSwitch`, the one Settings uses for the same
      choice, so somebody who knows one knows the other. Opening the
      page changes nothing. A link that unsubscribed by being opened
      would be pressed by every mail scanner that follows links, which
      is the reason a mailbox's one-click is a `POST`. The route has no
      guard at all: `GuestOnly` would turn a signed-in person away, and
      `RequireAuth` a signed-out one. **Four things changed on the
      first real click,** in the dev stack on 7 October 2026, none of
      which a test had shown. The page appeared and was at once
      replaced by the login page: every page asks who is signed in, a
      signed-out answer sends the browser to `/login`, and `/unsubscribe`
      was missing from the list in `frontend/src/lib/api.ts` of pages
      excused from that. The message shown while the link was read
      flashed up and vanished, so nothing is shown while loading. The
      coloured card confirming a change was too much for a card this
      small, and is a second-level heading. And the footer's "Update
      your preferences" link is gone from the newsletter: with one
      newsletter and one choice it led to the same page as
      "Unsubscribe" and added nothing.

- [x] **Write the command that sends a newsletter.** SES has no screen
      to compose a broadcast and press send, so this is an admin action.
      It takes a subject and a body, renders `newsletter.html.j2` for
      each person with their own unsubscribe link, and sends through
      `send_email`, which gains a way to set extra headers:
      `List-Unsubscribe`, pointing at the `POST` route, and
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Mailbox
      providers require both on bulk mail. **Who it sends to is the
      part that matters**: verified, active users whose
      `marketing_emails` is true, read when the command starts and read
      again for each person just before their send, so somebody who
      unsubscribes while it runs is not emailed. Nothing else stops a
      send to somebody who refused. Give it a dry run that prints who
      would receive it, and a required confirmation, because a
      newsletter cannot be unsent. It runs in the admin job, which
      needs the SES key and `EMAIL_PROVIDER` in
      `admin_secret_env_vars` and its environment in `infra/`. Rewrite
      `docs/docs/backend/marketing-email.md`, which describes sending by
      hand from Resend. `backend/app/email/broadcast.py` and `just
      email-export` exist only to paste the layout into Resend's editor;
      this command replaces them. Built with four things the first
      draft of this step did not have. **A newsletter is a campaign, a
      template in the repository,** under
      `backend/app/email/templates/campaigns/`, and not a subject and
      body handed to the command: it then carries the Quill layout
      through the same macros as every other email, and its words are
      read in a pull request before anybody receives them. **Each send
      is recorded,** in a new table, `newsletter_send`, as the email
      leaves, so a run that stops half way can be run again and reaches
      only the people it missed. **The confirmation names the count,**
      as in `trial:12`, so it can only be known from a dry run and stops
      being right if the list has changed since. **A trial goes to one
      address** and is not recorded; `trial.html.j2` is a campaign for
      it. `broadcast.py` and `just email-export` are left until Phase 5,
      because newsletters are still sent from Resend until the cut-over
      below. The docs page gained a section and was not rewritten, for
      the same reason. `just newsletter-send` runs it.

- [x] **Send one to Mark alone, and try every way out.** Rehearsed in
      the dev stack first, through the development AWS account, which
      is where the page's redirect to the login page was found. Then
      in App production on 7 October 2026, once the code was deployed:
      a dry run listed one address, the trial was sent with
      `just newsletter-send app trial trial:1` to that address, it
      arrived in the Quill layout, and the footer link opened the
      unsubscribe page on the live site, which worked. Not checked: a
      mailbox's own unsubscribe button, which Proton may not show, and
      the `marketing_preference_change` rows in the production
      database. The route that writes them is covered by tests and was
      seen to write one in the dev stack.

- [x] **Cut over: take Resend out of the newsletter altogether.** One
      change, with no switch and nothing kept back. Remove the
      `sync_contact` calls from the Settings route, registration and the
      unsubscribe link's route, so a choice is saved in Quill and
      nowhere else, and opting out no longer fails when Resend cannot be
      reached. Then remove what they called and everything beside it:
      `resend_contacts.py`, `sync.py`, `reconcile.py`, the webhook route
      `POST /api/marketing/resend-webhook` with `RESEND_WEBHOOK_SECRET`,
      the `marketing-sync` and `marketing-reconcile` actions in
      `backend/scripts/admin_cli.py` with their `just` recipes, the
      `marketing-reconcile.yml` workflow, `broadcast.py` with `just
      email-export`, the `RESEND_CONTACTS_API_KEY` and the two newsletter
      identifiers in `config.py` and `infra/`, and
      `users.marketing_synced_at`, which only the sync read, by a
      migration of its own. From here newsletters are sent by the
      command above and never from Resend. The first draft of this step
      kept the webhook, so that somebody pressing the unsubscribe link
      in an old newsletter from Resend would still be heard. Mark's
      answer on 7 October 2026: there are no real users yet. Resend's
      list holds six contacts, all test accounts, so there is nobody to
      hear from and no reason to carry the code. Done in two changes
      and not one, for two reasons found on the way. **The column goes
      separately, after the code.** A deploy runs the migration while
      the old revision is still serving, and that revision reads
      `marketing_synced_at`; dropping it in the same change would break
      the app for the length of a deploy. So the first change stops all
      use of the column and the second, merged once the first has
      deployed, drops it. **The two secret containers stay until Resend
      is closed.** Terraform applies on merge, before the deploy has
      replaced the serving revision, which still mounts
      `resend-contacts-api-key` and `resend-webhook-secret`; deleting a
      secret a serving revision mounts stops its new instances
      starting. The first change removes the mounts and leaves the
      containers, and Phase 5 deletes them. Removing
      `POST /api/marketing/resend-webhook` is a breaking API change by
      the repository's rules, so that pull request waits on the
      `api-breaking-change-review` approval.

- [x] **Delete the contact list and narrow the key.** `aws sesv2
      delete-contact-list --contact-list-name quill-newsletter`, and
      take the six contact actions out of the `quill-backend-ses-london`
      policy, leaving `ses:SendEmail` and `ses:SendRawEmail`. The key
      should be able to do what the backend does and no more. Done on 7
      October 2026. The list was empty when it was deleted. The policy
      has a second version, now the default, with the two sending
      actions and nothing else; AWS's policy simulator says the key may
      send from London, may not send from Ireland, and may not list,
      create or delete a contact. The column the cut-over left behind,
      `users.marketing_synced_at`, is dropped by a migration of its own
      in the pull request after the cut-over's, to merge only once the
      cut-over has deployed.

## Phase 5: Close Resend and make the documents true

- [x] **Move the accessibility review reminder off Resend.** The
      yearly reminder to review the accessibility statement is a GitHub
      job of its own, `.github/workflows/accessibility-review.yml`. Once
      the review is eleven months old it nags weekly, by Slack and by
      an email that `.github/scripts/accessibility-review/send-reminder.sh`
      sends through Resend directly, with the key read from Secret
      Manager under its own grant, `ci_resend`, in
      `infra/runtime-identities.tf`. Closing Resend would leave the
      email failing every Monday. Decided on 7 October 2026: keep both
      the Slack message and the email, and send the email through SES.
      The script calls the SES API in `eu-west-2` in place of Resend's,
      and the workflow reads `ses-access-key-id` and
      `ses-secret-access-key` from Secret Manager at run time, as it
      reads the Resend key today, under a grant that replaces
      `ci_resend`. That reuses the backend's send-only key and adds no
      new credential. Run it once with `force` to see both arrive,
      before the step below removes the Resend secret. **The change is
      written; the run with `force` is what is left**, and is why this
      was not ticked at first. Run with `force` on 7 October 2026: the
      email went through SES and the Slack message was posted, both jobs
      green. **Then changed the same day, because it was wrong.** Giving
      the CI service account the SES key broke the rule this
      repository already had: a secret lives where it is used, and
      GitHub should hold nothing it does not need. The app sends the
      email now. The workflow starts the admin job's
      `accessibility-reminder` action, as `marketing-reconcile.yml`
      starts its own, and holds no mail credential: the grant `ci_ses`
      is gone and the CI account reads no runtime secret at all. The
      email is a template, `accessibility_review.html.j2`, in the Quill
      layout, with a Storybook preview. `send-reminder.sh` and its
      tests are deleted. Slack stays in the workflow: its webhook is
      one GitHub itself uses. What follows describes the first version.
      The script sent with the AWS command line tool,
      which is part of GitHub's runner image and takes the key from the
      environment, so the key is never in an argument where the process
      list would show it. The grant is `ci_ses`, on the two SES secrets.

- [ ] **Close Resend.** Once service email has run through SES long
      enough to trust it, delete the contacts from Resend and close the
      account. Remove what is left of it: the `resend` dependency and
      the Resend path in `backend/app/email_send.py`, `RESEND_API_KEY`
      from `config.py`, `infra/main.tf` and `infra/runtime-identities.tf`,
      the `resend._domainkey` record and the `send` MX and TXT records
      from `infra/dns.tf`, and `EMAIL_PROVIDER` itself, which has done
      its job. The newsletter's share of Resend went at the cut-over in
      Phase 4.

- [ ] **Update the privacy policy** in `docs/docs/legal/privacy-policy.md`
      as a new version: section 5 names Amazon Web Services, London, in
      place of Resend; section 8 loses the transfer to the United States;
      section 3 loses its mentions of Resend, and says the newsletter
      list is Quill's own, with no copy at the email provider. Add one
      sentence about the
      shared suppression list: an address that hard-bounces is held by
      Amazon on a list shared across its customers for up to 14 days,
      and Amazon does not say where. Update the public pages when they
      are rendered from it.

- [x] **Make the public site true at go-live.** It is true now, on 7
      October 2026, so "Your data stays in the UK" stands on the home,
      security and about pages and nothing there needs changing. Every
      service email from App production goes through SES in London, and
      there are no real users whose data is anywhere else. What Resend
      still holds is six test contacts and the test emails sent through
      it before the switch, which go when the account is closed.

## Phase 6: Newsletter subscribers who have no account

Added on 7 October 2026. There is a list of over 800 addresses, all from
registrations for Let's Do Digital conferences and webinars, who should
get newsletters and have no Quill account. They are not given accounts:
an account is somebody who registered, verified their address and can
log in, and 800 rows of people who did none of that would muddy every
list of users and leave 800 unverified logins lying about. They are a
mailing list, and are stored as one. This phase does not wait on Phase
5.

- [x] **Settle which name they hear from.** Either, chosen for each
      newsletter: a campaign says whether it goes out as Let's Do
      Digital or as Quill Medical. It starts as Let's Do Digital and
      moves to Quill Medical in the four stages Phase 8 of the
      [Email branding plan](2026-09-25-email-branding-plan.md) sets out,
      which this phase is the means of carrying out. That plan had the
      list imported into Resend; it is held in Quill instead. So it is
      **one audience, whose sender changes**, and not two lists: a
      person has one answer to "do you want news?", whichever name is
      on the envelope. Still to find out: where the list is held now,
      and whether it has names or only addresses.

- [x] **Let a campaign carry its brand.** A campaign names its theme,
      `ldd` or `quill`, and the sender's name and address follow from
      it. Sending as Let's Do Digital needs its domain verified in SES,
      in London, as `quill-medical.com` was in Phase 1, with its DKIM
      records wherever that domain's DNS is kept. Until then a campaign
      can only be sent from `quill-medical.com`. Built so that a
      campaign's brand is the folder its template is in,
      `campaigns/quill/` or `campaigns/ldd/`: nothing is declared twice,
      and a name two brands share is refused. The theme and the sender's
      name, "Mark at Let's Do Digital", follow from it. The address
      follows too once there is one: a new setting, `EMAIL_FROM_LDD`,
      empty by default, and while it is empty a Let's Do Digital
      newsletter goes from the app's own address under the Let's Do
      Digital name. Setting it, with the domain verified in SES, is the
      part left for Mark. `ldd-trial` is a trial campaign for it.
      **Mark's note, 7 October 2026**: Let's Do Digital needs its own
      SES set up in AWS for both App production and development. To
      settle when that is done: whether that means two more AWS
      accounts, or the Let's Do Digital domain added as a second sending
      domain to the two there are, Quill Medical Emails App and Quill
      Medical Emails Dev. One SES account can send for several domains,
      and the second way keeps one key for each environment.

- [x] **Add `newsletter_subscriber`.** A table of its own: the address,
      held lower case and unique; a name if there is one; whether they
      are subscribed; when they unsubscribed, if they did; and when the
      row was made. No field for where each address came from: all of
      them came from Let's Do Digital registrations, so it would say
      the same thing 800 times.

- [x] **Let the unsubscribe link name a subscriber.** The token names a
      user by id today. It needs to name either kind, and the two
      routes and the page then work for a subscriber exactly as for a
      user, with nothing new to design. A subscriber has no
      `marketing_preference_change` history; the row's own
      `unsubscribed_at` is the record. Built as a second kind
      of token under the same signature, naming a subscriber's id where
      the first names a user's, so that subscriber 7's link cannot be
      read as user 7's.

- [x] **Send to both.** `app.marketing.newsletter` reaches account
      holders who said yes and subscribers who are subscribed. An
      address in both gets one email, and the account's answer wins:
      somebody who registered and said no is not emailed because an old
      list has them on it. `newsletter_send` records a send to a
      subscriber as it does to a user, so a run can still be repeated
      safely. The re-check just before each person's turn applies to
      subscribers too. Built with one refinement: the account's answer
      wins only once the account's address is **verified**, the same
      line the one-record rule below draws. Until then the address on
      the account may be somebody's mistyping, and the mailing list row
      goes on working. `newsletter_send` names a user or a subscriber,
      one or the other, held to that by a check in the database.

- [x] **Keep one record of somebody who is in both tables.** A person
      can be in the mailing list table and, now or later, hold a Quill
      account with the same address. Each table has its own answer to
      "do they want newsletters?". Nothing is done until the account's
      address is verified: before that it may be somebody else's
      mistyping, and the mailing list row goes on working. Once it is
      verified they are the same person, the account is the record that
      is kept, and the mailing list row is deleted. The rule for what
      the account's answer then is, agreed on 7 October 2026: **a "no"
      from the mailing list always survives; otherwise the answer given
      when registering is the one that counts.**

      - **They had unsubscribed on the mailing list** – the account is
        set to no newsletters, with a `marketing_preference_change` row
        saying it came from the mailing list, whatever the registration
        form said. Registration is an opt-out: newsletters are on
        unless a box is ticked, so somebody who had already refused and
        did not notice the box would otherwise be put back on.

      - **They had not** – the account's own answer stands, yes or no.
        It is the more recent choice.

      The same check runs once over existing accounts when the mailing
      list is imported. Closing an account later puts nobody back on
      the mailing list. Built with three things the rule did not say.
      **An account that has never been asked keeps the mailing list's
      "yes".** Where an admin or a passport invitation made the account,
      nobody has answered the question, so there is no registration
      answer to count; without this, making somebody an account would
      quietly stop the news they had asked for. They are asked when
      they first set a password, and that answer then stands. **What
      they were sent goes with them**: their `newsletter_send` rows move
      to the account, so a campaign they had as a subscriber is not sent
      to them again. **The send guards the rule as well**: an account
      whose address is on the mailing list as unsubscribed is left out
      of a send even if nothing has folded it in yet. The fold runs
      where an address becomes verified: the verification link, an
      admin creating an account, and a passport invitation accepted.

- [x] **Add a Newsletter section to the admin area.** A place of its
      own, `/admin/newsletter`, with a link in the admin menu, for
      everything to do with newsletters. For now only an operator may
      see it: the route behind `<RequireOperator>`, which shows a 404 to
      anybody else, and every route it calls behind
      `DEP_REQUIRE_OPERATOR`. A newsletter belongs to no one
      organisation, which is the test for the platform role. **This is
      expected to change**: somebody who looks after newsletters and
      nothing else will want a competency of their own, such as
      `manage_newsletters` in `shared/competency-definitions/admin.yaml`,
      and the guards then become `<RequireCompetency>` and
      `has_competency`. So gate the section in one place on each side,
      not once per page and route, and the change is two lines. Its
      first page is the mailing list import below, and the section is
      expected to grow. One thing already in mind, and **not part of
      this phase**: dropping in a Markdown file for a social push, with
      a second-level heading for each place it goes, X, LinkedIn,
      Facebook and email among them. Pages follow the admin area's
      conventions: exported from `pages/admin/adminChunk.ts`, with a
      child link in the menu while each is open, which
      `navCoverage.test.tsx` checks. **Built, with the one gate on each
      side given a name of its own**: the page sits behind
      `<RequireNewsletter>`, and the guard and the menu both read
      `mayUseNewsletter` in `frontend/src/lib/newsletter/access.ts`; the
      routes all depend on `MAY_USE_NEWSLETTER` in
      `backend/app/marketing/admin_router.py`. Both mean an operator
      today. The page also shows how many people a newsletter would
      reach now: account holders, subscribers, and subscribers who have
      unsubscribed.

- [x] **Import the mailing list from a file dropped into the app.** A
      page in the Newsletter section where an operator drops a
      spreadsheet and
      it is read into `newsletter_subscriber`. Chosen on 7 October 2026
      over a storage bucket and a command, which was the first design:
      a page is what somebody would expect to find, and it needs no
      terminal. It is as safe, given four things. **Only somebody who
      may use the Newsletter section can reach it**, an operator for
      now, and the route also checks the CSRF token. **The file is never
      kept**: it is read in memory, in the request, and nothing is
      written to disk or to storage. **Nothing from it is logged**, not
      a row and not an address. **It is bounded**: one file, a few
      megabytes at most, a few thousand rows at most, refused
      otherwise. The file itself must still never be committed, since
      this repository is public, or pasted into a chat.

      The page is built from what there is: `MediaDropzone` and
      `CertificateUploader` already take a dropped file, and the
      passport router already receives one. A CSV is read with the
      standard library. An Excel file needs a library to read it,
      `openpyxl`, which would be a new dependency: start with CSV,
      which Excel saves as, and add Excel only if saving as CSV proves
      a nuisance. Each row is taken to
      hold three things:

      - **Email** – required. Trimmed, lower-cased and checked as an
        address. A row without one is counted and left out.

      - **Name** – may be missing, and a row is fine without it.

      - **Opt in or out** – required, and read strictly: a short list
        of words for each, such as `in` and `out`, `yes` and `no`,
        `subscribed` and `unsubscribed`. Anything else is counted as
        unreadable and left out, never guessed. Somebody opted out is
        still imported, as unsubscribed, so the refusal is held and a
        later file cannot subscribe them.

      Two presses, never one. Dropping the file only checks it: the
      page shows counts and changes nothing, saying how many are new,
      how many are already there, how many would change, how many are
      opted in and out, how many rows have no address or an answer it
      cannot read, and how many addresses appear twice. Rows that
      cannot be read are listed by row number, not by content. A second
      press imports, and the file is sent again with it, since the
      first was not kept; the server checks the counts still match what
      was shown.
      **An import never turns a "no" into a "yes"**: an address already
      unsubscribed stays so, whichever file says otherwise, and where a
      file names an address twice with different answers, opted out
      wins. An opt-out in the file does switch an existing subscriber
      off. Still open, and Mark's to judge: Phase 8 of the
      [Email branding plan](2026-09-25-email-branding-plan.md) says each
      address needs a lawful basis recorded, since nobody signed up to
      a newsletter. Whether the import needs that as a fourth column is
      not decided.

      **The routes are built; the page is the step above's.** Two, both
      under `/api/newsletter`: `mailing-list/check`, which changes
      nothing, and `mailing-list/import`, which takes the file again
      with a fingerprint the check gave. The fingerprint covers the
      file and what importing it would do, so a different file, or the
      same one after the mailing list has changed, is refused. Three
      things came from looking at the shape of the real export, its
      headings and counts only, never a row. **The columns are found by
      their headings**, not their order, and the address column may be
      headed "Subscriber", which is what MailerLite calls it. **A first
      name and a last name are joined** into the one name. **A file
      with no opt in or out column is taken as everybody opted in**,
      and the check says so plainly: the real export has no such column,
      being a list of current subscribers. Where the column is there,
      it is still read strictly.

      **The page is built**, as the `MailingListImport` card on
      `/admin/newsletter`. It holds the dropped file in the browser only
      between the check and the import, and shows nothing from it but
      counts and row numbers. An import that is refused puts the file
      aside, so it has to be dropped and checked again. What is left is
      Mark's: dropping the real file in App production.

- [ ] **Send the first newsletter in batches.** Amazon watches how many
      emails bounce and how many are reported as spam, and pauses an
      account that goes over its limits. The SES account dates from 6
      October 2026, and a list of this age will hold dead addresses.
      The send command has a limit on how many it reaches in one run,
      built with "Send to both" above: `just newsletter-send app
      <campaign> "" "" 50` for the first fifty. Start small, and read the bounce and complaint figures on the SES
      account dashboard between runs. SES puts an address that
      hard-bounces on the account's suppression list and will not send
      to it again; mark those subscribers unsubscribed so the count of
      who is on the list stays true. Decided on 7 October 2026:
      **Quill reads Amazon's list before each send.** Amazon keeps an
      account's suppression list for hard bounces and for complaints,
      somebody pressing "spam", and both are switched on in both SES
      accounts. It already refuses those addresses, but never tells
      Quill, so the mailing list would go on calling them subscribed
      and a complaint, which is a refusal, would never be recorded.
      The send command reads the list first and marks each person on
      it: a subscriber is unsubscribed, and an account holder's
      newsletters are switched off with a history row saying `bounce`
      or `complaint`. It needs the app's key to be allowed one more
      thing, `ses:ListSuppressedDestinations`, in London, which reads
      and can change nothing. Chosen over hearing of each one as it
      happens, which would be the public route and signature checking
      decided against in Phase 4, for something that can wait until the
      next send. If the list cannot be read, the send says so and
      carries on, since Amazon still refuses those addresses itself. Built,
      in `backend/app/marketing/suppression.py`, and the key's policy
      has a third version allowing that one action: AWS's policy
      simulator says it may send and read the list, and may not add to
      it, remove from it or touch a contact. It is read on a dry run
      too, so the people a dry run lists are the people a send would
      reach. What is left of this step is the sending itself.

- [x] **Add the journeys this touches to the accessibility log.** The
      Newsletter section adds a link to the admin menu, and the
      unsubscribe page from Phase 4 is a new page reached with no login.
      Name the journeys in
      `docs/docs/frontend/accessibility/journeys.md` that pass through
      the navigation and the signed-out pages, and add them to the "Not
      yet run" list in `testing-log.md`, so the next round of manual
      testing covers them. Added: journeys 1 to 4 for the side
      navigation, as somebody who operates Quill, and the Newsletter
      page and the unsubscribe page each as a check of its own, since
      neither is on a journey.

## Decisions

- **SES in London, not an EU provider** – the site promises the UK, and
  SES in London is the only mainstream service that keeps the promise
  word for word. Amazon is a US company with UK data centres, which is
  the position Quill is already in with Google Cloud.

- **Convert the account AWS gave, not sign up again** – the new sign-up
  fixed the region at Stockholm. Signing up again the advanced way would
  have given one plain account with a root login. Activating advanced
  features on the account already made was chosen instead; it is
  permanent, and leaves an organisation of three accounts, a region
  policy and a console setting to keep right, all recorded in Phase 1.

- **London is enforced twice, on purpose** – the organisation's policy
  refuses every region but London for anything of Quill's, and the
  backend's key is limited to London again in Phase 2. The policy stops
  a mistake made by hand in the console; the key's own limit is what
  holds if the policy is ever loosened.

- **Quill keeps the newsletter list, not Amazon** – decided on 7
  October 2026. Amazon's unsubscribe page cannot be themed and sits at
  an Amazon address, and one contact list per account would have been
  shared by development and production. With the list in Quill's own
  database there is one record, a page in Quill's layout, less personal
  data at Amazon, and no sync to fail. The price is that nothing but
  Quill's send command stops an email to somebody who refused. The
  missing list screen, which SES has none of, stops mattering for the
  same reason: the list is the users table.

- **No webhook from Amazon, and no daily check** – both were ways of
  hearing what Amazon's list held. A webhook would have been a public
  route with a signature check written by hand, since Amazon publishes
  no Python tool for it; a daily read of the list was chosen in its
  place, and then neither was needed once there was no list to read.

- **A hard cut for the newsletter** – no setting chooses between Resend
  and Quill's own send. Production has six contacts and no real users
  yet, and a switch would mean two lists that each believe they are
  right.

- **A switch, not a cut-over** – `EMAIL_PROVIDER` lets SES be proven in
  the dev stack and then in production while Resend still works, and
  turned off again without new code. It is removed at the end.

- **An access key in Secret Manager, for now** – the simplest thing that
  works: a key that can only send from London, held where the other
  runtime secrets are. Amazon also accepts a Google service account's
  identity in place of a key, which would leave no credential to steal
  or rotate, and fits the rule of preferring identifiers to credentials.
  Worth doing once sending works; not worth holding up go-live for.

- **A separate MAIL FROM name, `mail`, not `send`** – so that Resend's
  bounce handling keeps working while both run. `send` is removed with
  Resend.

- **The shared suppression list is accepted and stated** – SES adds any
  address that hard-bounces to a list that "applies to all SES
  customers" for up to 14 days, it cannot be turned off, and Amazon does
  not say where it is held. It holds only addresses that do not work,
  briefly. Saying so in the policy is better than pretending it away.

- **The company's own mailboxes stay on Proton** – that is the company's
  correspondence, not the service, and does not bear on the hosting
  claim.
