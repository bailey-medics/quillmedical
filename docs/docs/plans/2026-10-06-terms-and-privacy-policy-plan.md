# Terms and privacy policy plan

The registration forms now say "By creating an account you agree to our
terms of service and have read our privacy policy", and both links lead to
placeholder pages on the public site that say the text is being finalised.
Phase 1 of the [Legal links at registration](2026-10-05-legal-links-at-registration-plan.md)
plan left writing the two documents to Mark. This plan is that work. It has
to be done before the first real users register, because from that moment
the sentence binds people to terms that do not exist.

Quill is reached by two routes, and both documents have to cover both.
Somebody enrolled by EoEETA is an end user under EoEETA's agreement with
Bailey Medics: EoEETA is the data controller and Bailey Medics the
processor. Somebody who signs up directly, as an individual or an
organisation, contracts with Bailey Medics Ltd itself, which is then the
controller. The outcome is one terms of service and one privacy policy on
the public site, each with a part common to everyone and a part for each
route, written so that a future SaaS customer like EoEETA is a new section
rather than a new document.

## Phase 1: Facts the documents rest on

- [x] **Confirm the company details** from
      <https://bailey-medics.com/company-information.html>: Bailey Medics
      Ltd, company number 15604352, registered at Brooklands Place, Unit
      5, Brooklands Road, Sale, Cheshire, M33 3SD. The ICO registration
      number is not on that page and has to come from Mark, as does the
      contact email for data protection requests. The accessibility
      statement already uses <info@quill-medical.com>; use the same
      address unless Mark wants a separate one. Both documents name Bailey
      Medics Ltd trading as Quill Medical, so that the name on the site
      matches the legal entity behind it. The drafts of 6 October 2026
      carry all of this. The ICO registration reference, ZC262758, went
      into the privacy policy's summary and section 1 on 6 October 2026.
      Bailey Medics is not VAT registered, so the terms say so and add no
      VAT to prices; the effective date of both documents is 6 October
      2026, Mark's decision the same day. No placeholders remain.

- [x] **List what the platform actually holds about a person,** from the
      models rather than from memory, so the privacy policy is true. In
      `backend/app/models.py`: `User` (name, email, username, Argon2
      password hash, marketing preference, active flag),
      `MarketingPreferenceChange` (when and how the marketing choice was
      made), `PushSubscription`, `Feedback`, and the org unit membership
      rows that say which centre somebody belongs to. In the teaching
      modules: `ModuleEnrolment`, `Assessment` and `AssessmentAnswer`
      (every attempt, answer and score, kept because delegates re-pass
      every three years and the latest attempt is what the centre sees).
      In the passport modules: `Passport`, `PassportSignOffRequest` and
      `PassportAssessorInvite`. The clinical side (HAPI FHIR, EHRbase)
      holds patient data only for the demo and is not offered to anyone
      yet, so the policy says clinical records are out of scope until the
      clinical service launches, at which point this plan gets a phase.
      Done on 6 October 2026 by reading the models and the passport and
      marketing docs. Corrections to the list above: the passport also
      holds a profile with professional registrations, logbook entries,
      declared certificates, CPD entries, evidence files and reflections,
      and the reflections are holder-only by design
      (`backend/app/features/passport/records.py`); `Feedback` holds the
      page, release, viewport, browser and the pages visited just before;
      registration also records the organisation, site and module chosen;
      there is no stored sign-in log, only in-memory rate limiting; and
      there is no audit table, the passport's git history being the audit
      trail for passport records.

- [x] **List the sub-processors.** Google Cloud Platform in `europe-west2`
      (London) for hosting, the database, content, uploads, logs and
      monitoring, from `infra/`; Resend for service email and the
      newsletter list, from the backend. Nothing else receives personal
      data: the public site counts visits from server logs with no
      analytics vendor (the cookie policy says so, and the first version
      of this plan wrongly assumed Plausible), and the Slack alerts in
      `infra/` carry uptime status only. Resend stores everything in the
      United States, so it is the one transfer the privacy policy has to
      explain, which section 8 of the draft does with the UK Extension
      and the UK Addendum named together. Done on 6 October 2026. Still
      to confirm with the contracts: the exact Google and Resend
      contracting entities and Resend's own retention of delivery
      records, both left unnamed in the draft rather than guessed.
      **Changed on 7 October 2026: Resend is gone.** Email goes through
      Amazon SES in London (`eu-west-2`), so the list is Google Cloud
      for the service, Amazon Web Services for sending email, and Proton
      for the company's own mailboxes, and nothing the service holds
      leaves the UK. Amazon holds no newsletter list: that is Quill's
      own table. Amazon's data processing addendum and its UK GDPR
      addendum are part of the AWS Service Terms and have applied since
      the account was opened on 6 October 2026. Still to confirm: the
      exact Google and Amazon contracting entities.

- [x] **Cover the transfer of email data to the United States,** for as
      long as Resend is used. Phase 5 moves email to Amazon SES in London,
      after which this step falls away. **It fell away on 7 October
      2026**, when Resend was removed: no email data goes to the United
      States, so there is nothing to tell EoEETA about a transfer and no
      transfer risk assessment to write. Ticked as closed, not as done.
      One rule below outlives it and is not a task: nothing clinical,
      and nothing about a person's health, in any email. What follows is
      the record of how it stood while Resend was used. Resend
      stores everything in the US: its own page says it "stores customer
      data in the United States, including message content, delivery
      logs, webhook payloads, and account records", and that the sending
      region chosen for a domain "does not control where data is stored"
      (checked on 6 October 2026). No new contract is needed. Resend's
      data processing addendum is "in force for every Resend account" and
      "fully executed once you sign up", it carries the standard
      contractual clauses with "UK transfers use the UK Addendum", and
      Resend is certified under the UK Extension to the Data Privacy
      Framework. Four small things remain:

      - [x] **Say so in the privacy policy.** Section 8 of the draft
            names the transfer and both safeguards, and says how to ask
            for a copy.
      - [x] **Tell EoEETA.** A safeguard applies, but EoEETA should know
            that the email provider is in the US. This is the
            sub-processor list in Phase 4, which now says so. Not
            needed: the list in Phase 4 now names Amazon in London.
      - [x] **Keep patient and health detail out of every email.** A
            standing rule, kept whoever sends the email. Emails
            carry a name, an address and things like a certificate or a
            reset link, which is low risk, and that is how Quill works
            today. Hold to it as new emails are added: nothing clinical,
            and nothing about a person's health, in a subject or a body.
      - [x] **Write the transfer risk assessment.** Not needed: there
            is no transfer that relies on contractual clauses. The
            regulator expects
            a short written note assessing the risk of a transfer that
            relies on contractual clauses. For names and email addresses
            going to a certified US provider it is about a page: what is
            sent, why, to whom, which safeguards apply, and why the risk
            to the people concerned is low. Keep it in
            `docs/docs/legal/` beside the policy, and revisit it if the
            Data Privacy Framework changes or the emails start to carry
            more.

- [ ] **Settle the retention periods, as soon as possible and before
      go-live.** They are not decided anywhere: `todo.md` still lists
      "Define data retention periods for UK GDPR compliance" as open, and
      the analytics and feedback plans both defer to it. The privacy
      policy must state a period for each kind of data, and the draft
      carries proposed figures that nobody has agreed. Each line below
      needs a yes or a different number from Mark. Whatever is agreed
      goes into section 3 and section 7 of the privacy policy, and where
      the code does not yet do it, becomes a backend task.

      - **Server logs - settled at 30 days** on 6 October 2026, which
        is what the log bucket and the analytics archive already keep
        (`var.retention_days` in `infra/modules/analytics`). The draft
        said 90 and now says 30.
      - **Feedback - two figures disagree.** The draft says two years.
        The [User feedback](2026-09-20-user-feedback-plan.md) plan left
        it open at "ninety days unless use suggests otherwise". Nothing
        deletes feedback today. Decide which.
      - **Accounts after closure - nothing is deleted today.** The draft
        says two years after an account is closed. `is_active` is a soft
        delete, so a closed account is kept for ever. The public security
        page already promises "complete deletion upon account closure",
        which is not true. Decide the period, then either build the
        deletion or correct that page.
      - **Training records where Bailey Medics is the controller.** The
        draft says two years after the account is closed. Delegates
        re-sit every three years, so two may be too short. Decide.
      - **Training records held for a sponsor.** The draft says "as your
        sponsor instructs". EoEETA has given no period. Ask EoEETA for
        one, so the policy's statement has something behind it.
      - **The record of each marketing answer.** The draft says six years
        after the last answer. Decide.
      - **Assessor invitations that were never accepted.** The draft says
        90 days after they expire. Nothing deletes them today. Decide.
      - **Requests, complaints and correspondence.** The draft says six
        years. Decide.
      - **Database back-ups.** Not in the draft at all. Seven daily
        back-ups are kept, checked on the live database on 8 October
        2026, and not the thirty this step first said: thirty applies
        only to an environment named `prod`, and there is none. Data
        deleted from the live database survives in them until they roll
        off. The figure is expected to rise, so the policy should say so
        in one sentence once Phase 2 of the
        [Disaster recovery](2026-09-17-disaster-recovery-plan.md) plan
        has settled it.

- [ ] **Build what the agreed periods need.** Nothing above is enforced
      in code except the 30-day log expiry. Each agreed period that
      differs from "kept for ever" needs a scheduled deletion, and the
      privacy policy must not be published promising one that does not
      run. Plan this once the figures are settled, and tick the
      retention entry in `todo.md` then.

## Phase 2: Write the terms of service

- [x] **Draft the terms in Markdown first,** in
      `docs/docs/legal/terms-of-service.md`, so they can be reviewed as
      text before being rendered. Drafted on 6 October 2026, for Mark's
      review: 31 numbered clauses in three parts,
      with a plain-English summary first and a cancellation form last,
      and the research findings below worked in (Slack's precedence
      sentences, the reflection and sign-off clauses no vendor has, the
      consumer wording from Geeky Medics and TeachMeSeries, the
      DMCC-ready renewal terms). Four product promises in it are not
      built yet and must exist before the terms go live or before the
      feature does: re-acceptance at sign-in after a material change
      (clause 15.2), a public archive of earlier versions (15.3), renewal
      reminders and one-message cancellation (27), and the 14-day
      sequence at checkout (25). Structure, in this order:

      - **Who we are and definitions** - Bailey Medics Ltd trading as
        Quill Medical; "Customer", "End user", "Sponsoring organisation".
      - **Part A, common terms** - the account (one per person, accurate
        details, keep the password secret, two-factor where offered),
        acceptable use (no sharing of accounts, no scraping, no uploading
        of patient-identifiable data into teaching features), intellectual
        property (Quill's software is ours; teaching content belongs to
        whoever supplied it; the user's own answers and reflections stay
        theirs with a licence to us to process them), availability (no
        uptime promise beyond reasonable efforts, maintenance windows),
        suspension and termination, liability (capped, with the
        statutory exclusions that cannot be excluded under English law),
        changes to the terms (notice, and the "Last updated" date as the
        record of version), governing law (England and Wales, exclusive
        jurisdiction of its courts).
      - **Part B, users of a sponsoring organisation** - written for
        EoEETA's members today and for any later organisation. The
        organisation's agreement with Bailey Medics governs; these terms
        sit beneath it; the organisation controls enrolment, access and
        withdrawal; results are visible to the organisation; the user has
        no direct payment relationship with us; what happens to the
        account when the organisation's agreement ends.
      - **Part C, direct customers** - individuals and organisations
        contracting with Bailey Medics directly. Ordering and payment,
        subscription term and renewal, the 14-day cancellation right for
        consumers under the Consumer Contracts Regulations 2013 and the
        express request to start service within that period, price
        changes, refunds, the Consumer Rights Act 2015 wording for digital
        content. For a direct organisation, a pointer to the separate SaaS
        agreement and data processing terms in Phase 4.

