# Amazon SES email plan

The public site says "Your data stays in the UK" on the home, security and
about pages. That is not true while Quill sends email through Resend,
which stores names, email addresses and message content in the United
States. The transfer is lawful, but the promise is not kept, and the
privacy policy drafted on 6 October 2026 has to contradict the site to be
honest. Amazon Simple Email Service (SES) in its London region,
`eu-west-2`, keeps email data in the UK, costs $0.16 per 1,000 emails
with no monthly fee and no daily cap, and keeps a contact list with
topics and its own unsubscribe handling, so the newsletter arrangement
carries over.

The outcome is every email Quill sends, service and newsletter, going
through SES in London, the newsletter list held there, Resend closed, and
the privacy policy and the site saying the same true thing. It has to be
done, or the site reworded, before the EoEETA service goes live, which is
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
      organisation, Quill-Medical, of three accounts:

      - **Quill Medical Emails** – the working account, where SES and
        the backend's key live. It was the original project.

      - **Quill-Medical Management Account** – billing and the
        organisation's policies. Its root login is `aws@`.

      - **Quill-Medical Identity Delegated Admin** – the sign-in
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

- [ ] **Put the key in Secret Manager, never in a chat or a file.** Add
      `ses-access-key-id` and `ses-secret-access-key` to the secrets list
      in `infra/main.tf` first, so the containers exist, then add the
      values by hand with `printf`, not `echo`, which leaves a trailing
      newline. Only then mount them in `infra/runtime-identities.tf` as
      `SES_ACCESS_KEY_ID` and `SES_SECRET_ACCESS_KEY`: Cloud Run refuses
      a revision that mounts a secret with no version, which is why the
      Resend secrets went in as two changes. After the infra change,
      re-run `deploy.yml` and check the serving revision.

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

- [ ] **Prove it in the sandbox before production access arrives.**
      Verify Mark's own address in SES, set `EMAIL_PROVIDER=ses` in the
      dev stack with `EMAIL_ALLOWED_RECIPIENTS` naming that address, and
      send a verification email, a password reset and a certificate.
      Check each arrives, is signed by `quill-medical.com`, and is not in
      spam.

- [ ] **Switch teaching production to SES** once production access is
      granted: set `EMAIL_PROVIDER` to `ses` in `infra/main.tf`, re-run
      `deploy.yml`, and send one real email of each kind. Resend stays
      configured, so the switch can be reversed.

## Phase 4: Move the newsletter list to SES

SES keeps a list much as Resend does: one contact list for the account
with up to 20 topics, an opt-in or opt-out per person per topic, and
"subscription management ... fully managed by Amazon SES", meaning it
adds the unsubscribe link and the one-click header, hosts the page where
somebody changes their preferences, and refuses to send to somebody who
opted out. So the shape Quill has carries over: Quill's database is the
record of every answer, and the provider holds the list.

- [ ] **Create the contact list in London** with one topic, "Newsletter",
      whose default is opted out, so nobody is subscribed by being
      added. Do it in Terraform if the AWS provider is worth adding for
      one resource, or by hand and record the names here. Replace
      `RESEND_NEWSLETTER_SEGMENT_ID` and `RESEND_NEWSLETTER_TOPIC_ID`
      with `SES_CONTACT_LIST_NAME` and `SES_NEWSLETTER_TOPIC`.

- [ ] **Rewrite the contact sync against SES.** Today
      `backend/app/marketing/resend_contacts.py` does four things over
      Resend's HTTP API: `sync_contact`, `topic_subscription`,
      `list_contacts` and `remove_contact`. Write
      `backend/app/marketing/ses_contacts.py` with the same four, on
      `create_contact`, `update_contact`, `get_contact`, `list_contacts`
      and `delete_contact`, and point `sync.py`, `reconcile.py` and the
      `marketing-reconcile.yml` workflow at it. Resend's two switches, a
      topic and a contact-level "subscribed" status, become SES's topic
      preference and `UnsubscribeAll`; set both to match, as now. Only
      the address and the name are sent, as now. Adapt
      `test_marketing_resend_sync.py` and `test_marketing_reconcile.py`.

- [ ] **Receive unsubscribes from SES.** Resend calls
      `POST /api/marketing/resend-webhook`, signed with svix headers that
      `_verified_event` in `backend/app/marketing/router.py` checks. SES
      reports a subscription change as an event on a configuration set,
      delivered through an SNS topic, which must also be in `eu-west-2`,
      to an HTTPS endpoint. Add `POST /api/marketing/ses-events`: confirm
      the SNS subscription, verify each message's signature against
      Amazon's signing certificate, and reject anything else. It is a
      public endpoint, so the signature check is the whole of its
      authentication. Then do what the old receiver did: one
      `set_marketing_preference` call, with a new source `ses` added to
      `MARKETING_PREFERENCE_SOURCES` in place of `resend`. The echo
      guard, `_is_echo`, still matters: Quill's own update comes back as
      an event. Adapt `test_marketing_webhook.py`.

- [ ] **Write the command that sends a newsletter.** This is the one
      thing SES lacks: there is no screen to compose a broadcast and
      press send. Add an admin action that takes a subject and a body,
      renders `newsletter_broadcast.html.j2`, lists the contacts opted in
      to the topic, and sends each one separately with
      `ListManagementOptions` naming the list and topic, so SES puts the
      unsubscribe link at the `{{amazonSESUnsubscribeUrl}}` placeholder.
      One recipient per send, because SES adds the link only then. Give
      it a dry run that prints who would receive it, and a required
      confirmation, because a newsletter cannot be unsent. Rewrite
      `docs/docs/backend/marketing-email.md`, which describes sending by
      hand from Resend.

- [ ] **Move the list.** Import from Quill's database, not from Resend,
      so Quill stays the source: every verified user with their current
      `users.marketing_emails` answer. Then run the reconcile and check
      that nobody who refused is opted in.

## Phase 5: Close Resend and make the documents true

- [ ] **Run both for a week, then remove Resend.** Delete the contacts
      from Resend and close the account. Remove the `resend` dependency,
      `RESEND_API_KEY`, `RESEND_CONTACTS_API_KEY`,
      `RESEND_WEBHOOK_SECRET` and the two newsletter identifiers from
      `config.py`, `infra/main.tf` and `infra/runtime-identities.tf`,
      the `resend._domainkey` record and the `send` MX and TXT records
      from `infra/dns.tf`, the old webhook route, and `EMAIL_PROVIDER`
      itself, which has done its job.

- [ ] **Update the privacy policy** in `docs/docs/legal/privacy-policy.md`
      as a new version: section 5 names Amazon Web Services, London, in
      place of Resend; section 8 loses the transfer to the United States;
      section 3 loses its mentions of Resend. Add one sentence about the
      shared suppression list: an address that hard-bounces is held by
      Amazon on a list shared across its customers for up to 14 days,
      and Amazon does not say where. Update the public pages when they
      are rendered from it.

- [ ] **Tell EoEETA** that the email provider is now Amazon Web Services
      in London, in the sub-processor list the terms plan sends them.

- [ ] **Make the public site true at go-live, whichever comes first.** If
      this plan is finished before go-live, "Your data stays in the UK"
      stands. If it is not, change it in
      `frontend/public_pages/src/pages/index.tsx`, `security.tsx` and
      `about.tsx` to what is true that day, such as "Hosted in the UK.
      Your records are stored in London", and put the stronger line back
      when Resend is gone.

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
