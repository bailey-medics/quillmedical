# Assessment question results plan

The result page at `/teaching/assessment/:id/result` shows the pass criteria
and nothing about individual questions. For audit, a candidate (and later
anyone checking their attempt) needs to see which questions they got right and
wrong, identified by the question's own number in the bank rather than the
shuffled position it was shown at during the exam, together with the question
bank version the attempt was sat against. Without the version, a result cannot
be tied to the exact questions that produced it, because a bank is re-synced
under a new version when it changes.

Everything needed is already stored. `AssessmentAnswer.is_correct` is set when
each answer is submitted, `Assessment.bank_version` records the version, and
each `QuestionBankItem` keeps its source directory name (`question_001` and so
on) in `metadata_json["_source_dir"]`. The work is one read-only endpoint, one
table component, one page and a link to it from the result page.

## Phase 1: Backend endpoint

- [x] **Add the response schemas** in `backend/app/features/teaching/schemas.py`,
      beside `AssessmentOut`, with `extra="forbid"`:
      `AssessmentQuestionResultOut` (`question_number: int | None`,
      `question_ref: str`, `display_order: int`, `answered: bool`,
      `is_correct: bool | None`, `answered_at: datetime | None`) and
      `AssessmentQuestionResultsOut` (`assessment_id`, `question_bank_id`,
      `bank_version`, `bank_title`, `exam_ref`, `completed_at`, `is_passed`,
      `questions: list[AssessmentQuestionResultOut]`). The correct option and
      the chosen option are deliberately absent; see Decisions.

- [x] **Derive the question number from `_source_dir`** in a small typed
      helper, `question_number_of` in `backend/app/features/teaching/router.py`:
      take the trailing digits of the directory name, so `question_001`
      becomes 1, and return `None` when the name has none. Found while
      building: sync only accepts directories matching `^question_(\d+)$`, so
      every synced item has a number and the `None` case is defensive. `question_ref` always carries the directory name itself,
      which is the identity `sync.py` matches items on, so an auditor can find
      the exact `question.yaml` even when there is no number to show.

- [x] **Add `GET /teaching/assessments/{assessment_id}/question-results`**
      after `get_assessment` in `router.py`. Same ownership check as
      `get_assessment`: 404 when the assessment is missing or belongs to
      somebody else, so another user's attempt is not even confirmed to exist.
      **Refuse an attempt that is not complete** (`completed_at is None`) with
      409, because answering this mid-exam would tell the candidate which of
      their answers so far are right. Load the answers with their items
      (`item` is already `lazy="joined"`), look up the bank title from the
      `QuestionBankConfig` row for `question_bank_id` and `bank_version`, and
      sort by question number, never by `display_order`. Sorted numerically
      rather than by directory name as `sync.py` does, because a bank without
      zero-padding would otherwise put `question_10` before `question_2`;
      anything without a number goes last. An answer counts as answered when
      `selected_option` is set, the same test the answer routes use. The
      reads follow `get_assessment` and `download_certificate`, which let a
      database error surface as a 500 rather than catching it, and nothing
      about the question text is logged.

- [x] **Backend tests** in `backend/tests/test_teaching_router.py`, reusing the
      start, answer and complete fixtures already there around line 505:
      the owner gets every question in canonical order when the bank was
      shuffled (assert the order differs from `display_order`); `bank_version`
      matches the attempt, not the bank's current version after a re-sync;
      an unanswered question comes back `answered: false, is_correct: null`;
      another user gets 404; an in-progress attempt gets 409; a
      `_source_dir` with no digits gives `question_number: null`. Run with
      `just ub -k "question_results"`.

## Phase 2: Frontend table component

- [x] **Add the types** `AssessmentQuestionResult` and
      `AssessmentQuestionResults` to `frontend/src/features/teaching/types.ts`,
      mirroring the schemas.

- [x] **Build `QuestionResultsTable`** in
      `frontend/src/components/teaching/question-results-table/`, composed
      from `DataTable` / `Column` (`@components/tables/DataTable`) the way
      `AssessmentHistoryTable` is. Columns: question number (falling back to
      `question_ref`), result, and the position it was shown at, headed
      "Position shown in exam" so nobody mistakes it for the question
      number. The result is `AssessmentResultBadge` reading "Pass" or
      "Fail", the words the request used, and plain "Not answered" for an
      unanswered question rather than stretching the badge's "Incomplete"
      to mean something else. Found while building: `DataTable` already
      turns rows into cards on mobile and shows every column there on
      purpose, so the shown-at column is kept at every width rather than
      dropped below `sm`. This is a new component, so per the
      Storybook-first rule it needs Mark's review; built under
      `/st-follow-the-plan-document`, that review happens on its own pull
      request rather than before building.

- [x] **Stories and tests**: `QuestionResultsTable.stories.tsx` (mixed, all
      passed, some unanswered, a bank with no numbers, loading, empty, dark)
      and `QuestionResultsTable.test.tsx` covering each outcome, that rows
      keep the bank order whatever the shown-at order, the fallback label,
      the empty list, loading and error. Run with
      `just uf src/components/teaching/question-results-table/QuestionResultsTable.test.tsx`:
      9 passed.

## Phase 3: Page, route and link

