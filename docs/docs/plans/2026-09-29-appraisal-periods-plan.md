# Appraisal periods plan

The CPD page totals a holder's activities over "June to June", and says so,
because a holder has no way to tell Quill when their own appraisal year
runs. Appraisal years rarely start in June, and they move when somebody
changes post, so the total a clinician takes to their appraisal is often
over the wrong dates. The clinician passport plan
(`2026-09-08-clinician-passport-plan.md`) already decided the shape of the
answer, a list of declared periods called `appraisal_periods` in the
passport's `profile.yaml`, but nothing stores, serves or sets them. `CpdTable`
already accepts a `period` and shows its real dates, so the gap is the
record, the API, a page to manage the periods, and the CPD page using them.

The outcome: on `/settings`, the passport card becomes "Clinician passport",
slimmer than today, with a "CPD date ranges" button. That opens a page where
the holder adds, corrects and removes as many date ranges as their career
needs, not one a year. The CPD page and the passport exports then total CPD
over those ranges, and fall back to June to June only where none is declared.

## Phase 1: Store and serve the periods

- [x] **Add `AppraisalPeriod` and a list of them to `Profile`**, in
      `backend/app/features/passport/schemas.py`. A period is `starts_on`
      and `ends_on`, both dates, with `ends_on` on or after `starts_on`.
      The plan first said `from` and `to`, but `from` is a Python keyword,
      and the passport's records use no field aliases (`to_yaml` dumps
      field names as they are), so the fields are named for what they
      hold, as `observed_on` and `signed_on` are. `Profile` gains
      `appraisal_periods: list[AppraisalPeriod]`, defaulting to empty, so
      every `profile.yaml` written before this still validates on read, as
      `specialties` did. The list is kept sorted by `starts_on`.
      Overlapping periods are refused, because an activity must belong to
      exactly one period or its points count twice. Gaps between periods
      are allowed, since a career break is real. Any length is allowed: a
      short period after moving post is the case the list exists for.

- [x] **Add `GET` and `PUT /api/passport/{passport_id}/appraisal-periods`**,
      in `backend/app/features/passport/router.py`, following the
      specialties route beside it. `GET` is for the holder (`_require_reader`)
      and returns the list. `PUT` replaces the whole list, needs
      `_require_writer` and CSRF, validates it as above, rewrites
      `profile.yaml`, and commits it to the passport's history with a
      subject such as `set 2 appraisal periods`. Replacing the whole list
      in one call keeps the check for overlaps in one place, and the page
      edits the list as a whole anyway. Typed response models go in
      `backend/app/schemas/passport.py`. Both routes are new, so the API
      change is additive and needs no decision file. Add the path to the
      route lists in `backend/tests/test_passport_api_contract.py`,
      `frontend/src/lib/passport/api.ts` and its test.

- [x] **Backend tests**, in `backend/tests/test_passport_router.py`: a holder
      can set and read periods; an overlap is refused with a clear message;
      an end before the start is refused; a read-only holder cannot write;
      an assessor cannot read another holder's periods; each change is a
      commit in the passport's history. That an old `profile.yaml` with no
      periods still reads is tested beside the specialties case, in
      `backend/tests/test_passport_schemas.py`.

- [x] **Client functions**, `fetchAppraisalPeriods` and
      `saveAppraisalPeriods`, in `frontend/src/lib/passport/api.ts`, with an
      `AppraisalPeriod` type in `types.ts`.

## Phase 2: The CPD date ranges page

- [x] **An `AppraisalPeriodForm` component**, in
      `frontend/src/components/passport/`, composed from `BaseCard`,
      `DateField` and `ButtonPair`: a "From" and a "To" date, with an
      `initial` prop for editing, as the other passport forms have. It
      refuses an end before the start before sending, and shows the
      server's own message, passed in as `error`, when it refuses an
      overlap. Stories and tests alongside, as every component needs.

- [x] **An `AppraisalPeriodTable` component** beside it, laid out as
      `CertificateTable` is: each range newest first, with its from and to
      dates and its length in months, and an `EllipsisMenu` with "Edit"
      and "Remove". The plan first put the table inside the page, but
      pages do not hold reusable UI inline, so it is a component with its
      own stories and tests. Its actions column appears only when it is
      given `onEdit` and `onRemove`, which is how a read-only passport gets
      a table with nothing to press. The arithmetic (`monthsIn`,
      `describeLength`, `newestFirst`, `samePeriod`) lives in
      `frontend/src/lib/passport/appraisalPeriods.ts`, so the CPD page can
      describe a range the same way in Phase 4. A range ending the day
      before its start day a year later counts as 12 months.

