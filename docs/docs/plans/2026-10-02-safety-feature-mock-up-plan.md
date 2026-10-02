# Safety feature mock-up plan

**This is a mock-up and nothing more.** Everything this plan builds is
throwaway: fictional data, no backend, no API, and no bearing on how Quill
and Turva would ever fit together. The long-term intention is the other way
round: Quill offered as a package that Turva could import into its own
platform, if the Turva team decide they want it. That build, and the way
Quill is used inside Turva, will look nothing like this code. The only
purpose here is to put something on a screen so we can see how Quill's
pages, navigation and components behave with clinical safety content, and
work out where Turva might benefit. Nobody should read this plan, or the
code it produces, as a design for the real integration.

Turva is an open-source clinical safety compliance platform that keeps a
DCB0129 safety case as version-controlled markdown: templates, placeholders,
a hazard log and a sign-off process. The mock-up shows what that content
could look like using Quill. It is called Safety,
because we hold no licence to the Turva name, and nothing in the user
interface or the code says Turva. It is a static front end with no backend:
five made-up safety cases, a landing page listing them, a page per case with
six cards (documentation, hazards, incidents, officers, compliance sign-off
and placeholders), and a page behind each card. It is built the way the
passport is built, lazily loaded, in its own `pages/safety/`,
`components/safety/` and `lib/safety/` folders, and switched on per
organisation with the existing feature switch so it reaches the demo
organisation and nobody else.

## Phase 1: Feature key, gate and navigation

- [x] **Add `safety` to `AVAILABLE_FEATURES` in
      `frontend/src/pages/admin/organisations/OrgFeaturesPage.tsx`**, label
      "Safety", description "Clinical safety cases, hazard logs and
      compliance sign-off". This is the whole of the switch: the backend
      stores any `feature_key` string on `org_unit_feature` without a
      registry (`set_org_unit_feature` in `backend/app/org_units/router.py`
      checks only the passport cover), and `/api/auth/me` already returns
      it in `enabled_features`. So no backend change, no migration, and the
      feature is switched on at the demo organisation from the existing
      admin page, exactly as Teaching and Passport are.
- [x] **Add `safety` to `IconName` and `iconMap` in
      `frontend/src/components/icons/NavIcon.tsx`**, mapped to
      `IconShieldCheck`, which `appIcons.ts` already registers. Update the
      NavIcon stories and test that list every name.
- [x] **Add the sidebar entry in
      `frontend/src/components/navigation/featureNavItems.ts`**, after
      Passport and before Settings, gated on `useHasFeature("safety")`
      alone, as Teaching is: the routes carry only `RequireFeature`, and the
      link must advertise exactly what its route requires. Call the hook
      unconditionally, as the file's comment insists. Give it the open-page
      child the passport uses: a `SAFETY_PAGES` list of the case sub-pages,
      with a `safetyPageAt(pathname)` that hangs the open page beneath
      Safety, so on `/safety/sc-003/hazards` the sidebar reads Safety,
      Hazards. Both sidebars render this list, so the entry appears inside
      Teaching too without touching `TeachingMainNav.tsx`.
- [x] **Extend `featureNavItems` and `SideNavContent` tests** for the new
      entry: shown with the feature, hidden without it, child present on a
      sub-page.

## Phase 2: Static data

- [x] **Create `frontend/src/lib/safety/types.ts`** with the shapes the
      pages render, typed strictly with string-literal unions rather than
      bare strings: `SafetyCase` (id, title, system, standard `"DCB0129" |
    "DCB0160"`, status `"draft" | "in_review" | "signed_off"`, clinical
      safety officer, last updated, open hazard count), `SafetyDocument`
      (name, version, status), `Hazard` (id, description, cause, effect,
      initial and residual risk scores, status), `Incident` (id, date,
      summary, severity, linked hazard id), `Officer` (role, name, email),
      `SignOffItem` (standard section, signatory, date or null) and
      `Placeholder` (key, value, used in). Strict types cost nothing and
      keep the pages honest, even though nothing will ever be built on
      these shapes.
