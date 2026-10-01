# Passport for every profession plan

The Clinician Passport records competencies a named assessor has watched and
signed off, and every clinical base profession already holds
`assess_clinician_passport`, so a nurse, pharmacist, paramedic or
physiotherapist can open it today. What they find is a catalogue written for
doctors: 35 assessable competencies, all medical or oncology, and three
specialty lists (general medicine, general surgery, oncology). Opening the
passport to every registered profession in the UK is therefore content, not
mechanism. Decided on 1 October 2026: there is no `role` layer that allows or
blocks ranges of competencies, because professions overlap too much for any
range to be right (a prescribing nurse, a pharmacist prescriber, an advanced
paramedic) and the assessor's signature is the real check; a specialty stays
what it is, an ordered list that floats its common competencies to the top of
the picker and never hides anything; and what is needed is a large selection
of specialties, each seeded from the framework its profession already assesses
against.

This document is that research first, one step per profession group. For each
official framework it records who publishes it, how it is structured, whether
its items are sign-off-able procedures or broad proficiency statements, whether
a machine-readable form exists, what its licence allows (the passport's writing
half is paid for, so this matters), and which passport or portfolio schemes
already run on it. The phases that add competencies and specialty lists to
`shared/` follow once the research has been read and the open decisions at the
end of phase 1 are taken.

## Phase 1: Research the official frameworks

- [x] **Record how a framework becomes passport content** – Two files, both
      validated when the backend starts. A competency is one entry in
      `shared/competency-definitions/*.yaml` (`CompetencyEntry` in
      `backend/app/cbac/competencies.py`): `id` (snake case, verb first,
      unique across the whole directory), `display_name`, `assessable: true`,
      an optional `levels` scale declared per competency because cannulation
      is yes or no while prescribing SACT has intermediate states, an optional
      `expires_after_months`, and `retired_on` rather than deletion. A
      specialty is one file in `shared/passport-specialties/<id>.yaml`
      (`Specialty` in `backend/app/features/passport/specialties.py`): `id`,
      `display_name` and `common_competencies` in the order the picker shows
      them; every id it names must exist, be assessable and not be retired, or
      the backend refuses to start. So a framework item is useful in direct
      proportion to how closely it reads as one observable act: "undertake
      abdominal examination and palpation" maps to one entry, "practise in
      line with the Code" maps to nothing. Two consequences for the later
      phases: the catalogue doubles as the CBAC permission vocabulary, so
      hundreds of new assessable entries are also hundreds of grantable ids;
      and a competency two professions share (cannulation, prescribing) is
      written once and listed by every specialty that wants it, which is what
      makes the overlap between nurses, pharmacists and paramedics a
      non-problem.