- [ ] **Give the page a visible "Last updated" date** as a constant at
      the top of the page file, the way `REVIEWED` is in
      `accessibility-statement.tsx`, because until acceptance is recorded
      per person that date is the only record of which terms somebody
      was shown.

## Phase 3: Write the privacy policy

- [x] **Draft the privacy policy in Markdown,** in
      `docs/docs/legal/privacy-policy.md`, following the ICO's checklist
      for privacy information under UK GDPR Articles 13 and 14. Drafted on
      6 October 2026, for Mark's review: it opens
      with which situation the reader is in, carries the
      residual-controller section nobody else writes, maps every purpose
      to its basis and retention, names Resend's transfer with both
      safeguards, describes the DUAA complaints route and names the
      Information Commission. Two points Mark must settle: the
      newsletter is an opt-out at registration, so the draft rests it on
      legitimate interests plus the PECR soft opt-in, and whether a free
      registration counts as "negotiations for a sale" is the open
      question the research recorded; and the regulator's name, which the
      research found changed on 30 September 2026. In this order:

      - **Who is responsible for your data** - the one section that
        differs by route, so it comes first. If you use Quill through a
        sponsoring organisation such as EoEETA, that organisation is the
        controller and Bailey Medics processes your data on its
        instructions; its own privacy notice applies and requests about
        your data go to it, though we will help. If you signed up
        directly, Bailey Medics Ltd is the controller. ICO registration
        number and contact details for both cases.
      - **What we collect and why** - one bullet per purpose, each with
        its lawful basis: running your account (contract), assessment
        results and progress (contract, and legitimate interests of the
        sponsoring organisation in training its members), security logs
        (legitimate interests), marketing emails (consent, which can be
        withdrawn at any time; this is where the registration tick box from the
        [Marketing opt-out](2026-10-03-marketing-opt-out-plan.md) plan
        is explained), feedback you send us (legitimate interests), push
        notifications (consent, through the browser). State that no
        special category data is collected by the teaching service, and
        that patient data is out of scope until the clinical service
        launches.
      - **Who we share it with** - the sub-processor list from Phase 1,
        the sponsoring organisation where there is one, and the
        circumstances in which the law requires disclosure. No selling
        of data, no advertising.
      - **Where it is held** - Google Cloud, London region; any transfer
        outside the UK named with its safeguard.
      - **How long we keep it** - the periods settled in Phase 1.
      - **Your rights** - access, rectification, erasure, restriction,
        portability, objection, withdrawing consent, and the right to
        complain to the ICO, with the ICO's address and
        <https://ico.org.uk>. For organisation users, that the request
        goes to the organisation and we act on its instruction.
      - **Cookies** - one sentence pointing at the existing cookie policy
        at `/cookie-policy`, which already lists the four strictly
        necessary cookies.
      - **Children** - Quill is for healthcare professionals and not
        offered to anyone under 18.
      - **Changes to this policy** - and the "Last updated" date.

- [x] **Check the policy against the code paths that collect data.**
      Every form that takes personal data (`RegistrationForm.tsx`,
      `ResetPasswordForm.tsx` on an invite, the feedback form, the push
      notification button) should be describable by a paragraph of the
      policy. Anything the code collects that the policy does not mention
      is either added to the policy or removed from the code. Done on
      6 October 2026: registration is section 3.1 and 3.6, the invite
      password form 3.6, feedback 3.8, notifications 3.7, the assessor
      invitation 3.5, the marketing switch and Resend sync 3.6, and the
      passport export the portability right in section 10. Nothing the
      code collects is missing from the draft.

- [x] **Revise the draft for the move to Amazon SES.** Done on 7 October
      2026, in place: version 1.0 had never been published, so it was
      corrected and not given a new number, and
      `docs/docs/legal/index.md` says so. The summary at the top no
      longer names the United States. Sections 3.3 and 3.6 name Amazon
      Web Services in London in place of Resend, and 3.6 says the
      newsletter list is Quill's own with no copy at the email provider,
      that a choice applies straight away, and that a bounce or a spam
      report switches newsletters off. Section 5 lists Amazon in place
      of Resend. Section 8.2 loses the transfer and both safeguards, and
      states the one exception: an address that hard-bounces goes on a
      list Amazon shares across its customers for up to 14 days, held
      Amazon does not say where. Section 7 gains a line for it. The
      terms of service name no email provider and did not change. For
      Mark to read in Phase 6: section 8.2 rests that exception on
      Amazon's data processing terms, and their wording on transfers
      should be checked against <https://aws.amazon.com/service-terms/>.

- [x] **Cover newsletter subscribers who have no account.** Phase 6 of
      the [Amazon SES email plan](2026-10-06-amazon-ses-email-plan.md)
      adds `newsletter_subscriber`: over 800 people from Let's Do
      Digital conference and webinar registrations, holding an address,
      perhaps a name, and whether they are subscribed. Drafted on
      7 October 2026 as section 3.11 of the privacy policy, from how
      that plan manages them: a list apart from accounts, with no login;
      the unsubscribe link working with no account; a bounce or a spam
      report unsubscribing them; a refusal kept so that a later import
      cannot undo it; and the row deleted once the same address holds a
      verified account, with any "no" carried across. Section 1 now
      names Let's Do Digital as a trading name of Bailey Medics beside
      Quill Medical, which Phase 8 of the
      [Email branding plan](2026-09-25-email-branding-plan.md) asks for,
      and section 7 gains a line. The lawful basis is the one that plan
      sets out: legitimate interests, with PECR met by the address being
      a work one or by the soft opt-in at a booking.

- [ ] **Make section 3.11 true before the first newsletter to the
      list.** It says only work addresses and soft opt-in addresses are
      emailed. Nothing enforces that yet: the import takes every row in
      the file as opted in, and the sorting in Phase 8 of the Email
      branding plan is not done. Either sort the file before it is
      imported, leaving out the addresses with no basis, or reword 3.11.
      Write the short legitimate interests assessment that plan asks for
      and keep it in `docs/docs/legal/`. Check what the booking forms
      said before relying on the soft opt-in. The Let's Do Digital
      privacy notice needs the same "trading as" sentence.

## Phase 4: The SaaS agreement and data processing terms

The agreement with EoEETA is the starting point for every later
organisation customer, and the terms and privacy policy both lean on it.
It is not a public page, and its contents are not recorded here.

- [x] **Decide with Mark whether EoEETA already has a signed agreement.**
      Answered on 6 October 2026: a SaaS agreement with EoEETA is already
      signed. So the template below is built from it rather than from
      scratch.

- [x] **Read the signed EoEETA agreement** and bring the drafts into line
      with it. Read on 6 October 2026 from a copy kept outside the
      repository; it must never be committed. Three things came of it.
      The agreement requires every user to accept an end user agreement,
      and the terms of service are that agreement, which Part B now says
      in clause 17.2. Its service description sends a copy of each
      certificate to the sponsor's named person and tells a delegate
      when an assessment is due again after three years, and both
      documents now mention each. And the privacy policy describes our
      role as acting "under the data protection terms of our agreement"
      with the sponsor, which is the wording that matches what was
      signed.

- [ ] **Confirm the go-live date with EoEETA in writing**, signed by both
      parties, so that both sides count the year of service from the
      same day. Do it before go-live.

- [ ] **Send EoEETA the sub-processor list**, Google Cloud and Amazon
      Web Services, saying what each does and where its data sits, so
      that it matches the privacy policy: Google Cloud in London for the
      service, and Amazon SES in London for sending email. Rewritten on
      7 October 2026, when Resend was removed; it had said that Resend
      stored email data in the United States under two safeguards. Say
      plainly the one thing that is not certain to be in London: an
      address that hard-bounces sits on a list Amazon shares across its
      customers for up to 14 days. Keep a copy.

- [ ] **Write down the back-up policy and the support policy**: what is
      backed up, how often, how long back-ups are kept and how a restore
      is requested; and the support hours, channel and response times.

## Phase 5: Move email to Amazon SES in London

Decided on 6 October 2026. The live public site says "Your data stays in
the UK" on the home, security and about pages, and that is not true while
email goes through Resend, which stores names, addresses and message
content in the United States. The transfer is lawful (Phase 1), but the
site's promise is not kept, and it contradicts the privacy policy. Amazon
SES in its London region is the one mainstream service that keeps email
data in the UK, at $0.10 per 1,000 emails with no daily cap, so it makes
the claim true as written. Google Cloud has no email service of its own.

**Done on 7 October 2026, and not quite as written here.** The working
document became the [Amazon SES email plan](2026-10-06-amazon-ses-email-plan.md),
which records each step. Every email, service and newsletter, goes
through SES in London, and Resend is out of the code. The steps below are
ticked with what happened to each. The one design that changed: the
newsletter list did not move to an SES contact list. Quill keeps it in
its own database, so Amazon holds no list, there is no sync and no
webhook. What is left is closing the Resend account, which that plan
tracks.

- [x] **Confirm what SES keeps in London** before building on it.
      Checked against Amazon's documentation on 6 October 2026, and the
      choice holds, with one exception to state openly.

      - **London is a full SES region.** `eu-west-2` has its own API,
        SMTP, receiving and feedback endpoints, and Amazon's general
        commitment applies: "You choose the AWS Region(s) in which your
        content is stored" and "We will not move or replicate your
        content outside of your chosen AWS Region(s) without your
        agreement".
      - **Everything Quill would set up is per region.** Verified
        domains, sandbox status, sending limits, credentials, and the
        account-level suppression list, which "applies to your AWS
        account only in the current AWS Region". Notification topics
        "have to be in the same region where you use SES". So the rule
        for the build is simple: create every SES and notification
        resource in `eu-west-2` and nothing anywhere else.
      - **The exception is the global suppression list.** When an email
        hard-bounces, SES adds that address to a list that "applies to
        all SES customers", for up to 14 days. It "is enabled by default
        for all SES accounts. You can't disable it", and the
        documentation does not say where it is held. It holds only the
        address that bounced, briefly, and only for addresses that do not
        work. The privacy policy should mention it in a sentence.
      - **Not answered by the documentation:** where the contact list is
        held is not stated in terms, though it is a resource of the
        regional API; and Amazon's account information (the AWS account
        holder's own name, email and billing details) is handled
        separately from content and is not tied to the region. Ask AWS
        support about the first when the account is open.
      - **Amazon scans what it sends.** "We scan all messages that
        contain attachments to check for viruses", and filters for spam.
        Normal for a mail service, and worth knowing.