- [x] **Create `frontend/src/lib/safety/fixtures.ts`** with the five cases
      and their detail, exported as `SAFETY_CASES` and `safetyCaseById(id)`.
      Plausible but fictional systems: an e-prescribing module, a patient
      portal, a results acknowledgement service, a bed management board and
      a discharge letter generator. Give each a different status so the
      table shows all three badges, and give the hazard log the usual
      DCB0129 shape, a 5 by 5 likelihood and severity matrix with initial
      and residual scores. Officer names are invented and emails use
      `example.org`. No PHI anywhere, including in the incidents, which
      describe a system fault and never a patient.
- [x] **Create `frontend/src/lib/safety/index.ts`** as the barrel, and a
      `fixtures.test.ts` that checks the five cases have unique ids, every
      incident links to a hazard that exists, and every case has at least
      one officer. Cheap, and it stops a later edit to the demo data
      leaving a card empty.

## Phase 3: Components

- [x] **`components/safety/SafetyCaseTable.tsx`** over `DataTable` from
      `components/tables`: columns title, system, standard, clinical safety
      officer, open hazards, status and last updated, with `onRowClick`
      navigating to the case. Status renders through a new
      **`components/safety/SafetyStatusBadge.tsx`**, following
      `SignOffStatusBadge` and `badgeColours.ts`, so the three states use
      the badge colours the rest of the app uses.
- [x] **`components/safety/RiskScoreBadge.tsx`**: a badge for a risk score
      of 1 to 5, coloured low to high from the design system's semantic
      colours, used by the hazard table for initial and residual scores.
- [x] **`components/safety/HazardTable.tsx`, `IncidentTable.tsx`,
      `OfficerList.tsx`, `DocumentTable.tsx`, `SignOffChecklist.tsx` and
      `PlaceholderTable.tsx`**, one per card page, each a thin `DataTable`
      or `Stack` of `BaseCard` over the typed data. Officers and the
      sign-off checklist are short lists, so cards rather than tables:
      sign-off shows a tick icon with the signatory and date, or "Awaiting"
      where the date is null. The hazard table is the one place to spend a
      little care, because it is what anyone who knows DCB0129 will look
      at first.
- [x] **Stories and tests for every component**, as the components rule
      requires, using `VariantStack` for the badge sizes and
      `renderWithRouter` where a row click navigates. Stories render the
      fixtures directly, which doubles as a visual check of the demo data.

## Phase 4: Pages and routes

- [x] **Create `frontend/src/pages/safety/`** with pages that each export
      `Component` for React Router's `lazy`, as the passport pages do:
      `SafetyPage.tsx` (landing), `SafetyCasePage.tsx` (one case) and six
      card pages `SafetyDocumentationPage.tsx`, `SafetyHazardsPage.tsx`,
      `SafetyIncidentsPage.tsx`, `SafetyOfficersPage.tsx`,
      `SafetySignOffPage.tsx` and `SafetyPlaceholdersPage.tsx`. Each is the
      standard `<Stack gap="lg">` with `PageHeader`, no Container.
- [x] **Landing page**: `PageHeader` titled "Safety" with a subtitle
      saying these are demonstration cases, then `SafetyCaseTable` over
      `SAFETY_CASES`. No add button: there is nothing to add to.
- [x] **Case page**: header carries the case title with the system and
      standard as subtitle and the status badge, then a `SimpleGrid` of six
      `ActionCard`s in the order asked for (documentation, hazards,
      incidents, officers, compliance sign-off, placeholders), each with an
      icon from `appIcons.ts`, a one-line subtitle carrying a count from the
      fixtures ("4 open hazards"), and `buttonUrl` to its page. Register
      any Tabler icon not yet in `appIcons.ts` there first; `IconShieldCheck`,
      `IconAlertTriangle`, `IconFileText` and `IconUsers` are the likely set.
      An unknown `:caseId` renders `NotFoundLayout`, matching how every gate
      here answers with a 404.
- [x] **Card pages**: header with the case title as a link back to the
      case, then the matching component over `safetyCaseById(caseId)`.
      Placeholders gets a short paragraph explaining what a placeholder is,
      a value substituted into every document of the case, because it is
      the one card whose name does not explain itself.