- [x] **Nursing** – The NMC's own procedures list is the seed; everything
      richer is all rights reserved.

  - **NMC Standards of proficiency for registered nurses** (Future nurse,
    approved 28 March 2018, redesigned March 2024 with no new content;
    UK-wide; point of registration) – seven platforms of 103 broad outcomes,
    then Annexe A (32 communication skills) and Annexe B, 84 numbered nursing
    procedures, 1.1 to 11.11, such as "2.2 undertake venepuncture and
    cannulation and blood sampling", "2.3 set up and manage routine ECG
    investigations" and "2.8 undertake chest auscultation". Annexe B is a
    real sign-off list: every university practice assessment document maps it
    (Pan London PLPAD 2.0, the All Wales PAD, and their ePADs). PDF only.
    [Page](https://www.nmc.org.uk/standards/standards-for-nurses/standards-of-proficiency-for-registered-nurses/),
    [PDF](https://www.nmc.org.uk/globalassets/sitedocuments/standards/2024/standards-of-proficiency-for-nurses.pdf).

  - **NMC Standards of proficiency for nursing associates** (2018, redesigned
    2024; an England-only role) – six platforms, 75 outcomes; Annexe B of 60
    procedures, a subset of the nurse list.
    [Page](https://www.nmc.org.uk/standards/standards-for-nursing-associates/standards-of-proficiency-for-nursing-associates/),
    [PDF](https://www.nmc.org.uk/globalassets/sitedocuments/standards/2024/standards-of-proficiency-for-nursing-associates.pdf).

  - **NMC post-registration standards** (community nursing specialist practice
    qualifications and specialist community public health nursing, both 2022,
    UK-wide) – broad leadership and public health proficiencies, about 102
    and 174 items; seeds for nothing, but the SCPHN fields (health visiting,
    school nursing, occupational health) are specialties a holder might
    choose.
    [SPQ](https://www.nmc.org.uk/standards/standards-for-post-registration/standards-of-proficiency-for--community-nursing-specialist-practice-qualifications/),
    [SCPHN](https://www.nmc.org.uk/standards/standards-for-post-registration/standards-of-proficiency-for-specialist-community-public-health-nurses2/).

  - **RCN advanced practice** – the Professional Development Framework:
    Advanced Level Nursing (May 2024, replacing the 2018 standards) sets
    enhanced, advanced and consultant levels against four pillars, all broad.
    RCN credentialing closed to new applications on 27 June 2025 because the
    NMC published its principles for advanced practice (10 June 2025) and will
    write advanced practice standards of proficiency in 2027 to 2028, so
    nothing here is settled.
    [RCN](https://www.rcn.org.uk/Professional-Development/Levels-of-nursing/Advanced),
    [NMC review](https://www.nmc.org.uk/standards/future-standards/advanced-practice-review/).

  - **RCN specialty frameworks** – the Competency Framework for Registered
    Nurses in Emergency Care, levels 1 and 2 (pub 012 222, 15 May 2026,
    replacing the 2017 Emergency Care Association documents) is the richest
    discrete list found in nursing: several hundred skill rows (about 620 by
    text count) by body system and presentation, each with a self-assessment
    scale, a date and an evidence type (DOPS, CBD). Others: rheumatology
    (December 2024), sickle cell and thalassaemia (October 2024), headache
    disorders (December 2025), children's palliative care, and the RCN and
    CCLG children and young people's cancer nursing framework v3.0 (September
    2022, a fillable PDF); the RCN adult cancer nursing framework (2022) page
    could not be reached. All RCN publications are all rights reserved,
    permission through the RCN copyright request form.
    [Emergency care](https://www.rcn.org.uk/Professional-Development/publications/rcn-competency-framework-for-registered-nurses-in-emergency-care-level-1-and-2-uk-pub-012-222),
    [CYP cancer](https://www.cclg.org.uk/information-professionals/career-and-education-support/cyp-cancer-framework),
    [RCN copyright form](https://www.rcn.org.uk/Professional-Development/publications/Copyright-request-form).

  - **CC3N adult critical care Steps** – the National Competency Framework
    for Registered Nurses in Adult Critical Care (v2 2015, Steps 1 to 3; Step
    4 v2 2025) and a 2026 revision renamed the National Proficiency Framework
    for Adult Critical Care Nurses, with the 2015 versions to be signed off by
    31 March 2028. Step 1 (2026) has 20 sections and 95 numbered proficiencies
    (1.1.1 to 1.20.2), each with knowledge and skill evidence and learner and
    assessor signatures, to complete within 18 months; specialty add-ons
    (burns, liver, cardiac, trauma, neuro, maternal, renal, 2025), a support
    worker framework and a nursing associate framework (v2 2024) sit beside
    it. Delivered digitally through NHS Digital Learning Solutions. Licence:
    all rights reserved, no reproduction without written permission.
    [Steps](https://www.cc3n.org.uk/step-proficiency-framework.html),
    [Step 1 2026 PDF](https://www.cc3n.org.uk/uploads/9/8/4/2/98425184/step_1_proficiencies_final.pdf).

  - **Paediatric critical care** – National Nursing Competencies for babies,
    children and young people in hospital (PCCS educators and the operational
    delivery networks, v1 June 2023): system chapters each split into clinical
    skills, knowledge and application, with trackers for preceptorship and
    PCC levels 1 and 2; discrete but unnumbered; found only on an ODN site,
    with no copyright statement.
    [PDF](http://southwestpccodn.nhs.uk/wp-content/uploads/2023/09/National-Children-and-young-peoples-nursing-competencies-V1-EQA-submission-1.pdf).

  - **UKONS passports** – the SACT Competency Passport (adult; v2 September
    2017, later paper editions, used across the UK and Ireland) is the model
    this passport sits beside: Step One theory, Step Two clinical practice
    assessment by route (oral, intramuscular and subcutaneous, intravenous,
    pre-treatment consultation), Step Three annual re-accreditation. Digital
    on Compassly (Tefogo), free to UKONS members since autumn 2023, with
    renewals added in December 2025. Also the Acute Oncology passports (2nd
    edition 2024, four levels) and the SACT CYP passport v8.0 (CCLG, 2022).
    Licence: "This passport cannot be reproduced. All rights reserved."
    [SACT PDF](https://www.hee.nhs.uk/sites/default/files/documents/CapitalNurse%20SACT%20Passport%20framework.pdf),
    [digital passport](https://ukons.org/news/ukons-digital-sact-competency-passport),
    [AOS passports](https://ukons.org/resources/aos-passport-resources).

  - **Devolved nations** – Scotland has the NES NMAHP Development Framework
    (a web tool of knowledge, skills and behaviour statements by level, with a
    development needs analysis, December 2024) and the Scottish Government's
    Transforming Nursing Roles advanced nurse practitioner papers (2017 and
    April 2021, OGL); NES's own terms allow educational reuse and forbid
    commercial gain. Wales has HEIW's Professional Framework for Enhanced,
    Advanced and Consultant Clinical Practice (June 2023, multi-professional,
    no skills list) and a competence framework for general practice nurses;
    HEIW forbids reproduction without permission. Northern Ireland launched
    NIPEC's Career and Development Model on 2 December 2025 with critical
    care, cancer and perioperative pathways; adapting NIPEC material needs
    permission.
    [NES](https://www.nmahpdevelopmentframework.nes.scot.nhs.uk/),
    [HEIW](https://heiw.nhs.wales/files/enhanced-advanced-and-consultant-framework/),
    [NIPEC](https://nursingandmidwiferycareersni.hscni.net/).

  - **Most useful** – Annexe B: 84 numbered, observable procedures with stable
    identifiers that every UK nurse has been assessed against, and the NMC
    permits reproducing its standards with credit and a link. CC3N Step 1 and
    the RCN emergency care framework are the best specialty lists, and both
    need written permission.

- [x] **Midwifery, maternity and neonatal** – The NMC midwifery standards
      carry their skills list inside the standards rather than in an annexe,
      and it is already the sign-off list of every UK midwifery programme.

  - **NMC Standards of proficiency for midwives** (approved 3 October 2019,
    redesigned March 2024 with no change of content; UK-wide; point of
    registration, and the benchmark for overseas and return-to-practice
    midwives) – six domains. Domains 1 to 5 are 98 broad outcomes numbered
    d.n. Domain 6, "The midwife as skilled practitioner", is the list: 6.1 to
    6.90 with about 152 sub-items in eight skill sets, discrete and
    sign-off-able, for example "6.31 undertake abdominal examination and
    palpation", "6.34 undertake vaginal examination with the woman's consent",
    "6.35 undertake venepuncture and cannulation and blood sampling", "6.65.5
    suture an episiotomy, undertake repair of 1st and 2nd degree perineal
    tears", "6.71.7 conduct a breech birth and manage shoulder dystocia",
    "6.71.8 conduct manual removal of the placenta" and "6.72.2c undertake
    amniotomy and application of fetal scalp electrode". There are no
    annexes, unlike the nurse standards. PDF only.
    [Page](https://www.nmc.org.uk/standards/standards-for-midwives/standards-of-proficiency-for-midwives/),
    [PDF](https://www.nmc.org.uk/globalassets/sitedocuments/standards/2024/standards-of-proficiency-for-midwives.pdf).

  - **Already the national sign-off list** – MORA, the Midwifery Ongoing
    Record of Achievement (the Midwifery Practice Assessment Collaboration,
    every approved education institution in England and Northern Ireland,
    since September 2020), records Domain 6 in antenatal, intrapartum,
    postnatal, neonatal and promoting excellence sections, signed by practice
    supervisors and confirmed by practice assessors under the NMC's student
    supervision and assessment standards; its electronic form runs on
    PebblePad, MyProgress and ARC ePAD. Scotland's MPAD v3.1 (January 2022)
    reproduces Domain 6 verbatim with a per-item "demonstrated safely in
    practice" sign-off, and Wales has a Once for Wales MPAD (document not
    found, unverified).
    [MORA guide](https://www.kcl.ac.uk/nmpc/assets/practice-learning/mora-guide.pdf),
    [Scottish MPAD](https://campusmoodle.rgu.ac.uk/public/Nursing_and_Midwifery/documents/ClinicalDocs/mpad.pdf).

  - **CapitalMidwife Skills Passport** (HEE London, v1 April 2019, a 12-page
    paper booklet) – exactly the shape of this passport. Ten annually taught
    skills (adult and neonatal resuscitation, sepsis, antepartum and
    postpartum haemorrhage, eclampsia, shoulder dystocia, breech, cord
    prolapse, intrapartum fetal monitoring) and three "competency achieved"
    items (intravenous administration including blood products, intravenous
    cannulation, perineal suturing), each with trainer name, PIN and site. No
    copyright wording and no digital version found.
    [PDF](https://www.hee.nhs.uk/sites/default/files/documents/CapitalMidwife%20Skills%20Passport.pdf).

  - **NHS England maternity frameworks** (England, OGL v3) – the Core
    Competency Framework v2 (May 2023, in force January 2024, incentivised
    through the CNST maternity incentive scheme) names six training modules
    with attendance targets and an annual fetal monitoring assessment,
    training content rather than skills; the Maternity Support Worker
    Competency, Education and Career Development Framework (May 2024,
    replacing HEE's 2019 edition) covers levels 2 to 4 with four domains, 14
    competencies and mostly behavioural indicators, and its toolkit expects
    practice development midwives to sign a local "competency skills
    passport" with no national template; the newborn and infant physical
    examination requirements (July 2023) ask for an accredited course plus a
    locally agreed assessment, with no item list.
    [CCF v2](https://www.england.nhs.uk/publication/core-competency-framework-version-two/),
    [MSW framework](https://www.england.nhs.uk/long-read/maternity-support-worker-competency-education-and-career-development-framework/),
    [NIPE](https://www.england.nhs.uk/long-read/newborn-and-infant-physical-examination-training-requirements/).

  - **Advanced and specialist** – the Advanced Clinical Practice in Midwifery
    capability framework (Centre for Advancing Practice, November 2022) has 18
    broad capabilities mapped to NMC numbers; the perinatal mental health
    competency framework (HEE and the Tavistock, 2018) is stale by its own
    admission. Neither seeds anything.
    [ACP midwifery PDF](https://advanced-practice.hee.nhs.uk/wp-content/uploads/sites/28/2024/04/Advanced%20Clinical%20Practice%20in%20Midwifery%20-%20Capability%20Framework.pdf).

  - **Neonatal nursing** – NHS England's national standards for neonatal
    qualified-in-specialty education (November 2024, England, HTML, OGL v3)
    set ten domains at foundation and specialist levels with unnumbered
    knowledge, skill and equipment bullets, with the RCN accrediting providers
    from 2026. The older BAPM, NNA and SNNG "matching knowledge and skills"
    document (2012, about 100 performance criteria such as "set up, maintain
    and discontinue intravenous therapy" and "initiate phototherapy") is more
    granular but BAPM copyright with no reuse terms; BAPM's ANNP capabilities
    framework (2021) is broad. The 2021 HEE review of neonatal QIS recommended
    one national standard and a skills toolkit, which is the gap a specialty
    list here would fill.
    [QIS standards](https://www.england.nhs.uk/long-read/national-standards-for-neonatal-qualified-in-specialty-qis-education/),
    [BAPM 2012](https://www.bapm.org/resources/35-matching-knowledge-and-skills-for-qualified-in-specialty-qis-neonatal-nurses-2012).

  - **RCM** – a career framework only (four pillars, a quiz, no
    competencies); its 2016 standards are service standards. All rights
    reserved, personal and non-commercial use only.
    [Career framework](https://rcm.org.uk/career-framework/).

  - **Devolved nations** – the NES NMAHP framework above applies, licensed
    CC BY-NC 4.0 with commercial use needing NES's written permission, and
    Turas Professional Portfolio is free to every Scottish nurse and midwife;
    HEIW's Once for Wales preceptorship framework for midwives (v6, April 2026) carries signed skill sheets (perineal suturing with itemised steps,
    intravenous additives, a 13-item clinical skills list, NIPE Cymru), with
    reproduction needing permission; NIPEC's model (December 2025) has no
    midwifery list.
    [Turas portfolio](https://turasnmportfolio.nes.nhs.scot/).

  - **Most useful** – Domain 6, the regulator's own numbered UK-wide list,
    already the sign-off list in MORA and both devolved MPADs, reproducible
    unaltered with credit. CapitalMidwife's 13 skills and the CCF v2 modules
    suggest the order of a midwifery specialty list; the NHS England QIS
    standards suggest a neonatal one.

- [x] **Paramedics and the ambulance workforce** – No paramedic framework is
      a ready checklist; the one discrete list is specialist-level and
      unlicensed, and the only clean licence is on the apprenticeship
      standards.

  - **HCPC Standards of proficiency: paramedics** (in force 1 September 2023;
    UK-wide; registration) – 15 generic standards with 122 sub-statements, all
    broad; no procedure is named. HTML and PDF. The HCPC publishes no reuse
    terms anywhere on its site, only a footer copyright, so permission has to
    be asked.
    [Page](https://www.hcpc-uk.org/standards/standards-of-proficiency/paramedics/),
    [PDF](https://www.hcpc-uk.org/globalassets/standards/standards-of-proficiency/reviewing/paramedics---new-standards.pdf).

  - **College of Paramedics** (now styled the Royal College of Paramedics) –
    the Paramedic Curriculum, 6th edition (April 2024, v1.2) has eight content
    domains C1.1 to C1.8 plus practice-based education, with outcomes phrased
    observably ("describe, demonstrate and interpret a 12-lead ECG",
    "demonstrate newborn life support"), but the numbered set lives in a
    separate Programme Endorsement Guidebook and there is no consolidated
    procedure list. The Paramedic Career Framework (5th edition revised,
    September 2023) is a map of four pathways by four tiers (paramedic,
    specialist or enhanced, advanced, consultant), not a skills set; the
    post-graduate career guidance (April 2023) aligns with the Centre for
    Advancing Practice and points to RCEM and FICM for credentialing. All
    College material is all rights reserved: "you may not, except with our
    express written permission, distribute or commercially exploit the
    content".
    [Curriculum](https://collegeofparamedics.co.uk/COP/ProfessionalDevelopment/Paramedic_Curriculum_Guidance.aspx),
    [Career framework](https://collegeofparamedics.co.uk/COP/ProfessionalDevelopment/post_reg_career_framework.aspx),
    [Copyright notice](https://collegeofparamedics.co.uk/COP/About_Us/Copyright_Notice.aspx).

  - **Paramedic Specialist in Primary and Urgent Care Core Capabilities
    Framework** (HEE and Skills for Health with the College; finalised
    September 2018, published 2019; England) – four domains and 14
    capabilities, and its Appendix 2 is the one discrete list: about 95
    clinical skills under 15 headings ("undertake venous cannulation",
    "perform appropriate abdominal examination/assessment including digital
    rectal examination", resuscitation to intermediate life support level).
    Already the basis of sign-off in GP training hubs, the College's
    FourteenFish portfolio and its Diploma in Primary and Urgent Care. No
    licence statement anywhere in the PDF.
    [PDF](https://www.hee.nhs.uk/sites/default/files/documents/Paramedic%20Specialist%20in%20Primary%20and%20Urgent%20Care%20Core%20Capabilities%20Framework.pdf).

  - **Newly qualified paramedic consolidation** (agreed October 2016 by the
    English ambulance trusts, staff side, the College and NENAS; portfolio v6
    February 2017; adopted in Northern Ireland and Scotland) – up to 24 months
    of practice educator reports against learning outcomes in sections A to
    G; reflective evidence, not procedure sign-off. Only a third-party mirror
    of the document was found.

  - **Skills England apprenticeship standards** (England; Crown copyright
    under OGL v3; JSON API) – ST0287 Associate ambulance practitioner, level 4
    (v1.3; the role EMTs and ambulance technicians train to; coarse knowledge,
    skills and behaviours today, with a draft revision coded K1 to K45 and S1
    to S41); ST0627 Ambulance support worker, level 3 (2018; 32 observable
    skills such as basic life support and defibrillation, administering a
    medical gas, physiological measurements); ST0567 Paramedic, level 6 (v2.0
    from 25 March 2026; S1 to S76 restating the HCPC standards). The cleanest
    licence in the whole set and the only machine-readable source found.
    [ST0287](https://skillsengland.education.gov.uk/apprenticeship-standards/st0287),
    [ST0627](https://skillsengland.education.gov.uk/apprenticeship-standards/st0627),
    [ST0567](https://skillsengland.education.gov.uk/apprenticeship-standards/st0567),
    [API](https://skillsengland.education.gov.uk/api/apprenticeshipstandards).

  - **Not competency frameworks** – AACE publishes none (its 2021 clinical
    supervision framework lists supervisor competencies); JRCALC is clinical
    guidance sold by Class Professional. Paramedic prescribers (since April 2018) are assessed against the RPS framework, which the HCPC adopted.

  - **Devolved nations** – the HCPC and College documents apply everywhere;
    Scotland trains technicians in-house to the FutureQuals associate
    ambulance practitioner diploma and runs a 12 to 18 month NQP programme;
    Wales has HEIW's 2023 enhanced, advanced and consultant framework with
    WAST on its task group; Northern Ireland's NIAS uses the FutureQuals
    diploma and the English NQP framework. No nation adds a paramedic skills
    list.

  - **Most useful** – Appendix 2 of the specialist framework, paired with the
    6th-edition C1.3 outcomes for core practice, once NHS England confirms
    reuse. If licence certainty matters more than granularity, the Skills
    England standards are reusable now but broad.

- [x] **How paramedics keep a portfolio today** – They must keep one, and
      most already have a digital one from their employer, but it is a CPD
      diary, not a record of signed-off skills. Looked into separately on 1
      October 2026 because paramedics have no regulator skills list to seed
      from, so what the passport offers them has to be clear.

  - **Why they need one** – the HCPC's CPD standards require a continuous,
    up-to-date record. Registration renews every two years, and at each
    renewal the HCPC audits a random 2.5% of the profession, who must send a
    CPD profile with evidence; 653 paramedics were audited for 2021 to 2023.
    Nobody registered for under two years is audited. The HCPC names no tool.
    [HCPC audit data](https://www.hcpc-uk.org/about-us/insights-and-data/cpd/),
    [HCPC guidance](https://www.hcpc-uk.org/globalassets/resources/guidance/continuing-professional-development-and-your-registration.pdf).

  - **ParaFolio** (Class Professional Publishing, who also publish JRCALC;
    iOS, Android and web; launched 2023) – the incumbent. A CPD portfolio for
    evidence, reflections and learning notes that pulls in reading from the
    JRCALC Plus app and quizzes from ParaPass, Class's CPD platform, with one
    press, and exports for audit. Every English ambulance trust subscribes to
    ParaPass for its registered paramedics and ParaFolio comes with it, so in
    effect every NHS paramedic in England already has it free; bought alone
    it is £1.99 a month or £19.99 a year. Trusts can add modules (NQP,
    preceptorship, EPRR commander, HART, telephone triage) and some run their
    preceptorship through it. Two weaknesses: the employer can see what is in
    it (an App Store review reads "I didn't realise when logging all my CPD
    and personal reflections that my employer can read and see them all", and
    the privacy policy says data may be shared with the trust), and no
    supervisor or assessor sign-off of a skill is described anywhere.
    [ParaFolio](https://www.classprofessional.co.uk/apps/parafolio/),
    [App Store](https://apps.apple.com/gb/app/parafolio/id6449023723),
    [ParaPass for trusts](https://www.classprofessional.co.uk/2023/04/28/parapass-for-ambulance-trusts/),
    [privacy policy](https://www.classprofessional.co.uk/terms-of-use/parafolio-privacy-policy-terms-and-conditions/).

  - **FourteenFish paramedic portfolio** (with the College of Paramedics, 2023) – for paramedics in primary care. It holds the first contact
    practitioner and advanced practice roadmap, supervisors sign off the
    evidence, and it converts to an appraisal account afterwards. £42 a year.
    The same platform GPs use, which is why it suits general practice and
    nowhere else.
    [College announcement](https://collegeofparamedics.co.uk/COP/News/2023/Fourteen_Fish_ePortfolio_for_Primary_Care_Paramedics.aspx),
    [FourteenFish support](https://support.fourteenfish.com/hc/en-gb/categories/12074081482397-Paramedic-Portfolio).

  - **Trust ePortfolios for the first two years** – the NQP consolidation
    outcomes are recorded on an employer's ePortfolio. South East Coast
    Ambulance Service's preceptorship procedure (v4, July 2024) requires it
    "100% complete" to finish preceptorship and treats being 30% behind as a
    concern; the product is not named. It belongs to the trust, so it stays
    behind when the paramedic leaves.
    [SECAmb procedure](https://www.secamb.nhs.uk/wp-content/uploads/2024/08/Clinical-Preceptorship-Procedure.pdf).

  - **Students and advanced practitioners** – students use their university's
    practice assessment document, on paper or on MyProgress, PebblePad or
    PARE; advanced practitioners use the Centre for Advancing Practice or
    RCEM ePortfolios; Scotland has Turas. Five systems across one career, and
    none carries over to the next.

  - **The gap** – no system holds what a paramedic has been watched doing and
    signed off for, skill by skill, in a form they keep. Yet trusts depend on
    exactly that: SECAmb's scope of practice policy (v15, January 2026) keeps
    a skills matrix per grade on its intranet and says staff may only use
    skills they have evidence of current competency in and have used within
    the last 12 months, without naming where that evidence lives. That is a sign-off with an expiry, which is what
    `expires_after_months` on a competency already models. It matters most to
    the paramedics ParaFolio serves least: those who move between trusts, or
    work for private ambulance and event medical providers, or in primary
    care, and have no trust subscription.
    [SECAmb policy](https://www.secamb.nhs.uk/wp-content/uploads/2026/06/FOI-260430a-Scope-of-Practice-and-Clinical-Standards-Policy-v15.pdf).

  - **What this means for the passport** – do not compete on CPD logging,
    where ParaFolio is free, bundled and fed by JRCALC. Offer the two things
    it does not: assessor-signed skills with a currency date, and a record
    the holder owns and takes with them. A trust's own skills matrix is also
    a better seed for a paramedic specialty list than any national document,
    if a trust will share one.

- [x] **Pharmacy and prescribing** – The regulator's outcomes are the only
      freely reusable pharmacy text; the finer lists belong to a college that
      forbids reproduction. Two names changed this year: the Royal
      Pharmaceutical Society became the Royal College of Pharmacy (RCPharm) on
      15 April 2026, and its PDFs still say RPS; NHS Education for Scotland
      merged into Public Services Delivery Scotland on 1 April 2026, and its
      pages are still live.

  - **GPhC Standards for pharmacy professionals** (May 2017; Great Britain,
    with the PSNI adopting the GPhC education standards for Northern Ireland;
    a full review planned for 2026/27) – nine conduct standards with short
    bullets; broad; not sign-off material.
    [PDF](https://assets.pharmacyregulation.org/files/standards_for_pharmacy_professionals_may_2017_0.pdf?VersionId=C8dRrU1opDLdsuveSss5cKsPSwKObTi2).

  - **GPhC Standards for the initial education and training of pharmacists**
    (January 2021, v1.4; the prescriber-on-registration route applies from
    2025/26) – 55 numbered learning outcomes in four domains (person-centred
    care and collaboration 1 to 14, professional practice 15 to 44,
    leadership and management 45 to 52, education and research 53 to 55),
    each with a Miller's level for year 4 and the foundation year. Mixed
    granularity: "32. Accurately perform calculations", "37. Prescribe
    effectively" and "44. Respond appropriately to medical emergencies" are
    discrete, most are broad. PDF only.
    [PDF](https://assets.pharmacyregulation.org/files/2024-01/Standards%20for%20the%20initial%20education%20and%20training%20of%20pharmacists%20January%202021%20final%20v1.4.pdf).

  - **GPhC Standards for the education and training of pharmacist independent
    prescribers** (October 2022; implementation guidance January 2025) – 32
    numbered outcomes in four domains with Miller's levels, plus nine
    standards for course providers including 90 hours of learning in practice
    under a designated prescribing practitioner. The GPhC keeps its own
    outcomes rather than adopting the RCPharm framework.
    [PDF](https://assets.pharmacyregulation.org/files/document/standards-for-the-education-and-training-of-pharmacist-independent-prescribers-october-2022.pdf).

  - **GPhC pharmacy technician standards** – the October 2017 standards still
    govern courses, but Council approved new ones on 16 July 2026 (level 4,
    final accuracy checking as a core competency, new programmes from 2028,
    full implementation by autumn 2029); the October 2025 consultation draft
    listed 52 outcomes, several discrete ("19. Prepare, dispense and supply
    medicines", "34. Carry out final accuracy checking of medicines"). The
    2017 PDF and the final 2026 count are unverified.
    [Consultation draft](https://assets.pharmacyregulation.org/files/2025-10/gphc-consultation-draft-standards-initial-education-training-pharmacy-technicians-october-2025.pdf).

  - **GPhC licence**, inside each PDF – "The text of this document (but not
    the logo and branding) may be reproduced free of charge in any format or
    medium, as long as it is reproduced accurately and not in a misleading
    context. This material must be acknowledged as General Pharmaceutical
    Council copyright and the document title specified." No non-commercial
    clause. The website's own terms reserve all rights, so the freedom is on
    the documents, not the site.

  - **RCPharm Competency Framework for all Prescribers** (published 1
    September 2021, effective September 2022, review begun for September 2026) – two domains, ten competencies, 76 numbered supporting statements
    (1.1 to 10.4) with lettered notes; many observable ("takes and documents
    an appropriate medical, psychosocial and medication history", "requests
    and interprets relevant investigations"). Adopted by the NMC (2018,
    refreshed edition November 2021) for every prescriber on its register and
    by the HCPC (updated 1 September 2022) for podiatrists, paramedics,
    physiotherapists and therapeutic radiographers, with supplementary
    prescribing for dietitians and diagnostic radiographers; the GPhC keeps
    its own outcomes; the PSNI's prescribing standards date from 2013; no
    GOC, GMC or GDC adoption found. English and Welsh PDFs.
    [Page](https://www.rcpharm.org/professional-standards/a-competency-framework-for-all-prescribers/),
    [PDF](https://www.rcpharm.org/wp-content/uploads/2026/04/A-Competency-Framework-for-All-Prescribers-English.pdf).

  - **RCPharm curricula** – the Post-registration Foundation Pharmacist
    Curriculum (2021, v1.2.3 August 2025; five domains, 13 capabilities,
    descriptors mapped to the 2019 framework, the GPhC prescribing standards
    and the prescribing framework) is being replaced from summer 2026 by the
    Enhanced Pharmacist Curriculum (published 7 September 2026; all four
    nations; newly qualified prescribers): five domains, 24 outcomes numbered
    1.1 to 5.4, each with lettered indicators of expected performance
    (roughly 100 to 150 in all, such as "2.2 undertakes relevant examinations
    and interprets findings"), assessed by ACAT, DOPS, mini-CEX, CbD and
    multi-source feedback and signed off by an educational supervisor, with
    three credential routes. Above it sit the Core Advanced Pharmacist
    Curriculum (pathway launched March 2023, undated PDF; five domains,
    broad, credentialed by committee at £375) and the Consultant Pharmacist
    Curriculum (2020; five domains, nine capabilities, broad, £450). The 2014
    Foundation Pharmacy Framework (26 competencies, about 90 behavioural
    statements) and the 2019 Foundation Pharmacist Framework are superseded
    and their URLs now 404. E-portfolios at portfolio.rpharms.com and
    eportfolio-enhanced.rcpharm.org, with licence codes from NHS England,
    HEIW or PSD Scotland; no API.
    [Enhanced curriculum](https://www.rcpharm.org/wp-content/uploads/2026/09/00609-2608-Enhanced-Curriculum-020926-1.pdf),
    [Core advanced](https://www.rcpharm.org/wp-content/uploads/2026/04/RPS-Core-Advanced-curriculum-FINAL-a.pdf),
    [Consultant](https://www.rcpharm.org/wp-content/uploads/2026/04/RPS-Consultant-Pharmacist-Curriculum-2020_FINAL-1.pdf),
    [e-portfolio](https://www.rcpharm.org/e-portfolio/).

  - **RCPharm licence** – "No part of the RCPharm.org service may be
    reproduced or distributed in any material form or medium" without
    permission; content is for personal non-commercial use unless a licence
    is purchased; "data scraping and text mining ... is not permitted". This
    blocks seeding from RCPharm text without a licence.
    [Copyright](https://www.rcpharm.org/copyright/).

  - **APTUK** (pharmacy technicians, UK-wide) – the National Education
    Framework for the Final Accuracy Checking of Dispensed Medicines and
    Products (v1 September 2019, v1.2 February 2026): 30 practical learning
    outcomes with Miller's levels ("perform calculations to final accuracy
    check prescriptions", "identify, rectify and report near misses"),
    delivered as CPPE's ACPT programme in England (a 1,000-item checking log
    and a 200-item dispensing log in an e-portfolio, mapped to NOS PHARM28),
    by NICPLD in Northern Ireland, by HEIW in Wales and as an SQA award in
    Scotland. The National Competency Framework for Primary Care Pharmacy
    Technicians (with the PCPA, September 2020): four domains, 13
    competencies, about 90 core practice criteria with Miller's levels,
    practical. APTUK's own Foundation Pharmacy Framework PDF now 404s.
    Licence: personal, non-commercial use; reproduction or commercial
    exploitation needs written permission from the APTUK board.
    [ACPT framework](https://www.aptuk.org/resources/11/acpt_national_framework),
    [Primary care framework](https://www.aptuk.org/resources/32/national_competency_framework_for_primary_care_pharmacy_technicians),
    [CPPE handbook](https://www.cppe.ac.uk/wizard/files/acpt_programme-handbook.pdf).

  - **Devolved nations** – Scotland's foundation training year (NES, now PSD
    Scotland; strategy v1-F, 2024) assesses the GPhC 2021 outcomes through
    supervised learning events on Turas Learn and uses the RCPharm core
    advanced curriculum for advanced practice, under NES's non-commercial
    terms; Wales has no pharmacy framework of its own and its 2026 model of
    support uses the RCPharm Enhanced curriculum; Northern Ireland's NICPLD
    closed its foundation programmes and starts Enhanced Pharmacy Practice in
    January 2027, with the PSNI's Code effective 26 January 2026.
    [NES foundation strategy](https://www.nes.scot.nhs.uk/media/daih0ubn/nesd1887-nes-pharmacy-foundation-training-year-curriculum-and-assessment-strategy-v1-f.pdf),
    [HEIW PRFP](https://heiw.nhs.wales/education-training/a-z/pharmacy/prfp-2026-model-of-support/),
    [NICPLD plans](https://www.nicpld.org/courses/postreg-fp/plans.asp).

  - **Nothing is machine-readable** – every framework is PDF or HTML, and no
    e-portfolio exposes an API.

  - **Most useful** – the GPhC pharmacist initial education and training
    standards (2021), 55 numbered outcomes: regulator-owned,
    prescriber-inclusive from 2026, and reproducible free of charge with
    acknowledgement. The 76 prescribing statements and the Enhanced
    curriculum's indicators are finer but licence-locked, so they are a
    mapping target to seek permission for; for technicians, APTUK's 30
    accuracy-checking outcomes once APTUK agrees.

- [x] **Allied health professions** – The HCPC's profession-specific
      standards are the one UK-wide numbered list across all 14 professions;
      the professional bodies publish career ladders rather than skills, and
      discrete sign-off lives in niche schemes.

  - **HCPC Standards of proficiency** (in force 1 September 2023; UK-wide;
    entry threshold) – the same 15 numbered standards for every profession
    (1 "practise safely and effectively within their scope of practice" to 15
    "promote health and prevent ill health"), sub-standards numbered 1.1,
    13.12 and so on, shared ones in bold and profession-specific ones in
    plain text. Sub-standard counts, with the profession-specific share in
    brackets: physiotherapists 112 (21), occupational therapists 127 (37),
    dietitians 121 (29), radiographers 180 (73, tagged diagnostic or
    therapeutic), ODPs 132 (43), podiatrists 121, speech and language
    therapists 115 (34), orthoptists 140 (42), prosthetists and orthotists
    120 (37), clinical scientists 123 (41), biomedical scientists 129 (37),
    practitioner psychologists 215 (121, tagged by modality), arts therapists
    113 (32), hearing aid dispensers 115 (35). Mostly broad; the
    procedure-like items cluster under standard 13, roughly 5 to 15 per
    profession ("13.20 undertake venepuncture, peripheral intravenous
    cannulation and blood sampling" for ODPs, "13.19 measure and cast for
    prostheses and orthoses" for prosthetists and orthotists, "13.16 safely
    and competently take impressions of the ear" for hearing aid dispensers).
    HTML, PDF and Word; no structured form. Copyright stated, no reuse terms
    anywhere; ask <policy@hcpc-uk.org>.
    [Index](https://www.hcpc-uk.org/standards/standards-of-proficiency/).

  - **Physiotherapy (CSP)** – the Physiotherapy Framework (2011, condensed
    2020; 17 domains, six levels, broad) is in practice replaced by the CSP
    Career Framework v1.0 (10 October 2024; six levels by four pillars, all
    UK countries), which says of itself "it is not a competency framework";
    its digital tool is members-only. Reproduction for personal use only, not
    for commercial gain.
    [Career framework](https://www.csp.org.uk/publications/physiotherapy-career-framework).

  - **Occupational therapy (RCOT)** – Career Development Framework, 2nd
    edition 2021 (review 2026, with a successor in development): four pillars
    by nine levels, descriptors coded like P5.1, broad. All rights reserved,
    personal and internal use only.
    [Page](https://www.rcot.co.uk/explore-resources/rcot-publications/career-development).

  - **Radiography (SoR)** – Education and Career Framework, 4th edition
    (November 2022, document v10a April 2025; diagnostic and therapeutic
    together): nine sections from support worker to consultant listing
    knowledge, skills and attributes, and the July 2025 mapping tools make
    them sign-off-able (coded EP.K.01 and EP.S.01, a 0 to 4 self-rating and a
    manager's signature). One personal copy only, otherwise written consent.
    [ECF](https://www.sor.org/ecf).

  - **Dietetics (BDA)** – Dietetic Career Framework v1 (April 2025, NHS
    England funded, review 2030): seven levels by four pillars, narrative
    capabilities, with an HTML table tool. No licence found (unverified).
    [Page](https://www.bda.uk.com/practice-and-education/career-and-workforce/bda-career-framework.html).

  - **Speech and language therapy (RCSLT)** – Professional Development
    Framework (2023; v2 May 2026): broad. Discrete sign-off is in the
    Dysphagia Training and Competency Framework (2014; levels A to D; signed
    evidence verified by a skilled supervisor; reportedly replaced by a 2025
    eating, drinking and swallowing framework, unverified). No reuse terms
    found.
    [PDF](https://www.rcslt.org/learning/professional-development-framework/),
    [Dysphagia](https://www.rcslt.org/wp-content/uploads/media/Project/RCSLT/dysphagia-training-competency-framework.pdf).

  - **Podiatry (RCPod)** – Podiatry Career Framework, 1st edition (September
    2021): four domains, capability levels A to F; the discrete capabilities
    sit in eight linked frameworks (MSK, lower-limb viability, the diabetic
    foot, first contact and advanced practice). Copyright RCPod, no reuse
    terms.
    [Page](https://rcpod.org.uk/workforceprogramme/modernisation-and-reform/the-career-framework),
    [Frameworks](https://studenthub.rcpod.org.uk/frameworks-home).

  - **Orthoptics (BIOS)** – Professional Development Framework v2.0 (June
    2025, "open access", UK and Ireland): four domains, seven levels.
    Discrete sign-off is the Ophthalmic Common Clinical Competency Framework
    (2019; RCOphth, RCN, the College of Optometrists, BIOS and AHPO; four
    areas by three levels, workplace-based assessment, curricula published as
    Excel).
    [BIOS](https://orthoptics.org.uk/bios-launch-professional-development-framework/),
    [OCCCF](https://www.hee.nhs.uk/our-work/advanced-clinical-practice/ophthalmology-common-clinical-competency-framework-curriculum).

  - **Prosthetics and orthotics, arts therapies, practitioner psychologists,
    hearing aid dispensers** – BAPO's career development framework (2024,
    levels 1 to 9 by four pillars) and the arts therapists' clinical career
    framework (BAAT, BADth and BAMT, 30 September 2025) are employability
    statements; the BPS accreditation standards are programme-level; BSHAA
    publishes guidance only, with the level 5 apprenticeship standard ST0600
    mapping duties to the standards of proficiency.
    [BAPO](https://www.bapo.com/inspiring-your-brilliant-career/),
    [Arts therapies](https://baat.org/download/12245/clinical-career-framework-arts-therapists-baat.pdf),
    [ST0600](https://www.instituteforapprenticeships.org/apprenticeship-standards/st0600-v1-2).

  - **Biomedical and clinical scientists** – the IBMS Registration Training
    Portfolio v5.0 (September 2025) tags every HCPC standard as knowledge or
    competence and is signed off module by module in OneFile by the training
    officer and then an IBMS verifier; personal, non-commercial use, all
    rights reserved. The NSHCS STP curriculum library (667 modules for the
    2018 to 2026 cohorts; competencies coded like SCC110/17; signed in
    OneFile; HTML only, no export) is the model of how granular and coded a
    catalogue can be.
    [IBMS](https://www.ibms.org/qualifications/registration/certificate-of-competence.html),
    [NSHCS STP](https://curriculumlibrary.nshcs.org.uk/stp/).

  - **Operating department practice (CODP)** – a 2018 BSc curriculum, with a
    2024 edition cited by 2025/26 programme specifications; the CODP site
    could not be read, so the edition and licence are unverified.

  - **Cross-AHP schemes** – the AHP support worker framework (HEE, October
    2021; eight domains by three levels, about 60 items coded like 2.7; the
    Learning Hub copy is CC BY-NC 4.0); the AHP preceptorship standards (NHS
    England, November 2023) are organisational; the multi-professional
    advanced practice framework applies as below.

  - **Devolved nations** – Scotland's NES NMAHP framework codes its
    knowledge, skills and behaviour statements by level, pillar and number
    ("5C1 use a range of skills and strategies to communicate with people
    about difficult matters"), CC BY-NC 4.0, and Turas holds CPD and audit
    evidence rather than sign-off; Wales has a strategic AHP framework (Welsh
    Government, 2019) and HEIW's advanced practice framework; Northern
    Ireland has no AHP career or competency framework, only OGL policy
    documents.

  - **Most useful** – the HCPC standards' profession-specific sub-standards
    under 12 to 14: UK-wide, regulator-owned, identically numbered across 14
    professions, free in HTML, and already the spine of real sign-off (IBMS
    tags every one; apprenticeship standards map to them). Standard 13 items
    are passport-ready as written; the broader ones become headings under
    which the niche schemes (dysphagia levels, the OCCCF, the SoR mapping
    tools, the RCPod capability frameworks) supply ordered lists. The licence
    has to be asked for first.

- [x] **Frameworks that cut across professions** – Capability frameworks are
      not sign-off material; the discrete lists are the National Occupational
      Standards, the Care Certificate and the colleges' procedure lists.

  - **Multi-professional framework for advanced practice in England 2025**
    (NHS England, 2nd edition, replacing HEE's 2017 framework; England only;
    all registered professions at master's level) – four pillars, 38
    capabilities 1.1 to 4.8, broad. The Centre for Advancing Practice's
    ePortfolio route (at most 35 evidence items, one or two per capability)
    and "Advanced" digital badge run on it; 14 area-specific capability
    frameworks are endorsed with PDFs (acute medicine, older people, mental
    health, respiratory, paediatrics and others) and new ones are paused
    pending the NHS England and DHSC merger. Copyright NHS England with no
    reuse terms; the area-specific ones say to seek the permission of both
    publishers.
    [MPF 2025 PDF](https://advanced-practice.hee.nhs.uk/wp-content/uploads/sites/28/2025/05/Multi-professional-framework-for-advanced-practice-in-England-%E2%80%93-Edition-2025.pdf),
    [endorsed frameworks](https://advanced-practice.hee.nhs.uk/area-specific-capabilities/centre-endorsed/).

  - **College curricula with procedure lists** – RCEM's Emergency Medicine
    ACP curriculum (2nd edition, April 2025; about 22 practical procedures
    with a procedural log, credentialing on the RCEM ePortfolio); FICM's ACCP
    curriculum v2 (September 2023; about 13 "can perform" procedures and
    roughly 97 assessable statements, each tagged with an assessment method);
    the RCS Surgical Care Practitioner curriculum framework (October 2022; 18
    DOPS procedures from venepuncture to ABPI by Doppler); the FPA Physician
    Associate curriculum (September 2023, hosted by the RCP; 21 practical
    procedures with a ten-step checklist). None carries a copyright statement.
    The four lists overlap heavily and between them describe a ready "common
    procedures" specialty.
    [RCEM](https://rcem.ac.uk/acp-curriculum-2022/),
    [FICM](https://www.ficm.ac.uk/sites/ficm/files/documents/2023-09/ACCP_Curriculum_v2_2023_Part_III_Syllabus_0.pdf),
    [RCS](https://www.rcseng.ac.uk/-/media/files/rcs/education-and-exams/accreditation/rcs--curriculum-framework-for-scp-2022.pdf),
    [PA](https://www.rcp.ac.uk/media/y2roes14/physician-associate-curriculum-2023.pdf).

  - **Physician associates and anaesthesia associates** – GMC regulation
    began on 13 December 2024; the GMC's generic and shared learning outcomes
    (September 2022, about 61 outcomes) may be reproduced free of charge with
    acknowledgement, the most permissive terms found anywhere.
    [GMC outcomes](https://www.gmc-uk.org/-/media/documents/pa-and-aa-generic-and-shared-learning-outcomes_pdf-87633490.pdf).

  - **Core Skills Training Framework** (Skills for Health with HEE; England
    subject guide v1.1, June 2021; UK v1.6, 2019) – 11 statutory and mandatory
    subjects with about 250 lettered learning outcomes, mostly knowledge,
    resuscitation the practical exception. All rights reserved. NHS England's
    statutory and mandatory training programme (November 2024, OGL) reports
    89% of trusts aligned and a replacement competency framework scheduled for
    2025, publication unverified. ESR's competency inbound interface moves
    these between employers; the NHS Digital Staff Passport is reported
    retired on 5 December 2025 (unverified).
    [CSTF](https://www.skillsforhealth.org.uk/info-hub/statutory-mandatory-core-skills-training-framework-cstf/),
    [NHS England programme](https://www.england.nhs.uk/long-read/statutory-and-mandatory-training-programme/).

  - **Core Capabilities Frameworks** (Skills for Health, Skills for Care and
    NHS England for DHSC) – mental health (February 2026), autism (2019),
    learning disability (2019), dementia (2018), frailty (2018), end of life
    care (2017), person-centred approaches (2017), medical associate
    professions (June 2022) and ACP nurses in general practice (2020). Tiered
    capability statements, not skills. Every one carries the same licence:
    copies for non-commercial purposes to aid workforce development, anything
    else needs the publishers' permission.
    [Index](https://www.skillsforhealth.org.uk/resources/category/capabilities-frameworks/).

  - **Care Certificate** (updated March 2025; England; non-regulated health
    and care workers) – 16 standards and 208 assessment criteria coded like
    1.2d, each pairing an outcome with what the learner must do, genuinely
    sign-off-able (12.1 requires practical basic life support). Copyright of
    four public bodies with no reuse terms in the PDF. The AHP support worker
    framework (HEE, October 2021) sits beside it and recommends employers
    build skills passports.
    [Care Certificate PDF](https://www.skillsforcare.org.uk/resources/documents/Developing-your-workforce/Care-Certificate/Care-Certificate-Standards/Care-Certificate-standards-March-2025.pdf),
    [AHP support worker PDF](https://www.hee.nhs.uk/sites/default/files/documents/AHP_Framework%20Final_0.pdf).

  - **National Occupational Standards** (ukstandards.org.uk, approved by all
    four nations) – the Clinical Health Skills suite alone has 268 units, each
    one workplace function with performance criteria and knowledge, written
    to be assessed, with stable codes; other suites cover general healthcare
    (125), emergency, urgent and scheduled care (66), perioperative care
    support (33), maternity and care of the newborn (27) and more. PDF or Word
    per unit, no bulk download or API. Licence not stated, and the
    data.gov.uk entry is marked unpublished, so the NOS governance group has
    to be asked.
    [NOS](https://www.ukstandards.org.uk/).

  - **Too broad or out of scope** – the NHS Knowledge and Skills Framework
    (2004, simplified 2010) is six dimensions still shipped in ESR; healthcare
    science has the NSHCS curriculum library (signed off in OneFile) and the
    AHCS standards of proficiency; dentistry has the GDC's Safe Practitioner
    framework (in force 1 August 2025, one PDF per profession, dental nurse 76
    outcomes); optometry has the GOC's requirements (2021, 52 outcomes, free
    reuse with acknowledgement).
    [NSHCS](https://curriculumlibrary.nshcs.org.uk/),
    [GDC](https://www.gdc-uk.org/education-cpd/dental-education/quality-assurance/learning-outcomes-and-behaviours),
    [GOC](https://optical.org/static/54e78564-f5c2-4f1c-b2c47250126f8f9d/requirements-for-approved-qualifications-in-optometry-and-dispensing-optics.pdf).

  - **Most useful** – the NOS Clinical Health Skills suite, if its licence
    allows. Otherwise the Care Certificate for the support workforce and the
    four college procedure lists for registered clinicians.

- [x] **Clinical informatics: the FCI framework and the FEDIP register** – A
      profession with no sign-off culture, but with the one thing every
      clinical framework above lacks: a single owner for both the competency
      list and the credential, and an open licence. From a research note of
      1 October 2026, with its open checks answered against the code.

  - **The framework** – the Faculty of Clinical Informatics Core Competency
    Framework (University of Manchester and the FCI, v1, 23 July 2020, on
    Zenodo): six domains, 36 subdomains, 111 competencies, built to be
    mapped to education and professional initiatives and reviewed by over
    100 people. The FCI never shipped a tool for recording progress against
    it. Licence: the Zenodo record's own metadata reads `cc-by-4.0` (checked
    through the Zenodo API, DOI 10.5281/zenodo.3957992); the PDF carries no
    copyright or licence statement of its own, so the record is the only
    place the terms are stated. CC BY 4.0 allows copying, adapting and
    commercial use, on condition of crediting the authors (Moulton, Hassey,
    Davies and Mueller), linking the licence and saying what was changed,
    and it cannot be withdrawn for copies already taken. BCS, which now
    owns the FCI's documents, hosts the same file on bcs.org with the same
    DOI on its title page and no added copyright or licence wording, so the
    owner's own copy points back at the CC BY record; the title page names
    the FCI as sponsor and funder. The FCI accreditation scheme document
    (DOI 10.5281/zenodo.4008349) is CC BY 4.0 too. Ownership passing to BCS
    changes two things only: BCS may publish a later version on other
    terms, and BCS is who to ask. The licence does not cover the FCI or BCS
    names and logos, and the accreditation scheme makes logo use a matter
    of permission, so a specialty may cite the framework but must not call
    itself accredited or endorsed. One PDF.
    [Zenodo](https://zenodo.org/records/3957992),
    [BCS copy](https://www.bcs.org/media/tfblc4ny/fcicorecompetencyframeworkreport.pdf),
    [design paper](https://www.bcs.org/media/0wae4mei/ieee-designing-core-competency-framework-uk-clinical-informaticians.pdf).

  - **The register** – FEDIP, the Federation for Informatics Professionals in
    Health and Social Care, the UK's only public register for health
    informatics, hosted by BCS with registration awarded through its member
    bodies (BCS, IHRIM, AphA, CHIME, CILIP) at five levels from Associate to
    Leading Practitioner. Assessment is three STAR-format examples against
    nine professional competencies plus health-context criteria, verified by
    a supporter such as a line manager, with CPD evidence, renewed annually.
    Its only portable credential is an Open Badge per level, issued through
    Credly. [FEDIP](https://www.fedip.org/),
    [digital badges](https://www.fedip.org/digital-badges),
    [BCS on FEDIP](https://www.bcs.org/membership-and-registrations/get-registered/federation-for-informatics-professionals-fedip/).

  - **One owner** – the FCI closed in early 2024 and transferred its assets
    and over a thousand members to BCS, which is forming a Faculty of Health
    and Care. BCS now owns the framework and hosts the register, which
    removes the governance question the original passport plan raised for
    clinical frameworks, where the college, the society and the trust are
    different owners.
    [Digital Health](https://www.digitalhealth.net/2024/02/fci-votes-to-close-down-and-transfer-to-bcs/),
    [BCS invitation](https://www.bcs.org/articles-opinion-and-research/faculty-of-clinical-informatics-members-invited-to-join-bcs/).

  - **The proposition** – a clinical informatics specialty with the 111 CCF
    competencies loaded as assessable. A FEDIP applicant collects dated,
    attributed sign-offs or attestations against them and exports the
    passport as the evidence for registration and annual renewal; the member
    bodies receive auditable evidence instead of a self-written portfolio;
    Open Badges per level or per domain sit on top, issued by Quill or fed to
    Credly. Pitched as evidence feeding the register, never as a replacement
    for the register, for Credly or for BCS's own platforms. The buyer is
    BCS, the channel the member bodies; not a large contract but a credible
    one, and a second specialty whose framework owner is one institution.
    The main market stays the trusts, cancer alliances, UKONS, the RCR and
    deaneries that hold the paper booklets today.

  - **The note's checks, answered** – Sign-off model: most CCF competencies
    are knowledge, judgement or leadership statements, where the honest act
    is a supporter attesting rather than an assessor watching. `levels` are
    declared per competency and quote the framework's own words
    (`CompetencyLevel` in `backend/app/cbac/competencies.py`), so a CCF entry
    can carry a scale such as "Attested by a supporter" and "Observed in
    practice" with no code change, and the sign-off levels work of 27
    September 2026 records the level the assessor actually attested. Base
    profession: `passport_delegate` carries `assess_clinician_passport` with
    `requires_clinical_services: false`, so an informatician needs nothing
    new. External supporters: `PassportAssessorInvite` and the
    `passport_external_assessor` profession already give somebody outside
    any Quill organisation an account that can sign and nothing else.
    Self-sign-off is refused at the API, the only eligibility rule, and a
    holder can read and export their own passport (Markdown, PDF, bundle)
    without the feature enabled.

  - **Still open** – FEDIP assesses against its own nine professional
    competencies, not the CCF's 111, so a passport on the CCF is evidence for
    an application rather than a one-to-one mapping, and whether the member
    bodies would accept it is the first question for BCS. Nothing here has
    been put to BCS or FEDIP.

- [x] **Digital portfolios and credentials, across every profession** –
      Every profession researched already keeps a digital portfolio
      somewhere, so the passport is never the first system a clinician is
      asked to use. What exists, what each is for, and what follows.

  - **CPD diaries** – ParaFolio (paramedics; bundled with every English
    ambulance trust's ParaPass subscription and fed by JRCALC), FourteenFish
    (GPs, and primary care paramedics at £42 a year), the CSP ePortfolio, SoR
    CPD Now, NES's Turas Professional Portfolio (free to every nurse, midwife
    and AHP in Scotland, with a Northern Ireland instance), and the RCPharm
    e-portfolios (licence codes from NHS England, HEIW or PSD Scotland). They
    hold reflections and evidence for a regulator's audit; none records an
    assessor watching a skill.

  - **Training and sign-off platforms** – university practice assessment
    documents on PebblePad, MyProgress, ARC ePAD and PARE (the NMC annexes,
    MORA, the paramedic clinical assessment portfolio); OneFile (the NSHCS
    curriculum library and the IBMS registration portfolio); the RCEM
    ePortfolio on risr/advance; the Centre for Advancing Practice ePortfolio
    route; CPPE's ACPT e-portfolio with its 1,000-item checking log; trusts'
    own NQP ePortfolios. These do record sign-off item by item, and each
    belongs to the course, college or employer, so it ends when the
    programme does.

  - **National passport products** – Compassly (Tefogo) hosts the UKONS SACT
    and BOPA passports for about 10,000 users across more than 100 NHS
    organisations and is on the NHS Innovation Accelerator 2025; NHS Digital
    Learning Solutions carries the CC3N Steps. The closest things to this
    passport, each tied to one framework owner's scheme.

  - **Employer records** – ESR records statutory and mandatory competencies
    and the SACT passport as competencies and moves them between NHS
    employers through its competency inbound interface; the NHS Digital Staff
    Passport is reported retired on 5 December 2025 (unverified). Trusts'
    scope of practice skills matrices sit on intranets with no named system
    behind them.

  - **Portable credentials** – the one standard in play is Open Badges, now
    at 3.0 and itself a W3C verifiable credential. FEDIP issues one badge per
    registration level through Credly, and the Centre for Advancing Practice
    issues an "Advanced" digital badge. The original passport plan already
    named Open Badges 3.0 as the export format for a single sign-off, beside
    FHIR `Practitioner.qualification` and CSV for ESR, and deferred building
    any of them until a consumer appeared.
    [Original plan](2026-09-08-clinician-passport-plan.md).

  - **What follows for the passport** – Three things. It does not compete
    with the CPD diaries, which are free, bundled or regulator-adjacent; its
    ground is the signed-off skill with a currency date that the holder keeps
    when the course, employer or scheme ends. It needs a way in from the
    sign-off platforms, because a MORA or CC3N record is the evidence a
    holder wants to carry, and a way out to the credential standard, so Open
    Badges 3.0 export moves from "when a consumer appears" to a phase of the
    implementation plan, since FEDIP and the Centre are consumers already.
    And every one of these products shows the same line to hold: ParaFolio's
    employer can read the member's reflections, and a passport the holder
    owns must not.

- [x] **Group the sources by what their licence allows** – The pattern
      across all six groups: regulators and government are open or
      conditional, professional bodies and colleges are closed, and the
      richest discrete lists are nearly all in the closed group.

  - **Reusable now, commercially included** – Crown copyright under the Open
    Government Licence v3 (NHS England long-reads and publications, Skills
    England apprenticeship standards, Scottish Government papers, Northern
    Ireland government documents); the GPhC's standards, the GMC's outcomes
    and the GOC's requirements, each reproducible free of charge with
    acknowledgement and no non-commercial clause; and the FCI Core
    Competency Framework, Creative Commons Attribution 4.0, the only
    framework here under an open licence that names commercial use.

  - **Reproducible with conditions, commercial use unaddressed** – the NMC's
    standards, in part or in full, provided the current version is used
    unaltered, credited and linked; authors and publishers are pointed at a
    request form. The strongest nursing and midwifery sources sit here.

  - **Non-commercial only** – the Skills for Health core capabilities family;
    NES (CC BY-NC 4.0 on its framework, educational reuse on its site); the
    Learning Hub copy of the AHP support worker framework.

  - **All rights reserved or permission-only** – RCN, CC3N, UKONS, the College
    of Paramedics, RCPharm (which also forbids text mining), APTUK, RCOT, the
    Society of Radiographers, IBMS, CSP, HEIW, NIPEC, NHS Employers (KSF),
    RCM.

  - **No terms published** – the HCPC for every one of its professions, the
    HEE specialist paramedic framework, the Care Certificate PDF, the NOS
    database, the RCEM, FICM, RCS and PA curricula, BAPM, the NQP portfolio,
    the NSHCS curriculum library, RCSLT, RCPod, BDA, BAPO and the arts
    therapies. Silence is not permission.

- [x] **Sort the specialties by what can be added without asking anyone** –
      The licence groups above, turned into a list of specialties. A reading
      of each publisher's stated terms on 1 October 2026, not legal advice.

  - **Now, wording included** – open licences that cover commercial use and
    ask only for attribution. Clinical informatics (the FCI framework, 111
    competencies, CC BY 4.0). Pharmacy (the GPhC's 55 pharmacist outcomes and
    32 independent prescriber outcomes, free reproduction with
    acknowledgement). Neonatal nursing (NHS England's qualified-in-specialty
    standards, OGL). Maternity support worker (NHS England's 2024 framework,
    OGL; mostly behavioural, so a thin list). Ambulance support worker,
    associate ambulance practitioner and paramedic (the Skills England
    standards, OGL and available as JSON; broad, so a starter list).
    Optometry (the GOC's 52 outcomes, free reuse with acknowledgement).

  - **Now, but weak** – physician associates. The GMC's outcomes are free to
    reuse and broad; the useful list of 21 procedures is in the FPA
    curriculum, which states no licence, so it does not count.

  - **Now, if Quill writes its own titles and cites the item** – nursing (NMC
    Annexe B, 84 procedures), nursing associate (the 60-procedure subset) and
    midwifery (NMC Domain 6, about 150 skills). The NMC permits reproduction
    with credit and is silent on commercial use; naming venepuncture in
    Quill's words and citing "NMC Annexe B 2.2" does not depend on the
    answer. This rests on the licensing decision below.

  - **Not until somebody answers** – critical care (CC3N), emergency nursing
    (RCN), SACT nursing (UKONS), the cross-profession prescribing framework
    (RCPharm), pharmacy technicians (APTUK), the paramedic Appendix 2 skills
    (NHS England), and every allied health profession (the HCPC publishes no
    terms). These are also the best lists.

  - **One thing comes first** – every open licence here requires attribution
    a user can see, and a competency entry has nowhere to hold a source. So
    the source field in the decision below lands before any of this content,
    not after it.

- [ ] **Decide the licensing position before any framework text is loaded** –
      Two routes. Ask each body for written permission, which is slow and
      which some will refuse (UKONS sells its own passport). Or write Quill's
      own competency titles and record the framework item as a reference, so
      the catalogue says `perform_venepuncture` and cites "NMC Annexe B 2.2"
      rather than reproducing the sentence. The second keeps every source
      usable, satisfies the NMC's attribution condition, and still lets an
      assessor recognise the item. Recommended as the default, with
      permission sought only where a framework's exact wording is the point
      (the UKONS SACT routes, the CC3N Steps). A human decides; this is a
      legal call, not an engineering one.

- [ ] **Decide the first specialties and who writes each list** – The
      research suggests this order, following what can be added without
      asking. First clinical informatics and pharmacy: both fully open and
      both decent lists, with informatics the proof that loading a whole
      framework works and pharmacy helped by the `prescribe_*` entries the
      catalogue already has. Then nursing (every nurse knows Annexe B) and
      midwifery (Domain 6, with CapitalMidwife as the order), once the
      cite-don't-copy route is confirmed. Then neonatal nursing and the
      ambulance roles from their OGL sources. Then, as permissions arrive, a
      cross-profession prescribing specialty on the RCPharm framework's ten
      competencies, since the NMC and HCPC both assess against it; paramedics
      from Appendix 2; and the AHPs profession by profession, starting with
      ODPs and radiographers because their HCPC standard 13 lists are the
      most procedural. Each list is clinical content, so somebody in that
      field chooses and orders the common competencies, and the pull request
      is the gate, as it is for teaching content.

- [ ] **Decide whether a competency entry records its source** –
      `CompetencyEntry` forbids unknown fields, so citing "NMC Annexe B 2.2"
      on an entry means adding an optional field to the model in
      `backend/app/cbac/competencies.py`, and deciding whether the picker,
      the export and the PDF show it. Attribution is what the NMC licence
      asks for and what an assessor from another trust needs to trust the
      item. Belongs in the implementation plan.

- [ ] **Decide how the catalogue's second job copes with the size** – Every
      entry is also a CBAC id: `has_competency` would accept any of several
      hundred nursing procedures, and the user edit page would list them all
      under additional competencies. Harmless to the API, noisy for an
      administrator. Options for the implementation plan: a flag or a
      directory that marks a competency as passport-only so the CBAC pickers
      hide it, or accepting the noise for now.

## Decisions

- **No role layer** – Decided on 1 October 2026. A `role` that allowed or
  blocked ranges of competencies would be wrong for somebody on its first
  day, because a prescribing nurse, a pharmacist prescriber and an advanced
  paramedic each do work another profession's range would exclude, and it
  would then be a profession-by-competency grid to maintain for ever. The
  assessor's signature is the check on whether a competency belongs to a
  person; the catalogue does not pre-judge it.

- **A specialty orders and never gates** – A specialty is a group of
  competencies that float to the top of the picker. Everything else stays
  selectable underneath, and choosing no specialty gives the whole list.
  Reaffirmed rather than new: it is what
  `docs/docs/plans/2026-09-26-passport-specialties-plan.md` built.

- **Many specialties rather than one per profession** – A nurse is not one
  list. Critical care, emergency care, SACT, neonatal and theatre nursing
  each get a specialty file, and a competency two professions share
  (cannulation, prescribing) is written once and listed by both. "Specialty"
  stays the word for it, even though it is a doctor's word.