- [x] **Open the AWS account and ask for production access early.**
      Opened and granted on 6 October 2026. A
      new SES account starts in a sandbox that sends only to verified
      addresses. Moving out of it needs a request to Amazon describing
      what is sent, and takes a day or more. Do it weeks before go-live,
      not days. Accept Amazon's data processing addendum at the same
      time and record that it is in place.

- [x] **Add the sending records in Terraform,** in `infra/dns.tf`: the
      SES DKIM records for the sending domain, beside the Resend one for
      now. The SPF record already includes `amazonses.com`. Keep the
      credentials in Secret Manager, the way `resend-api-key` is held in
      `infra/runtime-identities.tf`.

- [x] **Send service email through SES.** App production switched on
      7 October 2026. Every service email goes
      through `send_email` in `backend/app/email_send.py`, and only about
      twenty-five lines of it are Resend's: setting the key, building the
      parameters and the send call. Replace those with the SES call,
      pinned to the London region, and keep everything around them (the
      allow-list, the rate limit, the templates, the attachments).
      Update `backend/tests/test_account_emails.py` and the other email
      tests that mock the send. This alone gets verification emails,
      password resets, invitations and certificates out of the US.

- [x] **Move the newsletter list to an SES contact list.** Not done,
      on purpose, and ticked as closed: the alternative this step
      rejects is what was built. Amazon's unsubscribe page cannot be
      themed, and one contact list per account would have been shared by
      development and production, so the list stays in Quill's database
      and the unsubscribe page is Quill's own. SES keeps a
      list much as Resend does (checked against Amazon's documentation on
      6 October 2026): one contact list for the account with up to 20
      topics, an opt-in or opt-out per person per topic, an import from a
      file, and "subscription management ... fully managed by Amazon
      SES", meaning it adds the unsubscribe link and the one-click
      header, hosts the page where somebody changes their preferences,
      and "does not allow email sending to the contact for that topic or
      list in the future" once they opt out. So the shape Quill already
      has carries over: a "Newsletter" topic, Quill's database as the
      record of each answer, and SES holding the list. Rewrite
      `backend/app/marketing/resend_contacts.py` against the SES contact
      calls, keep `sync.py`, `reconcile.py` and the
      `marketing-reconcile.yml` workflow pointing at it, and adapt their
      tests. Rejected: keeping the list only in Quill's database, which
      means building the unsubscribe page SES already hosts; and leaving
      the list on Resend, which keeps a US processor and stops the site
      saying all data stays in the UK.

- [x] **Receive unsubscribes from SES.** Not needed, with no list at
      Amazon to hear from. Bounces and spam reports are read from
      Amazon's suppression list before each send. Resend calls a signed webhook,
      `POST /api/marketing/resend-webhook` in
      `backend/app/marketing/router.py`. SES reports the same event
      through a configuration set's notifications, which arrive in a
      different form with a different way of proving who sent them.
      Replace the receiver and its signature check, and keep what it does
      with the answer: one `set_marketing_preference` call with a new
      source in place of `resend`.

- [x] **Write the command that sends a newsletter.** Built, with
      Quill's own unsubscribe link in place of Amazon's. This is the one
      thing SES lacks: there is no screen to compose a broadcast and
      press send. A newsletter becomes a command that lists the contacts
      opted in to the topic and sends each one the rendered
      `newsletter_broadcast.html.j2`, naming the contact list and topic
      so that SES adds the unsubscribe link at the
      `{{amazonSESUnsubscribeUrl}}` placeholder. One recipient per send,
      because SES adds the link only then. Update
      `docs/docs/backend/marketing-email.md`, which describes sending by
      hand from Resend.

- [ ] **Move the list and close the Resend account.** Nothing was
      moved: the list is the users table, and Resend held six test
      contacts. Resend's code, DNS records and secrets were removed on
      7 October 2026. Tick this when the account itself is closed.
      Import the contacts
      with each person's answer, from Quill's database and not from
      Resend, so that Quill stays the source. Check that nobody who
      refused is opted in. Then delete the contacts from Resend, remove
      its DNS record, secrets and webhook, and close the account.

- [x] **Update the privacy policy and tell EoEETA.** The policy was
      revised on 7 October 2026, the step added to Phase 3. Telling
      EoEETA is the sub-processor list in Phase 4, now rewritten.
      Section 5 names
      Amazon Web Services (London) in place of Resend, section 8 loses
      the transfer to the United States and says nothing leaves the UK,
      and section 3 loses its mentions of Resend. The transfer step and
      the risk assessment in Phase 1 fall away once Resend is closed. The
      sub-processor list sent to EoEETA in Phase 4 names AWS.

- [x] **Make the public site true at go-live, whichever comes first.**
      True on 7 October 2026, so the wording stands. If
      this phase is finished before go-live, the wording stands. If it is
      not, change "Your data stays in the UK" in
      `frontend/public_pages/src/pages/index.tsx`, `security.tsx` and
      `about.tsx` to say what is true that day, and put it back when
      Resend is gone.

- [ ] **Check the teaching slides for YouTube.** A slide can embed a
      YouTube video, and a learner who plays one sends their IP address
      to Google. If any live module does, either host the video (the
      hosted player exists) or name YouTube in the privacy policy and
      stop saying nothing leaves the UK.

## Phase 6: Review and publish

- [ ] **Read both drafts end to end and settle what is still open**
      before they go live: the bracketed facts (effective date, ICO
      registration number, VAT number, payment processor), the retention
      periods proposed in Phase 1, and the open questions listed under
      "Questions still open" in the research below. Mark reviews these
      himself; no outside review is planned. The liability cap, the
      consumer cancellation wording and the processor terms are the
      clauses to read most slowly.

- [ ] **Publish before go-live.** The EoEETA service goes live when the
      app is finished, which Mark expects three to six weeks from
      6 October 2026, so between late October and mid November. The
      registration forms already link to the two public pages, and from
      the first real registration the sentence above the button binds
      people to whatever those pages say. Everything in this phase has to
      be done by then.

- [ ] **Render the terms and privacy policy on the public site,**
      replacing the placeholders in
      `frontend/public_pages/src/pages/terms-of-service.tsx` and
      `frontend/public_pages/src/pages/privacy-policy.tsx`. Use the
      `Section`, `List` and `Link` parts from
      `frontend/public_pages/src/statementParts.tsx`, which the
      accessibility statement already uses for long sectioned text, so
      the three legal pages look alike. Keep the hero at the top with a
      one-paragraph summary in plain English, then the dark background
      for the sections. Numbered clauses in the terms so they can be cited.

- [ ] **Keep the Markdown and the page in step.** The Markdown in
      `docs/docs/legal/` is the reviewed text; the page is its rendering.
      Add a note at the top of each page file saying where the source is
      and that the two must change together, as the accessibility
      statement does for its evidence.

- [ ] **Deploy the public site** and check
      <https://quill-medical.com/terms-of-service> and
      <https://quill-medical.com/privacy-policy>, then follow the link
      from the registration form to each and confirm it lands on the real
      text with the "Last updated" date visible.

- [ ] **When payments launch, name the payment processor** in clause 28
      of the terms and section 5 of the privacy policy, as a new version
      of each. Mark expects Stripe but has not chosen yet (6 October
      2026), so the terms promise only to name it on the order page.

- [ ] **Tick Phase 1 of the Legal links at registration plan,** whose
      four steps this plan completes.

## Decisions

- **One document per kind, with a part per route** - rather than separate
  EoEETA and direct terms. The registration sentence links to one address
  for each, the common clauses are most of the text, and a second
  sponsoring organisation becomes a sentence in Part B rather than a new
  page. The privacy policy has only one section that differs by route,
  who the controller is, so it leads with that.

- **EoEETA is controller, Bailey Medics is processor** - confirmed by Mark
  on 6 October 2026. This is the usual shape for a membership body's
  training platform: EoEETA decides who is trained and why, Bailey Medics
  runs the system. It means EoEETA's members get their Article 13
  information from EoEETA, and our policy says so rather than pretending
  to be the controller of data it only holds on instruction.

- **Direct customers may be individuals** - so Part C carries consumer
  law, which the organisation route does not need. A direct organisation
  customer gets the SaaS agreement from Phase 4, the same as EoEETA.

- **Source text lives in `docs/docs/legal/` as Markdown** - a reviewer
  reads and marks up text, not TSX. The page is a rendering of the
  reviewed text, not the other way round.

- **Clinical records are declared out of scope for now** - the FHIR and
  EHRbase services hold demo data only and are not offered to any
  customer. Writing patient-data terms before there is a patient-data
  service would be guessing, and they will need a DPIA and a clinical
  safety case of their own when the time comes.

- **Email moves to Amazon SES in London, not to an EU provider** - the
  public site promises that data stays in the UK, and SES in London is the
  only mainstream service that keeps that promise word for word. An EU
  provider such as Brevo was the alternative, at the price of weakening
  the claim to "UK and EU". SES keeps a contact list with topics and
  handles unsubscribes itself, so the newsletter arrangement was
  expected to carry over; on 7 October 2026 that was set aside and
  Quill keeps the list itself, for the reasons in Phase 5. Amazon
  is a US company with UK data centres, which is the position Quill is
  already in with Google Cloud. Cost played no part: SES is $0.10 per
  1,000 emails, and Resend's free plan is 3,000 a month capped at 100 a
  day, a cap that would have bitten on the day EoEETA invites its
  delegates.

- **The company's own mailboxes do not bear on the UK hosting claim** -
  Quill's mailboxes are on Proton, a Swiss company (the MX records in
  `infra/dns.tf`), so an email somebody sends to the support address is
  held there. That is the company's correspondence, not the service, and
  nobody reads "hosted in the UK" as covering a supplier's inbox. The
  privacy policy names Proton in sections 5 and 8, relying on the UK's
  adequacy regulations for Switzerland, and that is all it needs. What
  does bear on the claim is the service's own sending, which Phase 5
  deals with.

- **Reflections stay holder-only, and the terms say so** - the passport
  already keeps reflections readable by the holder alone, and the drafts
  state that as a promise rather than hedging it, alongside the plain
  statement that reflections are not legally privileged. A sponsor that
  wants to read reflections is asking for a product change, not a
  wording change.

- **The drafts name the regulator as the Information Commission** -
  checked on 6 October 2026 against SI 2026/1015, made on 10 September
  2026, which from 30 September 2026 brought into force the abolition of
  the office of Information Commissioner and the transfer of its
  functions to the Information Commission. The regulator's own website
  still calls itself "the ICO", so the policy gives both. Its postal
  address and telephone number were left out, because its contact page
  showed neither on the day and the website is enough.