- [x] **The page, `CpdDateRangesPage`**, at `/settings/cpd-date-ranges`,
      in `frontend/src/pages/settings/`. Laid out as the passport's section
      pages are: a `PageHeader` ("CPD date ranges"), an `AddButton` ("Add
      a date range") on the right, then either an empty-state message or
      the table. The empty state says CPD is totalled June to June until a
      range is added. Adding or editing opens `AppraisalPeriodForm` above
      the table. Every change saves the whole list with
      `saveAppraisalPeriods`, and removing asks first in a `ConfirmModal`.
      The add button is disabled when the passport is read-only, as on the
      other passport pages. The route sits inside the passport's own gates
      in `frontend/src/main.tsx`, `RequireFeature feature="passport"` and
      `RequireCompetency competency="assess_clinician_passport"`, rather
      than behind the feature alone as first planned, so the page and the
      passport routes cannot disagree about who may open them.

- [x] **A nested "CPD date ranges" link under Settings** in the side
      navigation while the page is open, as `.claude/rules/pages.md` asks of
      a new page. Settings had no children, so this adds the first. It is
      in `frontend/src/components/navigation/featureNavItems.ts`, where the
      Settings entry now lives, rather than `SideNavContent.tsx`, and is
      offered only to a passport holder, because anyone else would be led
      to a 404. The page comes before the settings button that opens it,
      so each unit is whole when it lands: the button never links to a
      page that is not there yet, and until the button arrives the page is
      reachable only by its address.

- [x] **Page tests**: the empty state; listing ranges newest first; adding,
      editing and removing each saving the whole list; an overlap refused by
      the server shown in the form; read-only disabling the buttons; the
      nested navigation link, in `SideNavContent.test.tsx`.

## Phase 3: The settings card

- [x] **Rename the card and slim it down**, in
      `frontend/src/components/passport/PassportSpecialtyCard.tsx`. The
      title becomes "Clinician passport". The helper text "Choose one or
      more" goes, so the field reads as just its label, "Specialities". The
      read-only message stays, since it tells the holder why nothing can be
      changed. The card and settings page tests that find the card by its
      heading, and the story title, are updated. The component keeps its
      name, since renaming it would touch every import for no reader's
      benefit. The same helper text on the passport's own create form, in
      `PassportPage.tsx`, stays: the request was about this card.

- [x] **Add a "CPD date ranges" button to the card**, linking to
      `/settings/cpd-date-ranges`. `ActionCard`'s `action` slot replaces its
      button, so the card composes the specialities field and a button in
      a `Stack` inside that slot, rather than changing `ActionCard`. The
      button is `ActionCardButton`, the one every other settings card
      shows, rather than `IconTextButton`, which has no link form. It
      stays enabled when the passport is read-only, because the page lets
      a read-only holder see their ranges even though it will not let them
      change them.

## Phase 4: Total CPD over the periods

- [x] **The CPD page chooses a date range, not a year**, in
      `frontend/src/pages/passport/PassportCpdPage.tsx`. The field labelled
      "Year" is renamed "Date range", and lists the declared ranges newest
      first, each shown by the months it starts and ends, for example
      "October 2025 – September 2026", using the spaced en dash. The months
      are those of the stored `starts_on` and `ends_on` dates, so an
      appraisal year ending the day before it began reads as ending the
      month before. Where two ranges would read the same, such as two
      short ranges in one month, both show their full dates instead, so no
      two options look alike (`labelPeriods` in
      `frontend/src/lib/passport/appraisalPeriods.ts`). With no ranges
      declared, the options are the June to June years, labelled the same
      way, for example "June 2025 – May 2026", reaching back to the oldest
      activity and never fewer than five; `CpdTable` then says the year is
      a convention. The page opens on the range holding today, or the
      newest if none does. The chosen range is passed to `CpdTable` as its
      `period`, whose own `{from, to}` type gave way to the shared
      `AppraisalPeriod`. After adding an activity, the page shows the
      range its date falls in.

      The plan first had the page fetch each calendar year a range
      touches. That cannot find the activities outside every range, which
      may be in any year, so instead `GET
      /api/passport/{passport_id}/cpd` now returns every activity, oldest
      first, and the page sorts them into ranges. The path already
      existed for adding an activity, so the change is an added method,
      and additive. A career of CPD is a few hundred small files, which
      is fine to read at once; if it ever is not, the route can take a
      date range.

- [x] **Activities outside every declared period stay reachable.** A gap
      between periods, or an activity from before the first one, would
      otherwise vanish from the CPD page. The selector gains a final option,
      "Outside your date ranges", listing those activities, shown only when
      there are any.

- [x] **The exports total CPD over the periods too**, in
      `backend/app/features/passport/render.py` and `pdf.py`, which grouped
      by calendar year. Each section states its own range, as the
      clinician passport plan requires of every CPD total ("1 August 2025
      to 31 July 2026"), newest first, and activities outside every period
      form their own final section, "Outside the declared date ranges".
      With no periods declared, the sections are June to June years and
      the export says that is a convention, matching the CPD page. Both
      exports group through one function, `group_cpd` in
      `backend/app/features/passport/cpd_periods.py`, so the Markdown and
      the PDF cannot total differently. A period with no activities is
      left out, as an empty year was before.

## Phase 5: Accessibility journeys

- [ ] **This plan changes the navigation**, by adding the first child link
      under Settings. Name the journeys in
      `docs/docs/frontend/accessibility/journeys.md` that pass through the
      side navigation, and add them to the "Not yet run" list in
      `testing-log.md`.

## Decisions

- **"CPD date ranges" on screen, `appraisal_periods` in the record.** The
  holder asked for date ranges to total CPD over, and that is what the
  screen calls them. The record keeps the name the clinician passport plan
  chose, because these are appraisal years, and revalidation is a different
  five-yearly event that must not be confused with them.

- **Stored in `profile.yaml`, not the core database.** The passport is a
  set of files that travels with its holder, and exports and verification
  read it whole. The periods are part of what the record says about its CPD,
  so they live with it. This is not a JSON column: nothing in the core
  database changes.

- **Ranges can be corrected and removed, not only added.** The clinician
  passport plan expected them to be appended only, since a past period
  stays true. But a holder who types the wrong month needs to fix it, and
  every change is a commit in the passport's history, so the earlier value
  is never lost.

- **Overlaps are refused; gaps are not.** Overlapping periods would count an
  activity's points twice. A gap is an honest career break, and the
  "Outside your date ranges" option keeps its activities visible.