- [x] **Routes in `frontend/src/main.tsx`**, inside the `RequireAuth` and
      `RootLayout` subtree beside the passport block, wrapped once in
      `<RequireFeature feature="safety"><Outlet /></RequireFeature>`. Every
      route uses `lazy: () => import("./pages/safety/...")` and
      `handle: { safeForReload: true }`, since nothing here holds form
      state. Paths: `/safety`, `/safety/:caseId`, and
      `/safety/:caseId/{documentation,hazards,incidents,officers,sign-off,placeholders}`.
- [x] **Page tests**, one file per page: renders the fixture content,
      navigates on a row or card click, and the 404 for an unknown case.
      Run `just uf src/pages/safety` and `just uf src/components/safety`
      locally, nothing wider.
- [x] **Run `yarn typecheck:all` in `frontend/`**, not bare `tsc`, so the
      stories are checked too.

## Phase 5: Switch on and record

- [ ] **Switch the feature on at the demo organisation** from its Features
      admin page once the change is deployed. Nothing else sees it: the
      sidebar entry and every route check `enabled_features`. Left for a
      human: it needs the stack merged and deployed first, and switching a
      feature on in production is not something an unattended run does.
- [x] **Add the Safety journey to the accessibility log**: the sidebar
      gains an entry and a child link, so name the navigation journey in
      `docs/docs/frontend/accessibility/journeys.md` and add it to the "Not
      yet run" list in `testing-log.md`.
- [x] **Register this plan in `docs/docs/plans/index.md`.**

## Phase 6: Competencies and professions, mirroring teaching and passport

Asked for after the first four phases landed: the mock-up should be
gated and staffed the way Teaching and Passport are, so that a safety
organisation can be set up from the same admin pages with nothing
special-cased. Everything here is YAML plus the tests that pin it; the
backend reads the catalogue and the professions at load and needs no code.

- [x] **Add `shared/competency-definitions/safety.yaml`** with two
      competencies. `view_safety_cases` ("Use Safety Cases") opens the
      safety pages, as `view_teaching_cases` opens teaching and
      `assess_clinician_passport` opens the passport. `manage_safety`
      ("Manage Safety") is a scoped manager, with `may_grant` of
      `view_safety_cases` and `manage_safety` (on its own list, so one
      safety admin can appoint another) and `may_assign_professions` of the
      three safety professions. Nothing sold, so the loader's
      `passport_write` rule is not involved. Because `SCOPED_MANAGER_IDS` is
      derived from the catalogue on both sides, `manage_safety` opens the
      admin area and the people routes with no further change.
- [x] **Add a "Safety professions" section to
      `shared/base-professions.yaml`**: `safety_officer` ("Safety officer",
      the clinical safety officer who writes and reads cases, holding
      `view_safety_cases`), `safety_clinical_lead` ("Safety clinical lead", a
      label beside the officer as the passport and teaching leads are,
      holding the same), and `safety_admin` ("Safety admin", holding
      `view_safety_cases` and `manage_safety`). All three
      `requires_clinical_services: false`, because a safety case holds no
      patient data and the demo deployment runs with clinical services off.
- [x] **Gate the routes and the sidebar on the competency as well as the
      feature.** Wrap the safety subtree in `main.tsx` in
      `<RequireCompetency competency="view_safety_cases">` inside the
      `RequireFeature`, as the passport subtree is, and gate the sidebar
      entry in `featureNavItems.ts` on both. Update the `SideNavContent`
      tests: the feature without the competency hides the entry.
- [x] **Pin it in tests.** `backend/tests/test_base_professions.py` gains
      the safety equivalents of the passport tests: the three professions
      need nothing clinical, the admin's competencies are pinned whole, and
      the lead grants nothing the officer lacks. `frontend/src/types/cbac.test.ts`
      adds `manage_safety` to the scoped managers it expects. Run
      `just ub -k "base_professions or grant_scope"` and the two frontend
      files.
- [x] **Name `safety.yaml` in the catalogue list** in
      `.github/copilot-instructions.md` and the synced `CLAUDE.md`.

## Phase 7: Safety admin, mirroring teaching's

- [x] **Add `/admin/safety`**, `pages/admin/safety/AdminSafetyDashboard.tsx`,
      under the existing `/admin` route, which already admits every scoped
      manager. Like `AdminTeachingDashboard` it is `PageHeader` and action
      cards: "Safety cases", opening `/safety`, and "People", opening
      `/admin/users`, where a `manage_safety` holder can take on safety
      officers and leads within their whitelist. Shown to anybody the
      `safety` feature reaches who may open Admin; a safety admin reaches
      `/admin` through `manage_safety` as a teaching admin does through
      `manage_teaching`.
