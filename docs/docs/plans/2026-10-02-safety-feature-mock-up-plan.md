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

- [ ] **Add `/admin/safety`**, `pages/admin/safety/AdminSafetyDashboard.tsx`,
      under the existing `/admin` route, which already admits every scoped
      manager. Like `AdminTeachingDashboard` it is `PageHeader` and action
      cards: "Safety cases", opening `/safety`, and "People", opening
      `/admin/users`, where a `manage_safety` holder can take on safety
      officers and leads within their whitelist. Shown to anybody the
      `safety` feature reaches who may open Admin; a safety admin reaches
      `/admin` through `manage_safety` as a teaching admin does through
      `manage_teaching`.
- [ ] **Hang "Safety" under Admin in `SideNavContent.tsx`**, beside the
      Teaching entry and gated the same way, on the feature. Test it shown
      and hidden.
- [ ] **Page and nav tests**, run with `just uf` on the two files.

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