## Research: how comparable UK platforms write theirs

Done on 6 October 2026, before Phase 1 starts, so the drafts can borrow
from documents that already survive NHS procurement rather than from a
generic template. Six strands were researched in parallel across the live
web: UK clinical e-portfolio suppliers, medical e-learning and question
bank sellers, NHS and Royal College notices, dual-route SaaS architectures
(UK first, international only for patterns), the healthcare-specific
clauses a template misses, and the legal position on the day. About fifty
terms, privacy, data processing and guidance documents were read, each
recorded with its URL and stated date; quotes below are short and
verbatim. The full report (13,500 words, 400 citations) is kept outside
the repository for now. The phases above are unchanged until these
findings have been reviewed.

### Who was read

- **Clinical e-portfolios** - risr/ (Fry-IT Ltd, formerly Kaizen: MSA
  and DPA of 26 August 2026, website privacy policy still dated 2018),
  FourteenFish (user terms undated, EMIS G-Cloud master terms of May 2024,
  privacy policy now redirected to Enlivio and unreadable), Clarity and
  Agilio (a complete legal centre dated 14 to 21 September 2026),
  Myprogress (MyKnowledgeMap product privacy policy v2.0 of 2 February
  2026), PebblePad, Horus, ISCP (terms of January 2020), JETS and JAG at
  the RCP, NHS ePortfolios, Turas and L2P.

- **E-learning and question banks selling to individuals** - Pastest,
  Passmedicine, Quesmed (privacy policy of 22 September 2026), BMJ
  Learning and OnExamination, Geeky Medics, MedAll, Mind the Bleep, Zero
  to Finals, TeachMeSeries, eIntegrity (the only in-scope seller of an
  endoscopy course to individuals), Red Whale, Doctors.net.uk, the MDU
  and the MPS. Medisense is offline.

- **UK clinical SaaS** - Accurx (terms of 5 August 2026, DPA v11.1 of
  15 September 2026), Patchwork, Locum's Nest, Induction, Pando, Lantum.

- **Controller-side notices and NHS requirements** - NHS England elfh and
  Learning Hub, JETS and JAG, RCP, RCGP, RCS England, RCPCH, JRCPTB,
  Scotland Deanery, NES, the NHS Standard Contract 2026/27, DSPT standard
  10 and DTAC v2.

- **International architecture examples, under non-UK law** - Slack,
  GitHub, Atlassian, Microsoft, Google Workspace for Education, Kahoot!,
  Zoom, Teachable, Instructure.

### Document architecture and precedence