- [x] **Hang "Safety" under Admin in `SideNavContent.tsx`**, beside the
      Teaching entry and gated the same way, on the feature. Test it shown
      and hidden.
- [x] **Page and nav tests**, run with `just uf` on the two files.

## Phase 8: Documents open as A4 pages

Asked for once the pages were up: a row on `/safety/:caseId/documentation`
should open the document itself, laid out like a printed A4 page, rather
than stopping at a table of names and versions. Turva's premise is a safety
case as markdown with placeholders, so the document content is markdown
with `{{ key }}` placeholders that the case's placeholder table fills in,
which also makes the Placeholders card mean something.

- [x] **Give each `SafetyDocument` an `id` and markdown `content`** in
      `lib/safety/types.ts`. The four standard documents get templates in
      `lib/safety/documentTemplates.ts`: a clinical risk management plan,
      a hazard log (built from the case's hazards, so it agrees with the
      hazard table), a clinical safety case report and a file index, each
      with the sections DCB0129 asks for and `{{ product_name }}`,
      `{{ product_version }}`, `{{ supplier_name }}`,
      `{{ deploying_organisation }}` and `{{ review_interval }}` where the
      real documents would name them. `renderDocument(document,
      placeholders)` in `lib/safety/render.ts` substitutes the values; an
      unknown key is left visible, as a template tool would, so a missing
      placeholder shows rather than vanishes. Fixture tests check every
      document renders with no placeholder left.
- [x] **`components/safety/SafetyDocumentSheet.tsx`**: the page itself.
      A `Box` with a CSS module giving it A4 proportions (max width about
      50rem, which is 210mm at 96dpi, with a 210 by 297 aspect ratio as the
      minimum height), paper-like padding and a shadow, in the theme's
      body colour so dark mode keeps a readable sheet rather than a white
      glare. A header block names the document, product, version, status
      and date, then `MarkdownView` renders the content. Narrow screens
      drop the fixed proportions and let the sheet fill the width.
      Stories for each of the four documents and a dark-mode one.
- [x] **Route `/safety/:caseId/documentation/:documentId`**,
      `pages/safety/SafetyDocumentPage.tsx`, lazy and safe to reload, a
      404 for an unknown case or document. `DocumentTable` gains
      `onSelect`, and the documentation page navigates on a row click.
- [x] **Sidebar**: `safetyPageAt` in `featureNavItems.ts` learns the
      page of one record, as the passport's does: on a document the
      navigation reads Safety, Documentation, Document.
- [x] **Tests** for the sheet, the page and the nav child.

## Phase 9: Hazards open to a page of their own

Asked for alongside the documents: a row on `/safety/:caseId/hazards`
opens a page for that hazard with its risk in full, the likelihood and
severity before and after mitigation, not only the product the table
shows.

- [x] **Add `mitigation` to `Hazard`**, the controls that take the
      initial risk to the residual one, since a hazard page that shows
      two ratings must say what sits between them. Every fixture hazard
      gets one.
- [x] **`components/safety/HazardDetail.tsx`**: cards for the hazard
      itself (description, cause, effect, status), the risk before and
      after mitigation (likelihood, severity and the rating badge for
      each, with the DCB0129 words for each score: 1 "very low" to 5
      "very high" for likelihood, 1 "minor" to 5 "catastrophic" for
      severity), the mitigation, and the incidents linked to it. Stories
      and tests.
- [x] **Route `/safety/:caseId/hazards/:hazardId`**,
      `pages/safety/SafetyHazardPage.tsx`; `HazardTable` gains
      `onSelect`; the hazards page navigates on a row click; the nav child
      reads Safety, Hazards, Hazard. A 404 for an unknown hazard.
- [x] **Tests** for the detail component, the page and the nav child.

## Phase 10: Incidents open to an incident report

Asked for with the hazard pages: a row on `/safety/:caseId/incidents`
opens the incident's report, and the incidents listed on a hazard's page
link to the same reports.

