<!-- cspell:words IASME DDAT -->

# Preparing for NHS procurement plan

The question was put on 8 October 2026: has due diligence been done for
offering the Clinician Passport to the NHS? The honest answer is "partly". The accessibility work and the terms and
privacy policy are well on, but a trust accepting Quill will ask for a set
of evidence that does not yet exist as a set: a completed DTAC (the Digital
Technology Assessment Criteria, the national baseline a trust assesses a
digital product against), security certificates, a data protection pack,
a clinical safety position, insurance, and an answer to "what happens if
you stop".

This plan lists what a trust will ask for, where Quill stands on each, and
the order to close the gaps in. The intended outcome is a pack that can go
to the Gloucestershire information governance and contracts teams, with the
SaaS agreement, and be reused for the next trust. The first phase holds
three things that must happen before anything is sent, because each can
sour the approach on its own.

## Phase 1: Before anything goes to the trust

- [ ] **Declare any conflict of interest in writing, before the approach.**
      Anybody inside the trust with a personal or financial link to the
      supplier declares it under the trust's managing conflicts of
      interest policy and takes no part in the decision. Quill states the
      same in its covering note. A contracts team that finds a link out
      later will distrust the whole approach.
- [ ] **Agree any use with the trust's information governance team
      first.** Nobody at a trust puts real records into the passport
      until that team has agreed. Offer a pilot, and go to information
      governance first, contracts second.
- [ ] **Hold written permission for each framework hosted.** The
      framework files in `shared/competency-definitions/` are other
      bodies' documents. Ask each publisher for written permission to
      host its document, and keep the replies in the pack. Lead a
      demonstration with the trust's own document.
- [ ] **Write one page saying what the passport is and is not.** A trust
      will size its checks by this. It is a record of a clinician's own
      competence: staff personal data, no patient record, no clinical
      decision support, not a medical device. It is hosted in the UK. It
      is one feature of the App; the EHR product, with FHIR and EHRbase,
      is not being offered. Every later document points back to this
      page, so it is written first.

## Phase 2: Registrations and facts a trust checks first

- [x] **ICO registration.** Bailey Medics Ltd is registered, reference
      ZC262758, and the privacy policy has carried it since 6 October
      2026. Recorded in Phase 1 of
      `docs/docs/plans/2026-10-06-terms-and-privacy-policy-plan.md`.
      Nothing to do but put the reference in the pack and keep the yearly
      data protection fee paid.
