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

- [ ] **An `AppraisalPeriodForm` component**, in
      `frontend/src/components/passport/`, composed from `BaseCard`,
      `DateField` and `ButtonPair`: a "From" and a "To" date, with an
      `initial` prop for editing, as the other passport forms have. It
      refuses an end before the start before sending, and shows the server's own
      message when it refuses an overlap. Stories and tests alongside, as
      every component needs.

- [ ] **The page, `CpdDateRangesPage`**, at `/settings/cpd-date-ranges`,
      behind `RequireFeature feature="passport"` in `frontend/src/main.tsx`.
      Laid out as the passport's section pages are: a `PageHeader` ("CPD
      date ranges"), an `AddButton` ("Add a date range") on the right, then
      either an empty-state message or a table. The empty state says CPD is
      totalled June to June until a range is added. The table lists each
      range newest first, with its from and to dates and its length in
      months, and an `EllipsisMenu` with "Edit" and "Remove". Adding or
      editing opens `AppraisalPeriodForm` above the table. Every change
      saves the whole list with `saveAppraisalPeriods`. Buttons are disabled
      when the passport is read-only, as on the other passport pages.

- [ ] **A nested "CPD date ranges" link under Settings** in the side
      navigation while the page is open, as `.claude/rules/pages.md` asks of
      a new page. Settings has no children today, so this adds the first,
      in `frontend/src/components/navigation/SideNavContent.tsx`.

- [ ] **Page tests**: the empty state; listing ranges newest first; adding,
      editing and removing each saving the whole list; an overlap refused by
      the server shown in the form; read-only disabling the buttons; the
      nested navigation link.

## Phase 3: The settings card

- [ ] **Rename the card and slim it down**, in
      `frontend/src/components/passport/PassportSpecialtyCard.tsx`. The
      title becomes "Clinician passport". The helper text "Choose one or
      more" goes, so the field reads as just its label, "Specialities". The
      read-only message stays, since it tells the holder why nothing can be
      changed. Update the card and settings page tests that find the card by
      its heading, and the story title.

- [ ] **Add a "CPD date ranges" button to the card**, linking to
      `/settings/cpd-date-ranges`. `ActionCard`'s `action` slot replaces its
      button, so the card composes the specialities field and an
      `IconTextButton` (or a plain `Button` if no icon fits) in a `Stack`
      inside that slot, rather than changing `ActionCard`. The button stays
      enabled when the passport is read-only, because the page lets a
      read-only holder see their ranges even though it will not let them
      change them.

## Phase 4: Total CPD over the periods

- [ ] **The CPD page chooses a date range, not a year**, in
      `frontend/src/pages/passport/PassportCpdPage.tsx`. The field labelled
      "Year" is renamed "Date range", and lists the declared ranges newest
      first, each shown by the months it starts and ends, for example
      "October 2025 – October 2026", using the spaced en dash. The months
      are those of the stored `from` and `to` dates. Where two ranges would
      read the same, such as two short ranges in one month, both show their
      full dates instead, so no two options look alike. With no ranges
      declared, the options are the June to June years, labelled the same
      way, for example "June 2025 – May 2026". The chosen range is passed
      to `CpdTable` as its `period`. The API still
      files CPD by calendar year, so the page fetches each year the period
      touches (a period from August 2025 to July 2026 needs both years) and
      keeps the activities inside it. With no periods declared, the page
      works as today, June to June. After adding an activity, the page
      shows the period its date falls in.

- [ ] **Activities outside every declared period stay reachable.** A gap
      between periods, or an activity from before the first one, would
      otherwise vanish from the CPD page. The selector gains a final option,
      "Outside your date ranges", listing those activities, shown only when
      there are any.

- [ ] **The exports total CPD over the periods too**, in
      `backend/app/features/passport/render.py` and `pdf.py`, which group by
      calendar year today. Each section states its own range, as the
      clinician passport plan requires of every CPD total, and activities
      outside every period form their own final section.

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