- **Nobody publishes a three-part document.** Three architectures exist:
  one public terms document with role-based parts and the organisation's
  contract off the page (Accurx, Patchwork, MedAll, Kahoot!); a customer
  agreement plus a thin user document (Slack, GitHub, Atlassian, and
  risr/, which has no public end-user terms at all); or a consumer
  document beside a separate institutional licence (BMJ, PebblePad,
  FourteenFish). Accurx is the closest to what this plan chose. See the
  [Accurx terms](https://www.accurx.com/terms-and-conditions) and the
  [Slack user terms](https://slack.com/terms-of-service/user).

- **User-side precedence wording to borrow is Slack's** - "if there is a
  conflict or inconsistency between the Contract and the User Terms, the
  terms of the Contract will first prevail, followed by the provisions in
  these User Terms", with a capitalised line that it is solely the
  customer's responsibility to tell users its policies and obtain their
  consents. Kahoot! adds the claiming moment Quill will need when a direct
  account becomes a sponsored one: the organisation owning the email
  domain "may assume control over and manage your use". See the
  [Kahoot! terms](https://trust.kahoot.com/terms-and-conditions/).

- **Business-side precedence runs Order Form, then DPA for personal data,
  then schedules, then the main terms** - Accurx clause 1.4, the risr/
  MSA and Agilio's 2026 waterfall all do this. The 2024 Clarity MSA
  inverts it and MedAll states no hierarchy at all. See the
  [Agilio general terms](https://agiliosoftware.com/legal-centre/general-terms/).

- **"Sponsor" is used by nobody.** The market says "Customer" and
  "Authorised User" (Slack, Accurx) or "End User" (GitHub, Google), so
  Quill must define its own term rather than assume it is understood.

- **Plain-English summaries are rare** - only FourteenFish's six-bullet
  "quick summary" and Agilio's closing glossary. Visible version numbers
  are rarer still: Myprogress ("Version 2.0, effective 02.02.2026"), the
  Clarity MSA ("V2.1") and the RCPCH notice ("v4.7"). See the
  [FourteenFish terms](https://www.fourteenfish.com/terms).

### Controller and processor wording

- **The four-sentence paragraph is international, not UK.** GitHub: with
  an organisation-provided account "the organization becomes the Data
  Controller ... GitHub functions as a Data Processor", a DPA governs,
  and "please refer to the privacy statement of the organization
  providing your account". Microsoft: "Your organisation controls your
  account" and "Direct any privacy questions or requests ... to your
  administrator". Kahoot! splits by route in one sentence: through an
  organisation it is a processor, "For all other processing purposes ...
  a controller". See the
  [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
  and the [Kahoot! privacy policy](https://trust.kahoot.com/privacy-policy/).

- **Two UK peers now match it.** Quesmed (22 September 2026): controller
  for direct use, where an institution provides access "that organisation
  may be the controller ... and Quesmed may act as its processor",
  institutional administrators receive "agreed usage, engagement,
  progress or assessment information", and rights requests may be
  referred to the institution. Myprogress v2.0: "Your university or
  employer is the data controller ... MyKnowledgeMap acts as a data
  processor", with platform analytics kept as its own controller purpose.
  See the [Quesmed privacy policy](https://quesmed.com/privacy-policy/)
  and the
  [Myprogress product privacy policy](https://www.myknowledgemap.com/product-privacy-policy).

- **Slack's residual-controller split is the cleanest** - "Customer Data"
  processed for the customer against "Other Information" used "to operate
  our Services, Websites and business" as controller. This is the
  paragraph nobody in UK healthcare writes, and Quill needs it for
  account security, logs, service email and aggregate analytics about
  sponsored users. See the
  [Slack privacy policy](https://slack.com/trust/privacy/privacy-policy).

- **FourteenFish is the deliberate outlier** - EMIS is controller for
  everything in a user's own account and processor only for the copy the
  user submits to the customer, and promises never to share with the
  customer or a regulator without the user's instruction. That suits a
  lifelong appraisal portfolio, not a sign-off passport the academy must
  see. Clarity's 2022 alternative, an irrevocable permission to share
  with the bodies authorised "to appraise, revalidate, review, and/or
  assess the user", scoped to the authorising body, is closer to what
  EoEETA will expect. See the
  [FourteenFish master terms](https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents/92543/423413032671507-terms-and-conditions-2024-05-07-0739.pdf)
  and the
  [Clarity 2022 terms](https://content.agiliosoftware.com/content/primarycare/clarity/files/clarity-terms-and-conditions-2022.pdf).

- **Controller-side, JETS is the model sentence** for how EoEETA should
  name Quill: the supplier is "a Software Company under contract to the
  RCP to provide hosting and development of the programme websites",
  "bound by the required legal and regulatory contractual clauses
  regarding confidentiality and data protection". Most Royal College
  notices do not name their portfolio supplier at all, and JAG and JETS
  state no Article 6 basis, which is a defect rather than a model. See
  the [JETS privacy statement](https://jets.thejag.org.uk/privacy-statement).

- **Avoid consent as the basis for sponsored clinicians** - the ICO's
  employment guidance: "Employers are often in a position of power over
  workers and therefore it's best to avoid relying on consent". NHS bodies
  cite public task with contract alongside; the RCP defaults to
  legitimate interests. See
  [ICO, sharing workers' health information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/information-about-workers-health/when-can-we-share-workers-health-information/).

- **Pitfalls** - Patchwork and Locum's Nest never articulate a processor
  role; PebblePad's product policy never says who the controller is for
  institutional accounts; risr/'s 2018 policy hedges that an
  organisation's contract "may restrict our collection or use of your
  information". An academy's information governance lead cannot see from
  those pages where its own controller role begins.

### Consumer law and subscriptions

- **Four of fourteen sellers handle the 14-day right properly** - Geeky
  Medics, TeachMeSeries, BMJ Group and Zero to Finals. Only Geeky Medics
  writes the regulation 37 sequence: the buyer must "Expressly request
  immediate access", acknowledge that access starts within the 14 days,
  and accept losing the right to cancel. Without that express consent and
  acknowledgement the consumer "bears no cost". Passmedicine, Quesmed and
  eIntegrity rely on the digital-content exception without recording the
  consent that triggers it. See the
  [Geeky Medics app terms (Wayback, June 2026)](https://web.archive.org/web/20260612021746/https://app.geekymedics.com/disclaimer/)
  and the
  [Consumer Contracts Regulations 2013, Part 3](https://www.legislation.gov.uk/uksi/2013/3134/part/3).

- **Never deny consumer status** - Red Whale ("you are not deemed to be a
  'consumer' under the laws of England and Wales") and the MDU ("dealing
  with us as a medical or dental-professional, and not as a consumer") do
  so, and a clinician paying personally may still be a consumer in law.
  See the [Red Whale terms of sale](https://www.redwhale.co.uk/terms-of-sale).

- **Renewal mechanics with precedent** - BMJ auto-renews with at least 28
  days' notice including the renewal price and a 14-day opt-out deadline;
  Quesmed applies price changes no earlier than 30 days after notice;
  Pastest's Shopify template still says prices change "without notice".
  Stripe is the most-named payment processor. See the
  [BMJ individual subscription terms](https://bmjgroup.com/subscription-terms-and-conditions-individuals/)
  and the [Quesmed terms](https://quesmed.com/terms-and-conditions/).

- **Account sharing is paired with a consequence** - Passmedicine's
  "immediate termination", BMJ's right to verify a personal subscriber,
  eIntegrity's liability for losses from deliberately shared log-ins.

- **The DMCC subscription regime is not yet in force** - the government's
  response of 2 April 2026 said spring 2027; law-firm trackers report a
  9 August 2026 announcement of January 2027; no commencement regulations
  have been made. It will require renewal reminders, two 14-day
  cooling-off windows (on entry and after a trial or 12-month renewal),
  and cancellation by a single message, online. The billing flow should
  be built for it now rather than re-papered in months. See the
  [government response of 2 April 2026](https://www.gov.uk/government/consultations/consultation-on-the-implementation-of-the-new-subscription-contracts-regime/outcome/government-response-to-consultation-on-the-implementation-of-the-new-subscription-contracts-regime-web-accessible-version)
  and the
  [Wiggin DMCC tracker](https://wiggin.co.uk/insight/digital-markets-competition-and-consumer-act-tracker/).

- **Consumer Rights Act 2015** - section 57(3) bars capping service
  liability below the price paid; Schedule 2 paragraph 11 lists varying
  terms "without a valid reason which is specified in the contract" as
  unfair; Part 2 paragraph 23 allows variation of an open-ended contract
  with reasonable notice and a free exit. The pre-contract list in the
  Consumer Contracts Regulations includes cost per billing period, how an
  auto-renewing contract ends, and the functionality and compatibility of
  digital content. See
  [CRA 2015 Schedule 2](https://www.legislation.gov.uk/ukpga/2015/15/schedule/2)
  and
  [CCRs 2013 Schedule 2](https://www.legislation.gov.uk/uksi/2013/3134/schedule/2).

### Liability and disclaimers

- **Business caps sit at 100 to 150 per cent of twelve months' fees** -
  risr/ and Agilio 100 per cent, FourteenFish and EMIS 120 per cent, the
  Clarity MSA 150 per cent, the Clarity 2022 terms the greater of twelve
  months' fees and £200, all with data loss and consequential loss
  excluded. See the
  [risr/ MSA of August 2026](https://risr.global/wp-content/uploads/2026/09/risr_Master_Services_Agreement_Aug26.pdf).

- **Accurx is the UK healthcare precedent for two caps** - general
  liability at the higher of twelve months' fees or £250,000, and
  £1,000,000 for claims under the DPA or data protection law, which NHS
  customers negotiate for anyway. Under UCTA section 11(4) a cap set
  against actual insurance cover is easier to defend than a template
  figure. See the [Accurx terms](https://www.accurx.com/terms-and-conditions)
  and [UCTA 1977](https://www.legislation.gov.uk/ukpga/1977/50).

- **Consumer caps are messier and the mistakes are visible** - BMJ 115 per
  cent of the preceding twelve months, Red Whale the higher of sums paid
  or £100, Doctors.net.uk "£1 or the aggregate of sums you have paid",
  Patchwork one £250 for every kind of user. Pastest, Passmedicine, Mind
  the Bleep, Zero to Finals and the MPS omit the death, personal injury
  and fraud carve-outs altogether, which is ineffective under CRA section
  65 and now a CMA target: its July 2026 guidance says "so far as the law
  permits" does not rescue an unfair clause, with fines of up to 10 per
  cent of global turnover. See
  [Lewis Silkin on the CMA guidance](https://www.lewissilkin.com/insights/2026/07/29/cmas-new-unfair-contract-terms-guidance-is-here-whats-changed-and-what-your-bu-102nez8).

- **Clean consumer models** - Geeky Medics ("we do not exclude or limit in
  any way our liability to you where it would be unlawful to do so",
  liable for losses "that are a foreseeable result of our breach") and
  TeachMeSeries, which reproduces the CRA "Summary of your key legal
  rights" box. Slack's device for non-paying users: "UNLESS YOU ARE ALSO
  A CUSTOMER ... YOU WILL HAVE NO FINANCIAL LIABILITY TO US". See the
  [Geeky Medics store terms](https://store.geekymedics.com/policies/terms-of-service)
  and the [TeachMeSeries terms](https://teachmeanatomy.info/terms-and-conditions/).

- **Clinical disclaimers say three things everywhere** - education not
  advice, judgement not replaced, the professional keeps responsibility
  for the patient. The formulary warning ("a recognised formulary such as
  the British National Formulary prior to prescribing") is near
  universal and clinicians expect it. Accurx's acceptable use policy has
  the cleanest responsibility line: users are responsible for "all
  clinical assessments, decisions and actions" and must not use the
  platform "for communications in an emergency". OnExamination alone says
  "We make no promises ... that use of BMJ Materials will guarantee
  success in any exam" and discloses LLM-assisted drafting with human
  review. See the
  [Accurx acceptable use policy](https://www.accurx.com/acceptable-use-policy)
  and the [OnExamination terms](https://www.onexamination.com/pages/terms-and-conditions).

- **A gap Quill alone has** - no platform addresses liability for an
  assessment outcome relied on by an employer, which is closer to a
  sign-off passport than exam revision is.

### Intellectual property and user content

- **Two owners is the defensible model** - PebblePad: "you remain the
  owner of it unless it is owned by the Institution who is providing or
  provided your account for you"; risr/: the customer "exclusively owns
  and retains all right, title and interest in and to the Content,
  Customer Data"; Agilio: "Your data remains yours ... You grant us a
  licence to use it to the extent necessary to provide and support the
  services". MedAll lets an organisation keep a certificate record "even
  if you subsequently stop being a User". See the
  [PebblePad alumni terms](https://payments.pebblepad.co.uk/TermsAndConditions.aspx)
  and the [MedAll terms](https://medall.org/terms).

- **Over-reach to avoid** - Geeky Medics requires an "exclusive licence"
  over uploads, which read literally stops a learner reusing their own
  notes; BMJ's website terms take an irrevocable worldwide licence "for
  any purpose, in any media" with moral rights waived; Turnitin's licence
  survives leaving; GitHub's individual licence now includes use "by
  training AI Features".

- **AI clauses arrived in 2025 and 2026** - Geeky Medics bans use of its
  content "in the creation of artificial intelligence (AI) related
  products including the training of models"; Red Whale reserves
  text-and-data-mining rights and says "Personal data provided to us is
  not used to train AI models"; Agilio's DPA says AI-feature data "isn't
  used for model training". See the
  [Red Whale privacy policy](https://www.redwhale.co.uk/privacy) and the
  [Agilio DPA](https://agiliosoftware.com/legal-centre/data-processing-agreement/).

- **A perpetual licence over anonymised usage data is in every supplier
  contract read**, and institutions accept it when patient data and
  identifiability are excluded in terms: Clarity 2022 clause 9.4, the
  Agilio MSA's "Cleansed Data ... excluding Patient Data", FourteenFish's
  "Transaction Data", risr/'s "anonymised data, information or
  techniques".

- **The confidentiality warranty to copy is MedAll's** - uploads "will not
  breach any obligations of confidentiality whether to a patient, your
  employer, your colleague or any other third party".

### Assessment, sign-offs, reflections and images

- **The assessment rules live with certifying bodies, not platforms.**
  Resuscitation Council UK requires photo ID and an invigilator, an ALS
  pass mark of 75 per cent, an MCQ re-sit "within three months" on "the
  alternative MCQ paper", says "Only official RCUK certificates may be
  issued", releases the certificate to the candidate even "Where an
  employer has paid for the course", and gives four years' validity. The
  Bowel Cancer Screening accreditation guidelines fix 60 per cent, three
  attempts in twelve months two weeks apart, a second DOPS attempt "with
  two alternative assessors", no practice until "their official letter
  from JAG", and the most reusable line of all: "Candidates may appeal
  against the assessment process but not the judgement of the assessors".
  See the
  [RCUK advanced course regulations](https://www.resus.org.uk/sites/default/files/2025-05/RCUK%20Advanced%20Course%20Regulations.pdf)
  and the
  [BCSA accreditation guidelines v1.7](https://www.bcsa.thejag.org.uk/CMS_Documents/Scheme/SAAS/230901-%20Bowel%20Cancer%20Screener%20Accreditation%20Guidelines%20-%20%20Colonoscopists%20%20V1.7.pdf).

- **The JETS certification chain** - summative DOPS, local review and
  sign-off by the training lead, then the national JETS training lead,
  with a "minimum of two assessors, minimum of two cases, minimum of four
  DOPS ... within a month"; a trainee returning from a break needs no
  re-certification but "JAG recommends that the trainee is assessed
  locally". See
  [JETS: how certification works](https://jets.thejag.org.uk/eportfolio/how-does-certification-work/).

- **No platform term says "a result here is evidence, not a
  certificate"**, none disclaims a warranty of competence in words (ISCP
  only excludes implied warranties generally), and none promises identity
  assurance for unsupervised online assessment. The assessor's
  responsibility is professional, under Good medical practice 2024
  paragraphs 62 and 89, not contractual. All three are new wording for
  Quill.

- **Registration warranties are the norm** - Doctors.net.uk verifies GMC
  registration and says removed doctors "may be denied access"; MedAll
  requires users to "notify us immediately if you are struck off" but
  admits "we don't vet our Users"; Accurx delegates the check to the
  licensee. See the
  [Doctors.net.uk terms](https://www.doctors.net.uk/terms-and-conditions.html).

- **Reflection rests on the joint AoMRC, COPMeD, GMC and Medical Schools
  Council guidance, which no platform restates** - anonymise to the ICO
  standard ("Simply removing the patient's name, age, address or other
  personal identifiers is unlikely to be enough"), "capture learning
  outcomes and future plans" rather than facts, reflections "are not
  subject to legal privilege" so "Disclosure of these documents might be
  requested by a court", and "The GMC does not ask a doctor to provide
  their reflective notes in order to investigate a concern about them".
  RCPCH is the only body listing the disclosure routes in plain words:
  the GMC under section 35A of the Medical Act 1983, a court or coroner,
  the police, and patient subject access where the patient is
  identifiable. Platforms express all this as a prohibition on patient
  data (Doctors.net.uk, JRCPTB, risr/'s "Customer shall not submit PHI",
  Agilio) rather than a disclosure clause. See
  [The reflective practitioner (AoMRC PDF)](https://www.aomrc.org.uk/wp-content/uploads/2018/09/the_reflective_practioner_guidance_single_page.pdf)
  and the
  [RCPCH ePortfolio guidance](https://www.rcpch.ac.uk/resources/rcpch-eportfolio-guidance-doctors).

- **2026 college positions on AI in entries** - JRCPTB (May 2026) treats
  "Entering patient identifiable information into AI tools" and
  submitting AI-generated reflections as personal work as unacceptable,
  and recommends a declaration such as "AI was used to assist with
  structuring/editing this reflection"; RCPCH (June 2026) does not
  require a declaration but warns that a "purely mechanistic 'cut and
  paste' approach" raises probity concerns. See the
  [JRCPTB AI position, May 2026](https://www.thefederation.uk/sites/default/files/uploads/JRCPTB%20Position%20on%20AI%20in%20workplace%20based%20assessments%20and%20reflective%20logs%20on%20ePortfolio%20-%20May2026.pdf)
  and the
  [RCPCH AI guidance](https://rcpch.ac.uk/resources/responsible-use-artificial-intelligence-eportfolio-entries-guidance).

- **An identifiable reflection changes what the data is** - a reflection
  naming a patient is health data about that patient, engages Article 9,
  the duty of confidence and Caldicott, and makes the platform a
  processor (or for a direct account possibly a controller) of patient
  data it never meant to hold. Scores and sign-offs about a clinician are
  not health data; reasonable-adjustment records are, as RCUK's 25 per
  cent extra time for dyslexia shows.

- **Clinical images and video** - the GMC's recordings guidance, read
  through the MPS because gmc-uk.org blocked every fetch, treats images
  of internal organs as recordings made as part of care that may be used
  for teaching "in an anonymised form without seeking specific consent",
  whereas recordings made for teaching need consent, "ideally written".
  Platforms forbid copying (elfh: "No downloading or copying of any
  content to electronic or photographic media") but none says its images
  are anonymised or consented, and none names screenshots or screen
  recording. See
  [MPS on recordings of patients](https://www.medicalprotection.org/uk/articles/eng-making-audio-and-visual-recordings-of-patients).

- **Push notifications** - NHS messaging guidance says to disable
  lock-screen previews and minimise confidential content, yet neither
  Accurx's nor Pando's notice says anything about notification content.
  This is new wording for Quill.

### Retention and offboarding

- **Controllers keep training records six to twelve years** - Horus six
  years read-only then deletion, the Scotland Deanery six years after
  leaving, NHS ePortfolios training plus seven years, the RCP six years
  for CPD evidence, RCPCH twelve years after CCT on its guidance page but
  "50 years from your CCT date" in its notice of July 2026, a
  contradiction inside one controller. JETS keeps data "indefinitely ...
  because the data is used for audit and research purposes", the outlier
  not to copy. See [Data in Horus](https://supporthorus.hee.nhs.uk/faqs/data-in-horus/)
  and the [JETS privacy statement](https://jets.thejag.org.uk/privacy-statement).

- **Processor exit windows are 30 to 150 days** - risr/ 30 days' access
  then deletion, Agilio 30 days in a standard file format, the Clarity
  MSA 90, FourteenFish and EMIS a copy within 30 days, Accurx deletion
  confirmed within 90, PebblePad a purge 150 days after licence expiry.
  NHS Standard Contract Annex B wants deletion or return on written
  direction certified "within five Operational Days". The two clocks do
  not match, and a processor's terms must say which it follows.

- **risr/'s "Expiration of Users" clause is the closest precedent for
  clinicians who move trusts** - the customer gets "a period of two (2)
  years from the date that such User becomes a non-User, to either
  retrieve or destroy said User's data", which keeps the record with the
  controller long enough for a sign-off to finish or transfer.

- **PebblePad's Alumni Account** is free while the institution is a
  customer and for three years after, carves out "materials which are the
  property of that Institution", and gives 60 days to move content when a
  personal account ends. FourteenFish keeps a lapsed account alive with
  all its data; Microsoft states the opposite default for work accounts.

- **No UK healthcare SaaS promises portability between trusts.** It can
  only be offered lawfully if the SaaS agreement grants the conversion
  right as a standing controller instruction before the user terms offer
  it.

### Sub-processors and transfers

- **Hosting disclosures are rare and short** - Quesmed "Amazon Web
  Services in the eu-west-1 region in Ireland", MedAll "Our servers are
  currently based in the UK", FourteenFish's DPIA "AWS London", Myprogress
  "UK South" with Microsoft bound to the region; the RCP family still
  says "servers located within the EU". risr/ promises London, Dublin and
  Frankfurt on its site while its DPA allows global processing with
  proctoring sub-processors in India, reconciled only by "location
  specified in the applicable Order Form", a mechanism worth copying.

- **Published sub-processor lists exist only at risr/ and Agilio**, whose
  page of 21 September 2026 names AWS, Microsoft, Salesforce, SendGrid,
  Stripe and "Anthropic Ireland Limited ... General-purpose AI assistant
  (Claude) used by Agilio staff", the only open disclosure of an AI
  vendor found. Atlassian's layout (purpose, data categories, location,
  security measures, email subscription) is the best. See the
  [Agilio sub-processors](https://agiliosoftware.com/legal-centre/sub-processors/)
  and the [Atlassian sub-processors](https://www.atlassian.com/legal/sub-processors).

- **The best UK contract wording is Accurx's** - a "general written
  authorisation", notice "at least thirty (30) days in advance" of any
  change to its sub-processor page, and objection "on reasonable and
  explained grounds ... within ten (10) business days". DSPT guide 10 and
  Annex B require the list in the contract and written consent for
  additions. See the
  [Accurx DPA](https://www.accurx.com/data-processing-agreement).

- **Resend was Quill's one real transfer** (removed on 7 October 2026,
  so this and the next point are history) - "Resend stores all customer
  data in the United States only", "There is no setting today that moves
  stored data to the EU", it "participates in the EU-U.S. Data Privacy
  Framework and the UK Extension", its DPA uses the EU SCCs with the UK
  Addendum, and it gives "at least 14 days' written notice" of
  sub-processor changes, shorter than the 30 days Quill would promise
  sponsors. See [Resend GDPR](https://resend.com/security/gdpr) and the
  [Resend DPA](https://resend.com/legal/dpa).

- **The UK Extension is under strain** - on 29 June 2026 the US Supreme
  Court held in Trump v Slaughter that FTC commissioners can be removed
  at will; the EDPB asked the Commission to assess the DPF on 31 July
  2026; the UK government said on 14 July 2026 it is "exploring the
  potential impact" on the UK Extension. Both remained valid as at 17
  September 2026 and the advice is to name both the UK Extension and the
  Addendum so nothing needs re-papering. Under the DUAA the transfer test
  is "not materially lower" and the ICO still expects a transfer risk
  assessment behind any safeguard. Corollary: keep health or patient
  content out of Resend-routed email. See
  [Faegre Drinker, 17 September 2026](https://www.faegredrinker.com/en/insights/publications/2026/9/trump-v-slaughter-implications-of-the-us-supreme-court-ruling-for-eu-us-data-transfers-and-the-data-privacy-framework)
  and
  [ICO on the UK Extension](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/adequacy-regulations/how-does-the-uk-extension-to-the-eu-us-data-privacy-framework-work/).

- **Google Cloud needs only accurate description**, and the research
  brief was wrong to name Plausible: Quill uses no analytics vendor, and
  the cookie policy already says visits are counted from server logs.
  The Plausible findings (German hosting, no cookies, EEA adequacy) are
  therefore moot. Stale mechanisms to avoid: L2P still cites "Privacy
  Shield" and Acadoodle "Safe Harbor".

### Acceptance and versioning

- **Parker-Grennan v Camelot [2024] EWCA Civ 185 approves click-wrap** -
  "reasonable steps to bring the terms of the contract to the customer's
  attention" and "sufficient opportunity to read the terms" suffice;
  Camelot's drop-downs, hyperlinks, mandatory tick box and "summaries of
  significant changes requiring explicit acceptance" were endorsed; and
  "particularly demanding provisions ... warrant additional signposting".
  No authority was found on a sentence above the button with no tick box,
  so this plan's no-tick-box decision is an extrapolation and the tick
  box is the safer form. Green v Petfre shows the other failure: an
  exclusion "not sufficiently drawn to the attention of the Claimant"
  cost Betfred £1.7 million. See
  [Reed Smith on Parker-Grennan](https://www.reedsmith.com/en/perspectives/2024/03/just-a-boxticking-exercise)
  and
  [Bird & Bird on Green v Betfred](https://www.twobirds.com/en/insights/2021/global/limiting-liability-in-consumer-terms).

- **The E-Commerce Regulations** require the technical steps to be
  explained, the terms to be storable and reproducible, and an electronic
  acknowledgement of each order. See
  [regulation 9](https://www.legislation.gov.uk/uksi/2002/2013/regulation/9)
  and [regulation 11](https://www.legislation.gov.uk/uksi/2002/2013/regulation/11).

- **Only ISCP forces re-acceptance of a specific version at login**
  ("you will forced to click that you accept these terms before being
  able to use our site after login", sic); eIntegrity and the MDU come
  close. Everyone else relies on sign-up click-wrap or deemed acceptance
  by use. See the [ISCP new terms page](https://www.iscp.ac.uk/newterms.aspx).

- **Dating is where the UK sector looks worst** - risr/'s website privacy
  policy is dated 25 May 2018 beneath a 2026 DPA; PebblePad's product
  terms are © 2018 and still cite the Data Protection Act 1998; NHS
  ePortfolios' statement is November 2018; FourteenFish, MedAll and
  Induction show no date at all. Two cheap habits mark a maintained
  document: a version string with the previous version's date (Myprogress,
  eIntegrity "v4.14") and the RCP family's annual line, "last updated on
  14 April 2025 and reviewed on 13 April 2026 with no amendments". No UK
  platform keeps a public archive, so none can prove which version a user
  was shown; GitHub keeps every change in a public repository, Atlassian
  and Slack keep dated archives. See the
  [GitHub site-policy repository](https://github.com/github/site-policy).

- **Change mechanisms split by route** - for organisations, Accurx makes
  non-material updates binding immediately and material ones subject to
  thirty days' notice with a ten-business-day objection, the agreement
  continuing "under the pre-modification terms until the end of the
  current Term"; Agilio gives 30 days to object and the old terms until
  the next renewal. For individuals, GitHub gives "at least 30 days",
  Patchwork 30 days for changes that reduce rights, OnExamination and BMJ
  a refund if the subscriber cancels before a significant change,
  Quesmed 30 days (contradicted by its own disclaimer's "effective on the
  date they are posted"). Pitfalls: MedAll "without notice to you",
  PebblePad "effective upon posting", BMJ and Pastest "check this page
  periodically", Mind the Bleep "at any time without warning", all inside
  the CMA's warning that variation terms must be tied to objective
  triggers with genuine cancellation or refund rights.

- **Evidence to keep for each acceptance** - user identifier, UTC
  timestamp, the exact wording displayed, the version identifier and
  effective date of each linked document, IP address and user agent,
  whether a box was ticked, and a separate record of the regulation 37
  consent and acknowledgement. This follows from Article 7(1) and the
  trader's burden of proof under the Consumer Contracts Regulations,
  rather than from any comparator.

### What EoEETA's host trust will ask for

- **EoEETA publishes no notice of its own** - it is an NHS England academy
  hosted at the Norfolk and Norwich, with a Learning Hub project space
  that links only to the Learning Hub's policies, so its host trust will
  reach for the NHS documents below. See the
  [EoEETA page](https://www.hee.nhs.uk/our-work/cancer-diagnostics/training-academies/endoscopy-training-academies/east-england-endoscopy-training-academy).

- **NHS Standard Contract 2026/27** - GC21 requires an annual DSPT
  assessment, the National Data Guardian's standards, a named IG lead,
  Caldicott Guardian and SIRO, a DPO "where required by Data Protection
  Legislation", and breach notice to the commissioner on or before the
  regulator is told; GC21.8 makes it the controller's job to see that
  service users "are provided with, or have made readily available to
  them, Privacy Notices". Annex B wants processing "only in accordance
  with written instructions", DPIA assistance, no transfer "outside of
  the UK unless the prior written consent of the Co-ordinating
  Commissioner has been obtained", deletion or return certified "within
  five Operational Days", "immediate" notice of subject access requests
  and of suspected breaches "in phases, as details become available",
  audit rights, and written consent plus documented due diligence before
  any sub-processor. See the
  [general conditions](https://www.england.nhs.uk/wp-content/uploads/2025/11/04-nhssc-26-27-full-length-general-conditions.pdf)
  and the
  [service conditions](https://www.england.nhs.uk/wp-content/uploads/2025/11/03-nhssc-26-27-full-length-service-conditions.pdf).

- **DSPT standard 10** - "Every supplier, data processor and joint
  controller linked to your organisation who processes personal or
  confidential information must have completed a data security and
  protection toolkit ... If not, they should be able to demonstrate an
  equal or higher standard", and "merely viewing personal or confidential
  information is still classified as processing". Its contract checklist
  wants the legal basis, "permitted geographical location", "a list of
  any sub-processors", what happens if the processor "comes under new
  ownership, goes out of business or is under administration",
  destruction certificates at termination, and the DPO's details;
  certification "might include" ISO 27001, Cyber Essentials or Cyber
  Essentials Plus. Bailey Medics, below the 50-staff and £10 million
  thresholds, would register as Category 3 "Other". See the
  [DSPT standard 10 guide](https://dsptoolkit.nhs.uk/News/Attachment/767)
  and the [DSPT organisation types](https://www.dsptoolkit.nhs.uk/Help/5).

- **DTAC v2, which manufacturers must provide on request from 6 April
  2026** - asks for DSPT "standards met or exceeded", ICO registration, a
  DPIA, "your product's transparency information (privacy notice)"
  (C2.2.3), "the relevant product terms and conditions regarding use of
  user data, end user licence agreement or equivalent" (C2.2.4), data
  location including third-party components, a Cyber Essentials
  certificate, an external penetration test within the previous 12
  months covering the OWASP Top 10, MFA "for all account types", a
  justification for falling outside DCB0129 or a named Clinical Safety
  Officer, and WCAG 2.2 AA. So the privacy policy and terms this plan
  produces are themselves procurement evidence. The primary NHS England
  page did not resolve; see the
  [DTAC v2 form (mirror)](https://healthcare.awsaccelerators.com/DTAC_AWS_v2.html)
  and
  [Burges Salmon on DTAC v2](https://www.burges-salmon.com/articles/102mnjh/new-nhs-digital-technology-assessment-criteria-what-health-tech-suppliers-need-t/).

- **DCB0129** is mandatory for manufacturers of health IT software under
  the Health and Social Care Act 2012. A records-about-clinicians
  platform arguably falls outside the "Health IT System" definition; a
  clinical-records service is squarely inside and needs a Clinical Safety
  Officer, hazard log and safety case, with the customer carrying
  DCB0160. Accurx shows the supplier package: the licensee is responsible
  for DCB0160, DSPT "standards met" and the lawfulness of patient data,
  while Accurx "maintains DCB0129 documentation", holds ISO 27001 and
  Cyber Essentials Plus, submits an annual DSPT, and notifies breaches
  within 48 hours. See
  [DCB0129](https://digital.nhs.uk/data-and-information/information-standards/information-standards-and-data-collections-including-extractions/publications-and-notifications/standards-and-collections/dcb0129-clinical-risk-management-its-application-in-the-manufacture-of-health-it-systems).

- **The Learning Hub "Centre" model** assigns support, account control and
  data return to the organisation that enrolled the learner: Centres
  must "Provide appropriate support to Delegates", "We do not provide
  direct support to Delegates", and on decommissioning "we will provide
  the Data to that Centre". Every controller notice treats marketing as
  the body's own relationship with its members, so a processor is
  expected to say it does not market to them on its own account. See the
  [Learning Hub terms](https://learninghub.nhs.uk/policies/terms-and-conditions).

### The law on 6 October 2026

- **Every DUAA data protection provision is in force** - the main block
  on 5 February 2026 (SI 2026/82), the complaints duty on 19 June 2026,
  and the Information Commission replacing the Information Commissioner
  on 30 September 2026 (SI 2026/1015); the legislation.gov.uk text of
  Article 33 now reads "the Commission", so new notices should say
  Information Commission, not ICO. See
  [SI 2026/82](https://www.legislation.gov.uk/uksi/2026/82/made),
  [SI 2026/1015](https://www.legislation.gov.uk/uksi/2026/1015/made) and
  [ICO, what the DUAA means for organisations](https://ico.org.uk/about-the-ico/what-we-do/legislation-we-cover/data-use-and-access-act-2025/the-data-use-and-access-act-2025-what-does-it-mean-for-organisations/).

- **The complaints duty** - new section 164A of the DPA 2018: an
  electronic route, acknowledgement within 30 days, a response without
  undue delay, the outcome told to the complainant, "no exemptions". It
  binds controllers only and reaches processors through contract terms
  obliging them to pass complaints on promptly. See
  [ICO, how to deal with data protection complaints](https://ico.org.uk/for-organisations/how-to-deal-with-data-protection-complaints/).

- **Legitimate interests** - Article 6(1)(ea) "recognised legitimate
  interests" need no balancing test, and the statutory examples of
  ordinary legitimate interests now include direct marketing and
  "network and information security", the basis for Quill's security
  logging. Subject access needs only "reasonable and proportionate"
  searches with a stop-the-clock for clarification. See
  [DUAA section 70](https://www.legislation.gov.uk/ukpga/2025/18/section/70).

- **PECR regulation 6 was substituted** with exceptions for strictly
  necessary storage (authentication, security, recording user
  selections), statistical purposes (aggregate only, with clear
  information and a "simple and free" means to object), appearance
  (language, dark mode, layout) and emergencies; PECR fines now reach
  £17.5 million or 4 per cent of turnover. Marketing email still needs
  consent or the soft opt-in; the ICO's "electronic mail" includes
  in-app messages; push notifications are unsettled and should be
  treated as needing consent. No ICO source says whether a free sign-up
  counts as "negotiations for the sale" for the soft opt-in. See
  [ICO, the exceptions](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/)
  and [PECR regulation 22](https://www.legislation.gov.uk/uksi/2003/2426/regulation/22).

- **DMCC** - the unfair commercial practices chapter has been in force
  since 6 April 2025 with CMA direct enforcement, the final unfair
  contract terms guidance arrived in July 2026, and the subscription
  chapter waits for regulations, as above.

- **Housekeeping** - the data protection fee is £52 at tier 1 since
  17 February 2025 and is payable by a controller that is also a
  processor. The site must show the registered name, "the part of the
  United Kingdom in which the company is registered", the company number
  and registered office, a geographic address, an email address, the VAT
  number once registered, and whether prices include tax. See the
  [ICO fee FAQs](https://ico.org.uk/for-organisations/data-protection-fee/faqs-data-protection-fee-payment-and-online-registration/),
  [Trading Disclosures Regulations 2015 reg 25](https://www.legislation.gov.uk/uksi/2015/17/regulation/25)
  and
  [E-Commerce Regulations reg 6](https://www.legislation.gov.uk/uksi/2002/2013/regulation/6).

- **Children** - the Children's code applies on a "more probable than
  not" test and excludes services designed to exclude children "if access
  is effectively prevented", provided the reasons are documented; a
  medical-student cohort may include people aged 17; comparators' age
  floors run from 13 (risr/, a US template) through 16 (Myprogress, the
  most defensible) to 18 (L2P). See
  [ICO, services covered by the code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/).

- **Online Safety Act 2023** - "internal business services" limited to a
  closed group of workers and people they authorise are exempt, which
  covers a sponsor deployment; a consumer feature that lets users share
  content with each other could make Quill a user-to-user service and
  should be checked before it ships. See
  [Online Safety Act Schedule 1](https://www.legislation.gov.uk/ukpga/2023/50/schedule/1).

### What this suggests for the drafts

Grouped by document. These are proposals for review, not decisions, and
each rests on the finding above that names its source.

#### Architecture

- **Keep the chosen architecture.** It is a hybrid of Accurx's single
  document and Slack's "Contract prevails" clause, assembled from
  components because no UK peer has the three-part layout.

- **Define "Sponsor" expressly**, modelled on Slack's "Customer" ("the
  organisation ... that invited you ... This may be your employer") and
  Accurx's "Licensee", and use "Authorised User" for the UK register.

- **Order of precedence on the business side** - Order Form, data
  processing schedule (for personal data only), service schedule, SaaS
  agreement, with the data processing schedule prevailing on data
  protection.

- **Open the terms with a plain-English summary and close with a
  glossary**, as FourteenFish and Agilio do; the CMA now treats
  presentation as part of transparency.

#### Terms of service, common part

- **Eligibility** - healthcare professionals, students and the
  organisations that train them, minimum age 18 (or 16 with sponsor
  confirmation of supervision), with a written note kept of why children
  are unlikely to reach the service.

- **Professional details** - a warranty that they are accurate, a duty to
  notify suspension, erasure or conditions, and a right to suspend
  features that depend on registration (MedAll plus Doctors.net.uk).

- **No patient-identifiable data anywhere**, anonymised to the ICO
  standard, with a right to remove or require amendment of an offending
  entry (the joint reflective-practice guidance, Doctors.net.uk, Agilio,
  risr/).

- **The reflection clause no UK platform has** - reflections are not
  legally privileged, may be disclosed where a court, coroner or the law
  requires, will never be volunteered to the GMC by Quill, should record
  learning rather than facts, and the author will be told of any request
  where the law allows (the joint guidance and RCPCH's disclosure list).

- **The assessment clause no UK platform has** - a result or sign-off is
  evidence for the sponsor or the learner's own record, the sign-off is
  the assessor's professional act which Quill records but does not
  verify, and Quill gives no warranty of competence (JETS, BCSP, RCUK and
  Good medical practice paragraphs 62 and 89).

- **AI** - any AI assistance in an entry must be declared (JRCPTB's
  wording), patient identifiers must not go into external AI tools, and
  Quill does not use learner content to train models (Agilio, Red
  Whale).

- **Clinical disclaimer** - the standard three points with a formulary
  warning, Accurx's "all clinical assessments, decisions and actions"
  line, no emergency use, and an express "no guarantee of success in any
  assessment or exam".

- **Clinical images** - a contributor-side warranty that images were made
  as part of care, anonymised to the ICO standard before upload and used
  for teaching under the GMC's secondary-use rule; screenshots and screen
  recording named in the no-copying clause.

- **Two-owner content clause** - the learner owns what they write, the
  sponsor owns its assessment and sign-off records, Quill takes only the
  licence needed to run the service, and any anonymised-data licence
  excludes patient data and identifiability. No AI-training licence.

- **Personal accounts** - no sharing, paired with suspension, verification
  and liability for deliberate sharing; a ban on using Quill content to
  train AI.

- **One user-facing liability clause** that never excludes death,
  personal injury, fraud or statutory consumer rights, names foreseeable
  loss, and gives non-paying users no financial liability to Quill (Geeky
  Medics, TeachMeSeries, Slack). The business cap belongs in the SaaS
  agreement, not here.

- **Notifications** carry no patient-identifiable or sensitive content,
  message bodies load only after authentication, and users are advised to
  disable lock-screen previews.

- **Scope** - the teaching service is not a medical device and not
  clinical decision support; any future clinical-records sponsor carries
  DCB0160.

- **Versioning** - a version number, effective date and previous
  version's date on every document, an annual "reviewed on ... with no
  amendments" line, and a public archive of every version.

#### Terms of service, sponsored-user part

- **Slack's two sentences** - the sponsor's agreement governs and
  prevails, these terms still bind the user personally for conduct, and
  it is the sponsor's responsibility to tell users its policies and
  obtain any consents.

- **What the sponsor may do with the account** - provision and
  deprovision it, set permissions, see what the learner records, and
  claim a direct account whose email domain matches (Kahoot!, Google);
  plus Clarity's irrevocable permission to share with the assessors the
  sponsor authorises, scoped to the sponsor.

- **Routing** - support, rights requests and complaints go to the sponsor
  first, and the sponsor's privacy notice applies to training records
  (the Learning Hub Centre model, GitHub).

- **Leaving** - the sponsor keeps its records for its stated period, the
  learner may take a personal copy or convert to a direct account, and
  sponsor-owned material is carved out (PebblePad's alumni model, MedAll's
  retained certificate). The right must be granted in the SaaS agreement
  first.

- **No marketing** to a sponsor's users on Quill's own account.

#### Terms of service, direct-customer part

- **Treat the individual as a consumer**; never deny consumer status.

- **Build the regulation 36 and 37 sequence into checkout** - Schedule 2
  information before the pay button (cost per billing period, duration
  and how to end it, functionality, compatibility), a button label that
  says it creates an obligation to pay, a separate unticked box by which
  the buyer expressly requests immediate access and acknowledges losing
  the 14-day right, a confirmation email repeating the cancellation
  information with the model form, and a stored record of each.

- **Refunds** - full within 14 days where content was not accessed, and a
  proportionate refund for the service element after an express request
  to start (BMJ's test, regulation 36(4)).

- **DMCC-ready renewal terms now** - a reminder at least 28 days before an
  annual renewal, 28 to 30 days' notice of a price change with a free
  right to cancel before it bites, cancellation by a single message and
  online, and a fresh 14-day cooling-off after a trial or a 12-month
  renewal (BMJ, Quesmed).

- **Variation** - specified valid reasons (law, security, non-reducing
  feature changes), 30 days' email notice of material changes, and
  cancellation with a pro-rata refund; never "without notice" or "your
  responsibility to check".

- **Reproduce the "Summary of your key legal rights" box** and name the
  payment processor.

- **Say what happens to a lapsed direct account** - it persists with its
  data, or access ends after a stated grace period with export; either is
  fine, but say which.

#### Privacy policy

- **Open with the route paragraph** in the GitHub and Microsoft form: if a
  sponsor provides the account, the sponsor is controller for training
  records, Bailey Medics is processor under its agreement with the
  sponsor, requests go to the sponsor's administrator and the sponsor's
  notice applies; otherwise Bailey Medics is controller (Kahoot!, Quesmed
  are the nearest fits).

- **Add the residual-controller paragraph nobody writes** - what Bailey
  Medics does as controller even for sponsored users: account security,
  authentication, audit logs, service email, aggregate analytics,
  support, under legitimate interests citing the DUAA's security example
  (Slack, Myprogress).

- **Map every purpose to a lawful basis and cover every Article 13 item** -
  contract for accounts and direct subscriptions, legitimate interests
  for security and anti-abuse, consent or soft opt-in for marketing email,
  in-app messages and push notifications, retention criteria for logs
  and dormant accounts, the full rights list; avoid consent for sponsored
  clinicians (Quesmed and Turas as models, JETS as the pitfall).

- **Describe the complaints route under the DUAA** - how to complain to
  Bailey Medics, acknowledgement within 30 days, a response without undue
  delay, then the Information Commission; say Information Commission
  throughout.

- **Name each sub-processor with purpose, location and safeguard** -
  Google Cloud (London region, Google's data processing terms), Amazon
  Web Services (email delivery from its London region, Amazon's data
  processing terms, and the shared suppression list as the one thing not
  certain to stay there). This named Resend and its two transfer
  safeguards until 7 October 2026. There is no analytics vendor to name.

- **Describe analytics as cookieless**, say any preference or statistics
  storage relies on the new PECR exceptions, and offer a simple, free
  objection.

- **State hosting plainly as the United Kingdom**, stricter than the
  controllers' own "within the EU".

- **Say which records are health data** - assessment and sign-off records
  about a clinician are not; reasonable-adjustment information is, and is
  handled under a named Article 9 condition; the service is not directed
  at children.

- **Give a named data protection contact** even though a DPO is unlikely
  to be mandatory, and state that a DSPT submission and Cyber Essentials
  are maintained (DTAC C2.1 and C3.1).

#### SaaS agreement and data processing schedule

- **One public standard schedule**, incorporated by reference so it
  applies automatically, prevailing for personal data, with a pre-signed
  copy to countersign on request (Atlassian and Accurx for automatic
  incorporation, risr/ for the pre-signed route). GP practices publish
  countersigned Accurx PDFs, which is evidence NHS bodies accept a
  vendor-standard DPA.

- **Every Article 28(3) term and every Annex B expectation** - an annex of
  data subjects (learners, supervisors, assessors), data (identity,
  contact, assessment and sign-off records, reflections, logs) and
  duration; the service description as the standing instruction; staff
  confidentiality; an Article 32 measures annex; general written
  authorisation for named sub-processors with 30 days' notice and a
  ten-business-day objection on reasonable grounds; assistance with
  rights requests, complaints and DPIAs; breach notice without undue
  delay and within a fixed 24 to 48 hours; UK-only processing unless the
  sponsor consents; deletion or return on written instruction certified
  within five operational days; audit once a year absent a breach with
  third-party reports accepted; flow-down and full liability for
  sub-processors; the duty to flag an unlawful instruction.

- **Sub-processor mechanics** - an objection window no shorter than
  the notice Quill's own suppliers give it (Resend's was 14 days;
  Amazon's is to be read from its terms), a public sub-processor page in
  the Atlassian layout
  with an email subscription, and an archive of each dated version.

- **Two clocks** - the deletion clock runs from the sponsor's written
  instruction, not from contract end, and the sponsor gets a two-year
  retrieve-or-destroy window for departed learners (risr/), because the
  controller norm of six to twelve years would collide with a generic
  30-day purge.

- **Portability** - grant, as a standing controller instruction, the
  learner's right to a personal copy or a direct-account conversion when
  they leave, with sponsor-owned records carved out.

- **The sponsor's controller duties in the agreement** - lawful basis, an
  Article 13 notice to its learners and supervisors naming Bailey Medics
  as processor in the JETS form, documented instructions, DSPT where it
  is an NHS body, DCB0160 for any clinical service, and prompt onward
  passing of complaints (GC21.8, Google's "responsible for any consents
  and notices").

- **Business liability** - the greater of twelve months' fees and a fixed
  floor set against Bailey Medics' insurance, a separate higher cap for
  data protection breaches, the usual consequential-loss exclusions, and
  unlimited liability for death, personal injury, fraud and anything that
  cannot be limited (Accurx's £250,000 and £1,000,000 for the structure).

- **Variation for organisations** - non-material changes immediately,
  material changes on 30 days' notice to a named contact with a
  ten-business-day or 30-day objection, the old terms running to the end
  of the current term or next renewal (Accurx, Agilio).

- **Other mechanics** - a region field in the order form, notice and cure
  before suspension, auto-renewal with 90 days' non-renewal notice, and an
  escalation clause before litigation (risr/, FourteenFish and EMIS).

#### Product and process, not just wording

- **A tick box at sign-up** with the hyperlinked terms and policy
  immediately above it, the onerous terms (liability, no patient data,
  suspension, auto-renewal) in a short summary and again in the
  confirmation email, and re-acceptance at login after a material change
  (Parker-Grennan, ISCP, eIntegrity). This conflicts with the "No tick
  box" decision above and needs a decision.

- **An immutable acceptance record per user** - identifier, UTC timestamp,
  wording shown, document versions and effective dates, IP and user
  agent, tick state, and the separate regulation 37 consent.

- **A just-in-time reminder above the reflection editor** (anonymise,
  learning not facts, no privilege), and consider sensitive-data scanning
  as the RCGP's portfolio already does.

- **Data hygiene** - patient or health content stays out of every
  email, push notifications are treated as electronic mail needing
  consent, and every access to a record is attributable to a named user
  with logs available to the sponsor (NDG standard 4).

- **Assurance** - complete the DSPT as Category 3, hold Cyber Essentials
  (Plus if affordable), commission an annual OWASP penetration test,
  enforce MFA, write a DCB0129 scope justification and prepare a DPIA on
  NHS England's template, so that DTAC v2 can be answered on request.

- **Housekeeping** - pay the £52 data protection fee, and put the
  registered name, "Registered in England and Wales", company number,
  registered office, email address and (once registered) VAT number in the
  site footer and email footers.

### Questions still open

Points the research could not settle, for Mark to decide.

- **The DMCC subscription commencement date** and the content of the
  reminder and key-information rules once the regulations exist.

- **Whether a sentence above the button without a tick box suffices**,
  since Parker-Grennan involved a tick box.

- **Whether Resend's DPF listing is active and the UK Extension still
  stands at publication**, and whether to write a transfer risk
  assessment now. Closed on 7 October 2026: Resend is gone and nothing
  rests on the Data Privacy Framework.

- **Whether the soft opt-in holds for the Let's Do Digital mailing
  list**, which turns on what the booking forms said. See the step in
  Phase 3.

- **Whether the teaching platform is a "Health IT System" under DCB0129**
  and what the DSPT Category 3 assertions require, before promising a
  level.

- **Whether any peer-sharing feature makes a consumer deployment a
  user-to-user service** under the Online Safety Act.

- **The GMC's own wording on recordings, reflection and record-keeping**,
  reached here only through the AoMRC copy, the MPS and a barristers'
  commentary because gmc-uk.org refused every fetch.

### Gaps in the research

- **GMC pages returned 403 throughout**, so GMC text is cited through the
  AoMRC, the MPS, the RCP and a barristers' commentary.

- **Unreadable documents** - the FourteenFish and Enlivio privacy policy
  (JavaScript only), ISCP's 2020 single-page app, the RCoA Lifelong
  Learning Platform, the BSG privacy policy, BMJ's institutional licence,
  Notion's live terms, Turnitin, Moodle, Pastest's institutional terms,
  the RCPCH privacy notice v4.7 PDF, and the DCB0129 specification PDF.

- **Not settled by any source** - whether a free sign-up counts as
  "negotiations" for the PECR soft opt-in; whether push notifications are
  "electronic mail"; whether a records-about-clinicians platform is a
  "Health IT System"; and the January 2027 DMCC date, which no gov.uk page
  confirms.

- **No regional endoscopy academy publishes a notice naming a platform
  supplier**, so the sponsor-side wording for EoEETA has to be written
  rather than matched.