- [x] **Extend `Incident`** with what a report carries beyond the table
      row: `immediate_action`, `root_cause`, `outcome` and `reported_by`
      (a role, never a name, since incident reports are where a real
      system would be tempted to name a patient). Every fixture incident
      gets them, still describing a system fault and never a patient.
- [x] **`components/safety/IncidentReport.tsx`**: cards for what
      happened (date, severity, summary, reported by), the hazard it
      realised as a `TextLink` to the hazard page, the immediate action,
      the root cause and the outcome. Stories and tests.
- [x] **Route `/safety/:caseId/incidents/:incidentId`**,
      `pages/safety/SafetyIncidentPage.tsx`; `IncidentTable` gains
      `onSelect`; the incidents page and the incidents on `HazardDetail`
      open the report; the nav child reads Safety, Incidents, Incident. A
      404 for an unknown incident.
- [x] **Tests** for the report, the page and the nav child.

## Phase 11: Officers can be edited

Asked for on `/safety/:caseId/officers`: each officer card needs an edit
icon. The mock-up has nothing to save to, so an edit lives in the page's
state until it is reloaded, which is enough to show the interaction.

- [x] **`OfficerList` gains `onEdit`**, and each card an `IconButton` with
      the pencil icon, labelled "Edit <role>" for a screen reader, in the
      card's top right. Without `onEdit` no icon is drawn, so the list
      reads the same anywhere it is only read.
- [x] **`components/safety/OfficerEditModal.tsx`** (the form and its
      `Modal` in one, as `GrantCompetencyModal` is): name and email fields, the
      role shown but not editable (the roles are the posts a case has, as
      a position is), with the app's `ButtonPair` for save and cancel,
      following the passport forms' shape: `useState` per field and a
      `canSubmit` guard, as `CertificateForm` does. Stories and
      tests.
- [x] **The officers page** reads the officers through a session store,
      `lib/safety/edits.ts` (an in-memory map of per-case overrides behind
      `useSyncExternalStore`, built here and reused by Phase 13), opens
      the modal on edit, and writes the result back on save. A note under
      the title says changes are not kept, so nobody is surprised by a
      reload.
- [x] **Tests** for the icon, the form and the page round trip.

## Phase 12: No back link on the card pages

Asked for on the card pages: the case title under each page title was a
link back to the case, and it should not be. The sidebar already says
where you are and the browser has a back button.

- [x] **Replace the `TextLink` on the six card pages** with the case
      title as dimmed plain text, so a page still says which case it
      belongs to without offering a link. Update the page tests, which
      asserted a link. Landed with Phase 8, which touches the same pages.

## Phase 13: Placeholders can be edited, and the documents follow

Asked for on `/safety/:caseId/placeholders`: an edit page. Because the
documents of Phase 8 are rendered from the placeholders, an edit here
should show up in every document that names the key, which is the whole
point of a placeholder and the best demonstration the mock-up can give.

- [x] **A session store for edits**, `lib/safety/edits.ts`: built in
      Phase 11, with `usePlaceholders(caseId)` returning the fixtures with
      any edits applied and `setPlaceholderValue(caseId, key, value)` to
      write one. Lost on reload, by design, and said so on the page.
- [x] **Route `/safety/:caseId/placeholders/edit`**,
      `pages/safety/SafetyPlaceholdersEditPage.tsx`: one text field per
      placeholder, labelled by its key, with `ButtonPair` to save or
      cancel, both returning to the placeholders page. The placeholders
      page gains an edit button in its header through `PageHeader`'s
      `action`.
- [x] **The document page reads `usePlaceholders`** rather than the
      fixture directly, so an edited value appears in the rendered
      document.
- [x] **Tests**: the store, the edit page round trip, and a document
      test that renders an edited value.

## Phase 14: Documents can be edited

Asked for on `/safety/:caseId/documentation/:documentId`: an edit button.
Turva's premise is that the document *is* the markdown, so the edit is
the markdown itself, placeholders and all, and the sheet re-renders from
it.

- [x] **The session store learns documents**: `setDocumentContent(caseId,
      documentId, content)` and `useDocumentContent(caseId, documentId)`
      in `lib/safety/edits.ts`, alongside officers and placeholders.
