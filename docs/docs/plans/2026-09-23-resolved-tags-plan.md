# Resolved tags plan

Each teaching answer stores `resolved_tags`, a JSON list of strings on
`assessment_answers`. The tags come from the answer option the candidate
picked, such as `high_confidence`, `adenoma` or `correct`, and are copied
when they answer. The pass criteria in `backend/app/features/teaching/scoring.py`
loop over them in Python (`if tag in a["resolved_tags"]`, lines 100 and
118), because the database cannot see inside the column. The scoring works:
it reads one assessment's answers whole. But no question across attempts can
be asked of the database, such as "how often do trainees choose `adenoma`
with high confidence when the answer is serrated?". A list of tags is a
relationship wearing a document's clothes, which is the pattern
`.claude/rules/backend.md` asks to be stored as rows.

This plan moves the tags onto an `assessment_answer_tag` table, one row per
tag per answer, and keeps them as a copy taken at answer time rather than
joining to the question bank. It follows the expand, dual-write, backfill,
switch-reads, contract order in
[User competency table](2026-09-23-user-competency-table-plan.md).

## Phase 1: Settle what a tag belongs to

- [x] **Tags belong to the chosen option, not to the question item.** The
      first draft of the competency plan described `resolved_tags` as "which
      topics a question turned out to cover" and asked whether a join to the
      item could replace it. Investigation says neither holds.

      Items have no tags of their own. Tags live only on options. For a
      uniform bank the options are shared, in the bank's
      `config_yaml.options[].tags`. For a variable bank they are per item, in
      `QuestionBankItem.options[].tags`. `score_answer_uniform` and
      `score_answer_variable` in `scoring.py` copy the chosen option's tags
      into the answer. So a tag such as `high_confidence` describes the
      candidate's choice. A join on `item_id` alone could not rebuild it,
      and would need `selected_option` as well.

- [x] **Keep the copy, and reject the join.** Even with `selected_option`,
      a join would read the options *as they are now*, and they change.
      Within one `bank_version`, sync updates items and `config_yaml` in
      place (`sync.py:318-327`, `358-419`): a draft bank always re-syncs
      into version 1, and a re-sync without a module status overwrites. A
      join would silently re-score a finished assessment against today's
      options. `docs/docs/plans/2026-03-18-teaching-project.md:482` chose the
      copy deliberately as an audit trail, with no re-evaluation. The copy
      is right. Only its storage is wrong.

## Phase 2: Add the table and write it beside the JSON

- [ ] **Add an `AssessmentAnswerTag` model** in
      `backend/app/features/teaching/models.py`, with `answer_id` (FK
      `assessment_answers.id`, `ON DELETE CASCADE`), `tag`
      (`varchar(100)`), a unique constraint on the pair, and an index on
      `tag` for the cross-attempt questions this exists to answer. Add a
      `tags` relationship on `AssessmentAnswer`, loaded with `selectin`.

- [ ] **Write rows beside the JSON in `submit_answer` and `update_answer`**
      (`backend/app/features/teaching/router.py:1386` and `:1485`). An
      answer can be changed before the assessment is completed, and each
      change re-resolves its tags. So the rows for that answer are replaced
      rather than diffed. That is safe where it would not be for
      competencies: until completion, an answer is being edited, not
      recorded, and the completed answer is what the audit trail keeps.

## Phase 3: Backfill

- [ ] **Copy every answer's `resolved_tags` into rows in one hand-written
      migration**, using `json_array_elements_text` guarded against a value
      that is not an array. Skip answers that already have rows, so
      anything dual-written is not copied twice. Test it against Postgres in
      the `alembic_drift_check` job, as
      `backend/tests/test_user_competency_backfill.py` does.

## Phase 4: Switch reads

- [ ] **Build the answer dicts in `complete_assessment` from rows**
      (`router.py:1736-1743`). `evaluate_pass_criteria` keeps its signature
      and its tests in `backend/tests/test_teaching_scoring.py`, which pass
      dicts directly and need no change.

- [ ] **Move `test_answer_persists_scoring_fields`**
      (`backend/tests/test_teaching_router.py:605`) to assert on the rows.

## Phase 5: Stop writing JSON

- [ ] **Remove the JSON writes** from `submit_answer` and `update_answer`.

## Phase 6: Drop the column

- [ ] **Drop `assessment_answers.resolved_tags`** in its own destructive
      migration with the `allow-destructive` marker, through the
      `db-destructive-migration-review` environment.

## Decisions

- **A copy, not a join** — Phase 1 has the reasoning. The rows are the
  same snapshot the JSON held, stored where the database can see it.

- **`score_breakdown` stays JSON** — it is the frozen result of one
  attempt, whose shape depends on the pass criteria that produced it. It is
  read back whole and nothing points inside it, which is the test for a
  genuine document.

- **Nothing here changes scoring** — pass or fail is computed exactly as
  before, from exactly the same tags.

## Open questions

- **Should `assessment_answers.item_id` be indexed?** It has no index
  today. Any cross-attempt question joins through it, so it will matter as
  soon as Phase 4's rows are queried by anything other than
  `complete_assessment`.

- **Should sync stop updating a version in place once anybody has
  answered from it?** The copy protects answers from that, but the items
  themselves still change under them: an assessor reviewing an old attempt
  sees today's wording. That is a question about sync, not about tags, and
  wants its own plan.