- [x] **Add `AssessmentQuestionResultsPage`** in
      `frontend/src/features/teaching/pages/`, calling the new endpoint through
      `api`. A `PageHeader` with the bank title, then the audit facts above
      the table: question bank version, exam reference when there is one,
      completed date and time, and overall pass or fail, in a `BaseCard` of
      `BodyText` lines. Loading skeleton, and a `StateMessage` carrying the
      API's own message for the 404 and 409 cases. `<Stack gap="lg">`, no
      `Container`.

- [x] **Route it** in `frontend/src/main.tsx` as
      `assessment/:id/question-results` under `/teaching`, next to the result
      route, with `handle: { safeForReload: true }`. Unlike the result page
      it reads nothing from `location.state`, so a reload or a bookmarked
      link rebuilds it from the URL, which is what an audit link needs.

- [x] **Link to it from the result page**: add an optional
      `questionResultsHref` prop to `AssessmentResult` and render a `TextLink`
      beneath `ScoreBreakdown` when it is set, labelled "View results by
      question". `AssessmentResultPage` passes it only for a completed
      attempt. Update `AssessmentResult.stories.tsx` and
      `AssessmentResult.test.tsx` for the new prop, and add page tests for
      `AssessmentResultPage` and `AssessmentQuestionResultsPage` in
      `pages.test.tsx`. Run with
      `just uf src/features/teaching/pages/pages.test.tsx src/components/teaching/assessment-result/AssessmentResult.test.tsx`:
      34 passed.

- [x] **Put the teaching side navigation back on the result page**, asked
      for while this plan was being built. `AssessmentResultPage` renders
      `TeachingLayout` with no `sidebar`, so the result page has no
      navigation and the burger does nothing; pass `TeachingMainNav` as
      `sidebar` and `drawerContent` in every state (loading, error,
      incomplete, result), as `TeachingDashboard` does. The new question
      results page gets the same. The attempt page itself keeps no sidebar,
      since leaving an exam mid-way by a nav link is what that layout avoids.
      This changes navigation, so the accessibility journeys in
      `docs/docs/frontend/accessibility/journeys.md` were checked: none of
      the four reaches an assessment result (journey 3 is a teaching
      lecture, not an assessment), so nothing is added to the "Not yet run"
      list in `testing-log.md`. An assessment journey would be worth
      writing before the next screen reader round.

## Phase 4: The answer given, and a card for the link

- [x] **Move "View results by question" into an action card** at the bottom of
      the result page, after the certificate card and above "Back to dashboard"
      and "Try again", instead of a text link under the score breakdown. Asked
      for on 27 September. `AssessmentResult` renders it as an `ActionCard`
      titled "Results by question", with the same full-width style as the
      certificate card.

- [x] **Return the answer given**: `selected_answer` on
      `AssessmentQuestionResultOut`, the label of the option the candidate
      chose as they saw it, from the bank's config for a uniform bank or the
      item for a variable one, by `chosen_option_label` in `router.py`. It
      falls back to the option's id if the bank no longer lists it, so an
      answered question is never blank, and is null when nothing was chosen. An
      added optional field, so additive. The correct option is still never
      returned.

- [x] **Show it in the table and drop the shown-at position**:
      `QuestionResultsTable` now has three columns, Question, Answer given and
      Result. "Position shown in exam" is gone; `display_order` stays in the
      API for anybody reconciling a dispute.

- [x] **Show the pass criteria in the top card**, such as "High confidence
      rate: 78.0%" and "High confidence accuracy: 66.7%", to one decimal place
      as the result page's score breakdown shows them. `criteria` on
      `AssessmentQuestionResultsOut`, read from the stored score breakdown by
      `scored_criteria` in `router.py`, which leaves out an entry of the wrong
      shape rather than failing the page. An added field with a default, so
      additive; the page treats it as absent from an older backend.

- [x] **Tests**: the endpoint gives the chosen label and no correct-option
      field; `chosen_option_label` falls back to the id; the endpoint gives the
      criteria as scored, and none for an attempt never scored;
      `scored_criteria` skips a malformed entry; the table's columns and middle
      column; the page shows each criterion's percentage; the result page's
      card sits after the certificate.

## Decisions

- **Correctness only, never the right answer.** The view says whether each
  question was right, not what the right option was or which one the
  candidate chose. Showing the answer key would let a candidate who failed
  learn it before retrying, and the bank's value depends on it staying
  unseen. Correctness alone is what an audit of the mark needs.

- **The directory name is the question's identity.** There is no question
  number column, and adding one would need a migration and a sync change for
  something the directory name already records. `sync.py` sorts and matches
  on it, so it is stable within a bank version and is what a question bank
  author sees on disk.

- **The shown-at position is kept, but secondary.** It is not the question
  number and is labelled so, but it lets a candidate reconcile "the tenth
  question I saw" with the bank, which is the first thing asked in a dispute
  about a mark.

- **Candidate-only for now.** The endpoint checks ownership, like every other
  attempt endpoint. An educator view of a candidate's per-question results
  would sit behind `manage_teaching_content`, scoped by org unit like
  `GET /teaching/results`, and is left for a later phase once there is a
  routed educator results page to hang it from; `AllResults.tsx` exists but
  is not routed.

- **Superseded on 27 September 2026: the candidate's own answer is shown, and
  the shown-at position is not.** Mark decided the page should show what each
  question was answered with, which reverses "Correctness only" above in part:
  the correct option is still never sent, but wherever the candidate was right
  their answer is the correct one, so a candidate who retries learns those. The
  "Position shown in exam" column was dropped at the same time, reversing "The
  shown-at position is kept". See Phase 4.