- [x] **Route `/safety/:caseId/documentation/:documentId/edit`**,
      `pages/safety/SafetyDocumentEditPage.tsx`: a
      `components/safety/DocumentForm.tsx` with one `TextAreaField`
      holding the markdown, a note that `{{ key }}` placeholders are
      filled in when the document is shown, and `ButtonPair` to save or
      cancel back to the document. The document page gains an "Edit
      document" button in its header and renders the stored content.
- [x] **Sidebar**: on the edit page the navigation reads Safety,
      Documentation, Edit.
- [x] **Tests** for the store, the form, the edit page round trip, and
      the document page rendering an edit.

## Phase 15: Add and edit buttons that are only for show

Asked for after the document editor: an edit button on a hazard's page
and on an incident report, and an add button on the hazards and incidents
pages. **These do nothing, by request**: they are there so the pages look
complete in the demonstration, and a button that opened a form would be a
form nobody asked for. They are drawn without a handler, so pressing one
has no effect, and the plan says so here rather than leaving a reader to
wonder whether a handler was forgotten. Landed with Phase 14.

- [x] **`AddButton`** labelled "Add hazard" in the hazards page header
      and "Add incident" in the incidents page header, through
      `PageHeader`'s `action`.
- [x] **`IconTextButton` with the pencil** labelled "Edit hazard" on the
      hazard page and "Edit incident" on the incident page, the same way.
- [x] **Tests** that each button is present, and nothing more.
- [x] **`AddButton` "Add safety case"** in the landing page header, asked
      for after the rest and landed with Phase 16. Show-only, like the
      others.
- [x] **Placeholder keys shown bare.** Asked for at the same time: the
      placeholders table and the edit form show `product_name`, not
      `{{ product_name }}`. The braces are how a template names a key,
      not part of the key, and the documents are the only place they
      belong.

## Phase 16: Sign-off sections open to an overview

Asked for on `/safety/:caseId/sign-off`: each card should open a page.
A signature on a safety case attests to something specific, so the
overview says what, by whom, when, and which documents were reviewed to
give it.

- [x] **`SignOffItem` gains `id`, `attests` and `reviews`**: a slug for
      the address, the sentence a signatory is putting their name to, and
      the ids of the documents they reviewed. Every fixture line gets
      them, with the top management approval reviewing the case report.
- [x] **`SignOffChecklist` cards become links**, each a `Link` wrapping
      the card so the whole card is the target and reachable by keyboard,
      when given `hrefFor`. Without it the cards stay as they were.
- [x] **`components/safety/SignOffDetail.tsx`**: cards for the signature
      (status, signatory, date), what it attests, and the documents
      reviewed as links to their pages, with a show-only "Record
      signature" button on a line still awaiting one, as Phase 15 does.
- [x] **Route `/safety/:caseId/sign-off/:sectionId`**,
      `pages/safety/SafetySignOffDetailPage.tsx`; the nav reads Safety,
      Compliance sign-off, Section. A 404 for an unknown section.
- [x] **Tests** for the data, the link cards, the detail and the page.

## Phase 17: Add as an icon in the table's own row

Asked for after the show-only add buttons landed: the add control should
be an icon, `IconFilePlus`, sitting in the row above the table beside
the search and filter icons, rather than a written "Add" button in the
page header. `DataTableControlled` already has an `action` slot in that
row, added for the member practice page's "Grant competency" button, so
the safety tables move onto it.

- [x] **Register `IconFilePlus` in `appIcons.ts`**, in the re-export and
      the catalogue.
- [x] **`components/button/AddIconButton.tsx`**: an `IconButton` with
      `IconFilePlus`, subtle and primary like the filter icon beside it,
      with a required `aria-label` naming what it adds. Stories and tests.
- [x] **The safety tables move to `DataTableControlled`**: the case
      table, hazard table, incident table and document table each gain
      search over their text columns and an `action` prop passed through
      to the slot. The pages pass `<AddIconButton aria-label="Add hazard" />`
      and the like, still show-only, and the written `AddButton`s leave
      the page headers on the landing, hazards and incidents pages.
- [x] **Tests**: the button, each table's search and action slot, and
      the pages' buttons found by their new names.
- [x] **The placeholders page too**, asked for afterwards: the "Edit
      placeholders" button leaves the header and `PlaceholderTable` gets
      the same add icon in its row. The edit page of Phase 13 still
      exists at its address; nothing links to it from here now.

