# Internationalisation plan

## Summary

Quill's foundations assume more than one language; nothing above them
allows one.

`shared/jurisdiction-config.yaml` opens with the sentence "Quill Medical is
designed to work internationally" and then models the United Kingdom, the
United States, the European Union and Australia — regulatory authorities,
controlled drug schedules, professional registers, record retention
periods. `FormattedDate` formats through `Intl.DateTimeFormat` and takes a
`locale` prop. Every timestamp in the core database is timezone-aware.
Teaching emails already load their text from YAML and render it with named
`$variable` placeholders. These are the decisions that are expensive to
retrofit, and they were made correctly.

What is missing is everything ordinary. About twelve hundred user-facing
strings are hardcoded English, spread across React components, FastAPI
exception details, two email modules and twelve hundred lines of PDF
generation. There is no `locale` column on `User`, no locale context in the
frontend, and so nowhere to record or read a preference. `lang="en"` is
fixed in both HTML entry points.

The likely first target is a Nordic language — Danish, Swedish or
Norwegian — through existing contacts in the region. That is a fortunate
place to start, and [Decisions](#decisions) sets out why: Latin script,
left-to-right, two plural forms exactly as English has, and text lengths
within roughly a tenth of the English. Nordic is the gentlest second
language Quill could plausibly acquire, and it exercises the whole
pipeline without the layout damage a German or Finnish target would cause.

This plan still does not translate Quill today. The contacts are not yet a
deployment, and translating ahead of that need would produce strings nobody
reads and a maintenance burden nobody asked for. The intended outcome is
narrower and more useful: **stop the gap widening, fix what is already
wrong, and make the eventual translation a mechanical job rather than a
rewrite.**

The work divides into five phases. The first two are worth doing whatever
happens next. The last three are the translation itself, and should not
start until a real deployment needs them.

## Why this matters now

**Not because a translation is imminent.** It is not.

Three things make the timing right anyway.

**One defect is already shipping and cannot be repaired later.** Every
clinical composition Quill writes to EHRbase is tagged
`territory: "US"` — see `backend/app/ehrbase_client.py:408`. Quill is a
UK-first product. openEHR compositions are language- and territory-tagged
at the moment of writing and are never updated in place, which is the
whole point of the versioning model. Fixing this next year does not
correct the records written this year. The cost of the fix is constant;
the cost of the delay is not.

**The accessibility plan interlocks with it.** WCAG 2.2 success criterion
3.1.1 requires the document's language to be programmatically
determinable. `lang="en"` in `frontend/index.html` is correct today and
becomes a conformance failure the moment a second language exists. The
accessibility plan committed on the same day targets 2.2 AA and will put
axe checks in CI; it is cheaper to make the language attribute dynamic
while that work is open than to reopen it afterwards.

**The gap grows with every pull request.** Nine hundred frontend strings
took a year to accumulate. Without a lint gate, the next year adds as many
again, and each one is a string somebody must later find, extract and key.
A rule that rejects new hardcoded text costs a day and caps the debt where
it stands.

## What exists today

### The parts that are already right

- **Dates** — `frontend/src/components/data/Date.tsx` formats through
  `Intl.DateTimeFormat`, takes a `locale` prop, and is used in 38 places.
  There is not a single hardcoded `dayjs` format string in the frontend.

- **Jurisdictions** — `shared/jurisdiction-config.yaml` already separates
  regulatory variation from code, across four jurisdictions. Language is a
  different axis from jurisdiction, but the file proves the seam exists and
  gives the new work somewhere obvious to live.

- **Timestamps** — every `DateTime` column in `models.py` is declared
  `timezone=True`. Storage is UTC and conversion is a presentation concern,
  which is the arrangement that makes locale-aware display possible at all.

- **Configurable email text** — `backend/app/features/teaching/email_templates.py`
  loads subject and body from each bank's `config.yaml` and renders them
  with `string.Template`, using named `$variable` placeholders rather than
  positional ones. This is precisely the shape a translation needs, because
  a translator can reorder named variables and cannot reorder positional
  ones. The pattern is already in the repository and should be extended
  rather than replaced.

- **Structured error codes** — `frontend/src/lib/api.ts` already parses an
  `error_code` alongside `detail`. Around fifteen endpoints set one. The
  mechanism for translating backend errors therefore exists; it is simply
  not used for display, and most endpoints do not populate it.

### The parts that are not

- **Frontend strings, roughly 900** — 610 unique text-bearing props
  (`label=`, `title=`, `placeholder=`, `description=`, `aria-label=`) and
  around 267 JSX text nodes, across 270 non-test `.tsx` files. All inline.
  Nothing is centralised.

- **Backend exception details, 177** — English prose in
  `HTTPException(detail=...)`, passed to the user unaltered by
  `frontend/src/lib/api.ts:247`. These are user interface text that happens
  to live in Python. A further 46 `ValueError` and validation messages sit
  behind them.

- **Email modules, two** —
  `backend/app/features/passport/email_templates.py` (110 lines) and the
  teaching one (114). The passport invitation is deliberately fixed in
  code, and its docstring explains why: "the thing it must never do is vary
  in ways nobody reviewed." That reasoning is sound and survives
  translation — it argues for reviewed translations of a fixed message, not
  for configurability. It reaches recipients outside Quill entirely: "a
  consultant at another trust receives this cold."

- **PDF generation, ~1,200 lines** —
  `backend/app/features/passport/pdf.py` (809) and
  `backend/app/features/teaching/certificate.py` (405), carrying fixed
  English such as "This certifies that" and "Clinician passport — ". PDFs
  are the worst case for translation because text sits at computed
  coordinates and longer strings overflow rather than wrap. Certificates
  are also the artefact a person keeps and shows to other people.

- **Shared YAML display text, ~94 names and 28 descriptions** — across
  `base-professions.yaml`, `org-unit-types.yaml` and
  `competency-definitions/`. Contained, well-structured, and reaching the
  UI through `frontend/scripts/generate-json-from-yaml.ts`. The generation
  step could carry translations without any consumer changing.

- **No locale anywhere** — `User` has no `locale`, `language` or
  `timezone` column. There is no locale context in the frontend. There is
  a settings surface at `frontend/src/pages/settings/` with nothing to put
  on it.

### The constraint that shapes the strategy

**2,229 test assertions match literal English** — `getByText`,
`getByLabelText`, `getByRole({ name })` and their variants, across the
frontend test suite.

This single number decides the extraction strategy, and it is the reason
Phase 3 chooses English source text as the lookup key. It is covered under
[Decisions](#decisions).

## Phase 1: Fix what is already wrong

Nothing here depends on a translation ever happening. Each item is a
defect or a latent one, and the phase is worth doing on its own.

- [ ] Replace the hardcoded `territory: "US"` in
      `backend/app/ehrbase_client.py:408` with the deployment's
      jurisdiction territory, defaulting to `GB`. Take the language code
      beside it from the same source rather than the literal `"en"`
- [ ] Add a backend test asserting that a composition built for a UK
      deployment carries `GB`, so the default cannot silently regress
- [ ] Record in `docs/docs/safety/` whether any compositions already
      written carry `US`, and whether they need reissuing. In the teaching
      deployment this is likely to be none, which is worth stating plainly
      rather than leaving unexamined
- [ ] Replace the six hardcoded `toLocaleDateString("en-GB", …)` calls with
      `FormattedDate`: `LetterList.tsx`, `AppointmentsList.tsx`,
      `AssessmentHistoryTable.tsx`, `MessagesList.tsx`, `Messaging.tsx`,
      and the two teaching pages `AllResults.tsx` and `SyncStatus.tsx`
- [ ] Give `LetterView.tsx:93` and the two bare `toLocaleDateString()`
      calls an explicit locale; an unqualified call reads the browser's
      locale and will format a UK date in US order for a US-configured
      machine today
- [ ] Extend `FormattedDate` to read a default locale from context rather
      than defaulting to `"en-GB"` per call site, leaving the prop as an
      override

## Phase 2: Stop the gap widening

The point of this phase is that it ends. After it, new code cannot add
untranslatable strings without someone deciding to, and the twelve hundred
that exist become a fixed quantity rather than a growing one.

- [ ] Add a `locale` column to `User` — nullable, defaulting to the
      deployment locale, with `just migrate "add user locale"`. Nullable
      rather than defaulted-in-Python so that "never chosen" stays
      distinguishable from "chose English"
- [ ] Add a `LocaleContext` in `frontend/src/` exposing the resolved
      locale, sourced from the user record and falling back to the
      deployment default. `FormattedDate` consumes it
- [ ] Set the `lang` attribute from that context rather than the literal in
      `frontend/index.html:2` and
      `frontend/public_pages/templates/page.html:2`, satisfying WCAG 3.1.1
      for whatever language is eventually served
- [ ] Add an ESLint rule rejecting bare string literals in the text-bearing
      JSX props, modelled on the existing `no-restricted-imports` block in
      `frontend/eslint.config.js:48`. Warn, not error, until Phase 3 gives
      it somewhere to point
- [ ] Decide and document the extraction key convention before any strings
      move, so that Phase 3 is mechanical. See [Decisions](#decisions)

At the end of Phase 2 Quill has a locale it can read, a language attribute
that follows it, dates that respect it, and a lint rule that notices new
hardcoded text. It still ships only English, and that is the correct
outcome until a customer says otherwise.

## Phase 3: Extract the frontend

Do not start this phase without a named deployment needing a second
language. It is the bulk of the work and produces no user-visible benefit
on its own.

- [ ] Add a jurisdiction entry to `shared/jurisdiction-config.yaml` for
      whichever Nordic country is first, with its real professional
      register, drug schedules and retention periods. The existing `eu`
      entry is a placeholder and will not serve a Nordic deployment; see
      [Open questions](#open-questions). This is regulatory work rather
      than translation work and can proceed independently
- [ ] Choose a runtime. The requirement is English-source keys, ICU plural
      support and a React binding; `react-i18next` is the obvious first
      candidate. Record the choice and its reasoning in this section
- [ ] Add a locale decorator to `frontend/.storybook/preview.tsx` so all
      173 stories render under the provider, and a locale toolbar control
      so a reviewer can switch language in Storybook
- [ ] Extract strings feature by feature, not file by file, so each pull
      request is a reviewable unit: auth, then settings, then admin, then
      teaching, then passport, then clinical
- [ ] Replace the six manual pluralisations with ICU plural forms —
      `CpdTable.tsx:116`, `LogbookTable.tsx:102`, `CompetencyRow.tsx:86`
      and the two in `SignOffCard.tsx`. The Nordic languages share
      English's two plural forms, so `count === 1 ? … : …` happens to
      produce correct Danish; use ICU forms anyway, because the next
      language may not be so forgiving and the cost is the same now
- [ ] Rewrite the concatenated sentence at `SignOffCard.tsx:144-150`,
      which builds "3 logbook entries, 1 certificate" from four fragments
      and a template literal. Fragment assembly cannot be translated at
      all — word order, agreement and the comma itself differ by language
      — so this needs to become one ICU message with named arguments,
      not five extracted strings
- [ ] Promote the Phase 2 ESLint rule from warn to error once the last
      feature is extracted
- [ ] Add a pseudo-localisation locale and run the Storybook suite under
      it. Pad by 30% even though Nordic text runs only about 10% longer
      than English: the padding is there to catch fixed-width chrome — the
      navigation drawer, table headers, buttons — and sizing it to the
      actual first target would let Quill pass the test while remaining
      brittle for any later language. Include the Nordic characters
      `æ ø å ä ö` in the pseudo-locale so font coverage and input
      handling are exercised too

## Phase 4: Extract the backend

- [ ] Give every `HTTPException` an `error_code`, extending the convention
      already present on around fifteen endpoints, and make
      `frontend/src/lib/api.ts` prefer a translated lookup on that code
      over the raw `detail`. Keep `detail` as the fallback and as the text
      in logs, so an untranslated code degrades to English rather than to
      nothing
- [ ] Move the shared YAML display names and descriptions to a translatable
      structure, and teach `generate-json-from-yaml.ts` to emit per-locale
      JSON. Consumers should not need to change
- [ ] Convert the passport invitation email to the `string.Template`
      pattern the teaching emails already use, keeping the message fixed
      and reviewed rather than making it configurable
- [ ] Decide how a recipient's language is determined for outbound email.
      An assessor at another trust has no Quill account and therefore no
      `locale`; the inviting user's locale is the only signal available,
      and may be wrong. A Danish clinician inviting a Swedish colleague is
      the concrete case, and English may well be the safest default for a
      cold recipient even in a fully translated deployment. Document the
      choice rather than defaulting silently

## Phase 5: The documents

Left last because it is the most expensive per string and the least
reversible once issued.

- [ ] Audit `passport/pdf.py` and `teaching/certificate.py` for text at
      computed coordinates that will overflow when longer. Convert
      fixed-width placements to flowing ones where ReportLab allows
- [ ] Render a full certificate and a full passport under the
      pseudo-localisation locale and inspect them visually. Overflow in a
      PDF is silent — there is no reflow and no scrollbar to reveal it
- [ ] Decide whether an already-issued certificate is reissued in a new
      language or remains in the language of issue. A certificate is a
      record of something that happened, and reissuing it in translation
      may be the wrong answer

## Decisions

- **English source text as the lookup key, not abstract keys.** `t("Add new
user")` rather than `t("admin.users.add.title")`. With English as the key
  an unconfigured lookup returns the English string, so all 2,229 existing
  test assertions keep passing untouched and extraction can proceed feature
  by feature without a test rewrite. Abstract keys would force most of those
  assertions to change for no user-visible benefit, and would make every
  extraction pull request a mixed diff of behaviour and test churn. The
  accepted cost is that changing English copy changes the key and orphans
  its translations; a tooling step should report orphans rather than
  silently dropping them.

- **Readiness now, translation on demand.** Phases 1 and 2 are perhaps two
  to three days and are worth doing with no second language in prospect.
  Phases 3 to 5 are a further ten to fifteen days for a Nordic first
  target — nearer the lower end than the German estimate this plan
  originally carried, because less layout will break — and should wait for
  a deployment that needs them. Translating speculatively produces strings
  nobody reads, in languages nobody verified, that must still be
  maintained. Note that the engineering estimate excludes the translation
  itself: acquaintances willing to check wording are not the same as a
  sustained commitment to retranslate every string that changes.

- **Fix the EHRbase territory before anything else.** It is the only item
  here whose cost rises with delay. Every composition written before the fix
  carries the wrong territory permanently, because openEHR versions
  compositions rather than updating them.

- **A Nordic language first, because it is the cheapest real test.**
  Danish, Swedish and Norwegian are Latin script, left-to-right, and have
  the same two plural forms as English. Text runs roughly a tenth longer
  than English rather than the third that German adds, so existing layouts
  are unlikely to break. Every one of those properties makes the first
  translation cheaper, and none of them makes it less useful as a proof
  that the pipeline works: the extraction, the lookup, the locale
  switching and the translator workflow all get exercised regardless.

  The three languages are close enough that translating one makes the
  other two substantially cheaper, which matters if the contacts span
  more than one country. Finnish is the exception and should not be
  assumed in: it is unrelated to the other three, has fifteen grammatical
  cases, and produces much longer compounds. If a Finnish deployment is a
  real prospect, the layout testing effort changes and this decision
  should be revisited.

- **Do not design around Nordic either.** The architecture should not
  foreclose right-to-left or complex plurals just because the first target
  needs neither. The cost of keeping that door open is small — only 17
  physical CSS properties exist against 1 logical one, and Mantine absorbs
  most spacing — so the door stays open. What changes is where the testing
  effort goes: truncation, not mirroring.

- **Keep the passport invitation fixed in code.** Its docstring argues that
  a transactional message about a named clinician must not vary in ways
  nobody reviewed, and that holds across languages. Translation here means a
  reviewed second version of a fixed message, not coordinator-editable text.

## Open questions

- **Which Nordic country, and is it one or several?** The languages are
  close; the health systems and regulators are not. Denmark, Sweden and
  Norway each have their own professional register, their own controlled
  drug scheduling and their own patient identifier scheme. A deployment in
  one is a jurisdiction entry; a deployment across three is three entries
  and a harder story about which register a clinician is verified against.

- **`eu` will not serve a Nordic deployment as it stands.** Norway and
  Iceland are not EU members at all, and the existing `eu` entry in
  `shared/jurisdiction-config.yaml` is a placeholder — its register is
  "National Medical Register", its verification URL is "Varies by member
  state", and its drug schedule is the single entry "national". Denmark
  and Sweden would technically match it and be served badly. Whichever
  country comes first needs its own jurisdiction entry with a real
  register and real schedules, and that work is separate from translation
  and probably precedes it.

- **Language and jurisdiction are not the same axis, and a Nordic
  deployment is where that first bites.** A Danish hospital may run Quill
  in Danish under Danish regulation, but it may equally run parts of it in
  English — Nordic clinical staff frequently work in English, and medical
  terminology often stays English regardless. Decide early whether locale
  and jurisdiction are independently selectable, because assuming they move
  together is easy now and expensive to unpick later.

- **Do patient-facing surfaces need languages that staff surfaces do not?**
  A patient portal in a UK trust may need community languages — Polish,
  Urdu, Bengali — that no staff interface requires. That split, if it is
  real, changes what gets extracted first and is the one scenario that makes
  right-to-left support urgent rather than theoretical.

- **Does the Accessible Information Standard obligation overlap here?** The
  accessibility plan scopes DAPB1605 as a design consideration pending live
  FHIR demographics. Recording a patient's communication needs and recording
  their language preference are closely related data model questions, and
  doing them together is likely cheaper than doing them apart.