- [ ] **Get an ODS code** (the Organisation Data Service code that
      identifies an organisation to NHS systems), if the company does not
      have one. The DSPT in Phase 3 cannot be started without it: its
      registration page asks for "a valid organisation code". Search for
      Bailey Medics first on
      [ODS Data Search and Export](https://www.odsdatasearchandexport.nhs.uk/).
      If it is not there, make an account on the
      [NHS National IT Customer Support Portal](https://www.support.digitalservices.nhs.uk/csm),
      choose "Submit a Case", then "Data Services, Collections & Data
      sets", then "Organisation Data Service (ODS)", and pick the form
      for a new organisation code. Read from the DSPT registration page
      and an archived copy of the ODS page on 8 October 2026. Neither
      names the form for an IT supplier or gives a turnaround time, so
      say in the request that the code is needed to register for the
      DSPT as a supplier.
- [ ] **Fill in DTAC v2, and get the form from NHS England itself.**
      Version 2 is the one a manufacturer must provide on request from
      6 April 2026. What it asks is already set out under "What EoEETA's
      host trust will ask for" in the terms and privacy policy plan, read
      from a mirror because the NHS England page did not resolve that
      day. Get the primary form before filling it in.
      `docs/docs/safety/overview/regulatory-framework.md` describes the
      first version and should be brought up to date at the same time.
- [ ] **Hold the insurance a trust will ask for, in force before the
      first customer goes live.** Professional indemnity for a technology
      company, cyber and data liability, and public liability, in the
      name of Bailey Medics Ltd with its trading names. One policy set
      covers teaching and the passport. Ask the trust's contracts team
      what cover levels they require before choosing limits, since trusts
      differ. The liability cap in the SaaS agreement was designed in the
      terms and privacy policy plan as "a fixed floor set against Bailey
      Medics' insurance", so the cap is set from the cover. The policy
      documents and any quotes are kept outside this repository.
- [ ] **Tell the insurer what the business does, and answer its forms as
      things are.** The description must say software as a service
      supplied to NHS organisations, holding personal data about their
      staff. An answer about a certificate or a tested plan is given as
      it stands on the day and updated when Phase 3 changes it. A policy
      rests on those answers being true and complete.
- [ ] **Put six questions to the insurer in writing before buying**, and
      keep the replies with the policy.
      Who is insured: the company and each trading name.
      The retroactive date: professional indemnity answers claims made
      during the policy for work done after that date, so it should
      reach back to when the service was first supplied.
      Patient harm: if a trust relies on a wrong sign-off and a patient
      is hurt, which section responds? Professional indemnity often
      excludes bodily injury and public liability often excludes
      professional services, so the claim can fall between them.
      Customers: are NHS organisations, or data about NHS staff, exam
      results and clinicians' competencies, excluded anywhere?
      Contract liability: NHS terms carry indemnities wider than the
      ordinary law, and policies commonly exclude liability taken on only
      by contract. Send the insurer the indemnity clause of each
      agreement before signing it.
      Hosted data: does the cyber section cover data held on a cloud
      provider's systems?
      If the patient harm question gets no clear answer, take it to a
      broker who places health technology companies.

## Phase 3: Technical security

- [ ] **Get basic Cyber Essentials first.** It is a self-assessment
      questionnaire through an IASME certification body, signed by a
      director and reviewed by them, and can be done in days. It answers
      the DTAC question on its own and is the first half of Plus, which
      audits the same answers and must follow within about three months.
      The answers have to be true, not merely submitted: every device
      patched within 14 days, multi-factor authentication on every cloud
      account (Google Cloud, AWS, GitHub, email) and no shared
      administrator accounts. Fix anything that is not so before
      submitting.
- [ ] **Then Cyber Essentials Plus.** The DTAC technical security
      section asks for a Cyber Essentials certificate, and Plus, the
      audited version, also feeds the DSPT below. The certificate has to
      be in the name of Bailey Medics Ltd. Scope it to the company's
      devices and the cloud accounts that run the App.
- [ ] **Commission an independent penetration test** of the App, and fix
      what it finds. DTAC v2 asks for an external test within the last 12
      months covering the OWASP Top 10. The in-house half already runs:
      `.github/workflows/zap-scan.yml` runs an OWASP ZAP baseline scan
      every Monday, and `.github/workflows/security-pentest.yml` runs
      fuzz tests and targeted attacks on the first of each month. The
      checkboxes in `docs/docs/plans/2026-05-05-pentesting-plan.md` were
      never ticked and should be brought up to date. Read the latest ZAP
      report and clear what it lists before paying for a tester, so the
      paid days go on what a scanner cannot find. Keep the report and a
      summary that can be shared. Get three quotes, asking each for a
      web application test of one app with a retest included.
- [x] **Check multi-factor authentication covers every kind of account.**
      It does not: TOTP two-factor authentication is offered and any
      account may sign in without it. The product owner decided on
      8 October 2026 to leave it so, since nobody has asked for it to be
      required. If a trust does, require it for that trust's org units
      and not for everybody. Until then the DTAC v2 question, MFA "for
      all account types", is answered "available, not enforced".
- [ ] **Publish a DSPT return.** The Data Security and Protection Toolkit
      is the yearly self-assessment an organisation with access to NHS
      data publishes, and a trust looks the supplier up by ODS code.
      Bailey Medics Ltd is below the 50-staff and £10 million thresholds,
      so it registers as Category 3 "Other". DTAC v2 asks for "standards
      met or exceeded", and DSPT standard 10 obliges the trust to check
      every supplier that processes personal data has completed one.
      Much of the evidence is the steps above.
- [ ] **Make the recovery plan real: written, and tested once.**
      `2026-09-17-disaster-recovery-plan.md` was checked against the live
      project on 8 October 2026. Its Phase 1 is done: backups are taken
      nightly and all succeed. Rebuilding the infrastructure has been done
      for real; restoring data has never been tried. What is left to say
      "tested" truthfully is its Phase 2, which closes the gaps in how the
      database is protected, Phase 3, which writes the restore steps, and
      Phase 5, which rehearses one restore in a throwaway project. The
      same work answers the trust's back-up question, the DPIA and the
      DCB0129 evidence.
- [ ] **Write down how a security incident is handled**: who is told,
      how fast, and how a trust is notified. The data processing terms in
      Phase 4 will promise a time, so the promise and the practice are
      written together. This is the one-page incident response plan
      still unticked in `docs/docs/plans/todo.md`; tick it there too.

## Phase 4: The data protection pack

Most of this is already planned in
`docs/docs/plans/2026-10-06-terms-and-privacy-policy-plan.md` and is not
repeated here. Its research section, "What EoEETA's host trust will ask
for", quotes what the NHS Standard Contract, DSPT standard 10 and DTAC v2
each require of a processor, and applies to Gloucestershire as it does to
EoEETA's host. These steps are what this approach adds.

- [ ] **Finish the open steps of the terms and privacy policy plan**: the
      retention periods and what enforces them, the data processing terms
      and SaaS agreement (its Phase 4), the sub-processor list, the
      back-up and support policy, and publishing both documents. A trust
      asks for every one of them.
- [ ] **Settle who is the controller of a passport.** A passport belongs
      to its holder and goes with them when they move trust; that is the
      point of it. But a trust that pays for its trainees' passports and
      asks them to use one for training is deciding a purpose too. The
      processing terms have to say which records the trust controls,
      which the holder does, and what the trust can and cannot see or
      delete when a trainee leaves. This is a question for the product
      owner before the terms are final.
- [ ] **Decide what to call the person responsible for data protection.**
      The product owner takes the role. Check first whether Bailey Medics
      is obliged to appoint a Data Protection Officer at all: the duty
      falls on public authorities and on large-scale processing of
      special category data, and the passport is neither. If it is not
      obliged, name him as the data protection lead and say why no DPO
      is required. A formal DPO must not be the person who decides how
      the data is used, which a sole director is, so the title could be
      challenged where the plainer one cannot.
- [ ] **Write a DPIA the trust can adopt.** A trust runs its own data
      protection impact assessment and a supplier who arrives with one
      already filled in saves weeks. Cover what is held, where, who can
      see it, the sub-processors, retention, and the risks below.
- [x] **Keep patient details out of the passport.** Most of this was
      already in place. The terms forbid it, in clause 9 and in the rules of use.
      A reflection cannot be saved without ticking that it identifies no
      patient. The logbook's indication and notes, and the notes on a
      certificate, a CPD entry and a sign-off request, each say to write
      about the work and not about a patient. Two gaps were closed on
      8 October 2026: the outcome field on `LogbookEntryForm`, where
      "what happened" is most likely to name somebody, and
      `CertificateUploader`, the only place a file enters a passport, so
      where a scanned prescription or clinic letter would arrive. Both
      are wording on the form, not a check: nothing reads what is typed
      or uploaded. Say so in the DPIA, with what happens when somebody
      does it anyway.

## Phase 5: Clinical safety

- [x] **Name the Clinical Safety Officer.** The product owner is a
      trained and practising CSO and has done DCB0129 work before, so he
      writes and signs the two documents below. DTAC v2 asks for a named
      CSO or a justification for falling outside DCB0129; Quill can give
      the name either way.
- [ ] **Write a DCB0129 applicability statement for the passport.**
      DCB0129 is the clinical risk management standard for makers of
      health IT. The passport is not used in the care of a patient, so
      the case for "out of scope" is arguable, but arguing it is weaker
      than answering it. A trust may rely on a sign-off to let somebody
      prescribe SACT unsupervised, and a wrong, forged or misread
      sign-off could then reach a patient. Say that, and say what
      controls exist: a named assessor with a registration, no
      self-sign-off, a fingerprint over what was attested, and a history
      that cannot be edited.
- [ ] **Add the passport's hazards to the hazard log** in
      `docs/docs/safety/hazards/`, in the existing format. At least: a
      sign-off read as covering a scope it does not; a sign-off by
      somebody not entitled to give it, since who may sign off whom is
      not enforced; an expired sign-off still shown as current, since
      nothing acts on expiry; and a passport-only framework drifting from
      its publisher's current version.
- [ ] **State that the passport is not a medical device**, with the
      reason, in the one-page description from Phase 1. The DTAC asks,
      and "not applicable" needs a sentence behind it.

## Phase 6: Accessibility

- [ ] **Run the manual screen reader journeys.** They were deferred until
      a DTAC sign-off needed them, and it now does. Work through the "Not
      yet run" list in `docs/docs/frontend/accessibility/testing-log.md`,
      passport journeys first, and record each run there.
- [ ] **Publish the accessibility statement** and check
      `docs/docs/frontend/accessibility/dtac-d1.md` answers the current
      form's usability and accessibility questions, not the older one's.

## Phase 7: Continuity and exit

- [ ] **Write the answer to "what if you stop".** Quill is one developer,
      and a contracts team will ask. The honest strengths are that a
      passport is the holder's own files, exportable at any time as PDF,
      Markdown or a zip, and readable without Quill. Write down the exit
      a trust gets: how long the service runs after notice, how every
      holder gets their export, and what is deleted and when.
- [ ] **Decide whether to offer anything stronger**, such as source code
      in escrow or a named second person with access. Put the question to
      the product owner with what each costs; do not promise either in
      the pack until decided.

## Phase 8: The pack and the approach

- [ ] **Assemble the pack**: the one-page description, the completed
      DTAC, Cyber Essentials Plus certificate, penetration test summary,
      DSPT status, ICO number, DPIA, data processing terms, sub-processor
      list, clinical safety statement, accessibility statement, insurance
      certificates and the exit plan. One folder, dated, reused for the
      next trust.
- [ ] **Approach Gloucestershire information governance first**, with
      the pack and the conflict of interest stated, proposing a pilot
      with a named group of trainees.
- [ ] **Then put the SaaS agreement to the contracts team**, expecting
      them to answer with their own paper. A trust usually prefers the
      NHS standard terms and conditions or a framework agreement to a
      supplier's contract. Ask which route they buy small software
      through.

## Decisions

- **"DDAT" was read as DTAC** – the request named DDAT, which is the
  government's digital and data profession. The assessment a trust runs
  on a product is the DTAC, and the accessibility work already filed
  under `dtac-d1.md` points the same way.

- **Do the three things in Phase 1 before any evidence work** – a missing
  certificate delays a purchase. An undeclared interest, a product
  already in use without agreement, or a publisher objecting to its
  document being hosted can end one.

- **Answer clinical safety, do not argue it away** – the passport holds
  no patient record, and a claim that DCB0129 does not apply could be
  defended. But a trust's clinical safety officer will ask what happens
  when a sign-off is wrong, and a short statement with a hazard log
  answers that where "out of scope" invites a second meeting.

- **Basic Cyber Essentials first, then Plus** – the basic certificate is
  self-assessed and satisfies the DTAC question, so it comes first. Plus
  is what the DSPT and most trust security teams give weight to, and it
  audits the same answers.

- **The offer is the passport, not the EHR** – every answer in the pack
  is about the App and the Clinician Passport. Offering the clinical
  product would bring patient data, DCB0129 in full and a much longer
  assessment, and nobody has asked for it.

- **The first approach is a pilot** – decided by the product owner on
  8 October 2026. The information governance checks apply in full
  whatever the commercial terms. If a regional body wants the passport
  across several trusts, the buyer is that body's host and the pack goes
  to a different team.

- **Nothing here is confirmed with the trust yet** – what Gloucestershire
  in particular requires (cover levels, route to buy, whether it wants a
  DSPT from a supplier this size) is not known. Phase 2 and Phase 8 ask.
  Where this plan says "a trust will", it is the usual case, not their
  answer.

- **Commercial detail stays out of this document** – the repository is
  public. Policy and quote references, prices, turnover, what cover is
  or is not held, and how a negotiation will be run are kept in private
  notes. This plan lists what has to be done, not the company's position
  on each.