## Phase 18: Tooltips on the icons above every table

Asked for after the add icon landed: the icons in the row above a table
should say what they are on hover. Done in the atomic components, not
on the safety pages, so every table in the app gets them at once.

- [x] **`SearchButton`, `FilterSelect` and `AddIconButton`** each wrap
      their icon in `AppTooltip`, the design-system tooltip, with the
      same words as the button's `aria-label`: "Search", the filter's
      label, and whatever the add icon adds. A sighted user now gets the
      hint a screen reader user already had.
- [x] **`IconButton` forwards its ref**, which a tooltip needs to attach
      to the button, and which a popover needs too. Inside `FilterSelect`
      the tooltip wraps `Popover.Target`, not the other way round:
      the target forwards the props it is given down to the button, so
      `aria-expanded` still lands there.
- [x] **The hints open below the icons.** `AppTooltip` gains a
      `position` prop, "top" by default as before, and the three icons
      pass "bottom", so the hint sits over the table rather than over the
      page title.
- [x] **Tests** hover each icon and find its tooltip text. Where it lands
      cannot be checked in jsdom; the tooltip's Below story shows it.

## Phase 19: The users table takes the same add icon

Asked for once the safety tables had theirs: `/admin/users` should add a
user from an icon in the table's row too, with `IconUserPlus` rather than
the file icon, since the record is a person. Not a safety change, but it
grew out of Phase 17 and uses its component, so it is recorded here.

- [x] **`AddIconButton` takes an `icon`**, defaulting to `IconFilePlus`
      as before, so a table of people can pass `IconUserPlus`, which
      `appIcons.ts` already registers.
- [x] **The users page** drops the `AddButton` from its header and passes
      the icon into `DataTableControlled`'s `action` slot, still
      navigating to `/admin/users/new`. The button keeps the name "Add
      user", so anything that finds it by name still does.
- [x] **Tests**: the button's icon prop, and a new page test for the
      list, the add icon and opening a row.
- [x] **Same stroke as search and filter.** Asked for on seeing it:
      `AddIconButton` now draws its `ActionIcon` and icon exactly as
      `SearchButton` and `FilterSelect` do (size 32, the same button
      size), rather than through `IconButton`, whose smaller icon made it
      the odd one out. The stroke is Tabler's default 2 rather than
      their 2.5: a file or person with a plus has more lines in the same
      box, and at 2.5 it read as heavier than its simpler neighbours. It
      joins the lint exception list that lets those two import
      `ActionIcon` directly.
- [x] **The users table shows three columns**: full name, username and
      status. Asked for alongside: email, organisation and site, and
      platform role leave the table but stay searchable, and the user's
      own page still shows them.

## Decisions

- **No backend, no backend placeholder** – the data lives in
  `lib/safety/fixtures.ts` and the pages import it directly rather than
  through a fake `api.ts`. A pretend async layer would be code to delete
  later and buys nothing for a demo. There is no "real backend later" for
  this feature: if Turva adopts Quill, Quill is the thing imported into
  Turva, not the other way round, and this code is removed.

- **Gated by the organisation feature switch, not a build flag** – it is
  the mechanism Teaching and Passport use, it needs no backend change
  because feature keys are free strings, and it keeps the mock-up out of
  every organisation but the one demonstrating it.

- **Called Safety throughout** – the feature key, folder names, route
  paths, nav label and page titles all say "safety". Turva's name appears
  in this plan only, as the thing being imitated.

- **Expected to be deleted** – the mock-up has served its purpose once the
  Turva conversation has happened. Nothing elsewhere in Quill may depend on
  `lib/safety/` or `components/safety/`, so that removing the three folders,
  the routes, the nav entry and the feature key is the whole of the clean-up.

- **One `RequireFeature` gate and no competency, at first** – the
  passport's second gate exists because its routes write; these read
  fixtures. Reversed in Phase 6, when the mock-up was asked to mirror
  Teaching and Passport in how it is gated and staffed, so that a safety
  organisation can be set up from the same admin pages.

- **Plain `ActionCard`s on the case page rather than a new card
  component** – six cards with an icon, title, subtitle and button is
  exactly what `ActionCard` is, and the passport landing page already
  lays out its sections this way, so the two features look like siblings.
