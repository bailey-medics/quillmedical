# Consolidate teaching-tooling plan

While hardening certificate config parsing (`backend/app/features/teaching/certificate.py`
was converted from hand-rolled `dataclass` definitions to validated Pydantic models), a
question came up that the refactor could not answer on its own: are the `*-teaching`
content repos tested in CI so that no malformed certificate config can be accepted?

They are not. The `certificate:` block schema exists in **three divergent copies**, and
the one the merge gate actually runs is the copy that does not check it:

- `backend/app/features/teaching/validate.py` **has** the checks, but runs only at sync —
  after merge, after GCS publish
- `teaching-repos/*/scripts/validate.py` **has** the checks, but has **never run** —
  orphaned since `1b3b90f`, because CI always checks out the tooling copy over it
- `teaching-tooling/scripts/validate.py` runs as the pull-request merge gate, and is the
  one copy with **no certificate checks at all**

The failure is silent as well as late. On a validation failure `sync_question_bank` marks
the sync record `status="failed"` and returns, so the bank keeps serving its previous
version (or never appears). The CI step is `curl -sf .../api/ci/teaching/sync`, and that
endpoint returns **200** with the errors in the response body — `-f` only fails on an HTTP
error status, so the content repo's CI goes green. A malformed certificate block merges,
deploys, reports success, and leaves its only trace in a `QuestionBankSync` row nobody
reads.

The drift is not an accident of one file. It is what a split repo costs when the same
contract has to be understood in two places, which is why this plan is about repo topology
rather than about adding one more validator.

`teaching-tooling` was created so content repos would not have to check out the whole Quill
repo just to run CI on a push. That was a reasonable instinct, but the measurements no
longer support it:

- **Weight** — `teaching-tooling` is 57 tracked files / 304K; Quill is 1518 files / 17M.
  Content-repo CI runs take 15–35s today, so a full checkout would add a few seconds, and
  `actions/checkout` supports `sparse-checkout:`, which brings the fetch down to the
  validator and schema alone — tens of KB.
- **Cadence** — `teaching-tooling` has had 32 commits in twelve months, the last three
  months ago. Quill has had 2203 in the same period.
- **Ownership** — a single maintainer holds every repo, so there is no team boundary for
  the split to protect.
- **Visibility** — Quill and `teaching-tooling` are both public and content repos are
  private, so content CI can call either with no access configuration.

The intended outcome is one source of truth for the content contract, drift that is
structurally impossible rather than merely fixed, a net deletion of cross-repo plumbing,
and tooling that inherits Quill's `mypy --strict`, Ruff, Black and pre-commit gates.

## Decisions

- **Consolidate into Quill rather than version the split** — The split's only benefit —
  light content CI — is achievable with `sparse-checkout`. Its costs are real and already
  biting: three schema copies, ~120 lines of untyped `importlib` plumbing, and a weaker
  quality gate on the shared contract than on the code consuming it.

- **Place the package at `backend/app/features/teaching/tooling/`** — The content
  contract belongs with the teaching feature, next to `certificate.py`, `sync.py` and
  `storage.py`, rather than in a second top-level location. One thing blocks it today:
  `app/features/__init__.py` defines `requires_feature`, so importing anything under
  `features/` drags in FastAPI, SQLAlchemy, `app.models`, `app.db` and `app.config` — and
  `Settings` requires `JWT_SECRET` and `CORE_DB_PASSWORD`, which a YAML validator has no
  business needing. Relocating that one function (3 import sites) leaves every
  `__init__.py` in the chain a docstring and makes the natural location viable.

- **Validate at the merge gate and at sync, but not in `deploy`** — The merge gate and
  the sync gate protect different things: CI stops bad content existing and is the only
  place an author gets feedback before merge; sync is the last line before candidates see
  a bank, and the only gate that sees what is actually in GCS. `tooling_validate.py`
  exists to give sync that second layer, with a clinical-safety rationale in its
  docstring, so consolidation must preserve it rather than drop it with the file. The
  `deploy` job's re-run is different: with a ruleset that has no bypass actors and strict
  status checks, the tree it deploys is byte-identical to the tree the pull-request check
  passed, so it can find nothing new, so not worth having a second CI run.

- **Keep `parse_certificate_style` and `_validate_with_recovery` in `certificate.py`** —
  the two consumers want opposite failure behaviour. The validator must raise and report
  every problem; the renderer must drop the offending key and fall back to a default so a
  certificate download never returns a 500. Shared schema, separate policy.

- **Preserve the job names `validate` and `check-protection`** — Content-repo rulesets
  require status checks named `pipeline / validate` and `pipeline / check-protection`
  (`teaching-tooling/infra/main.tf:73-83`). Those names are composed from the caller's
  job name and the called workflow's job names, so preserving both means no ruleset edit
  — removing the riskiest part of the migration.

- **Track `@main` rather than pinning content repos to a tag** — Tooling changes are
  improvements, so content should roll forward with them: a bank that fails a stricter
  validator is a bank that needs fixing, and that failure lands loudly on a pull request
  where it can be acted on. Quill's commit rate is not relevant here — `uses:` resolves
  one workflow file, and the checkout pulls only the teaching content package and
  the MDX parser, so the rate of _content-affecting_ change stays what it is today
  (~32/yr). A pin would also add a quieter failure of its own: a forgotten tag bump
  leaves content repos silently running stale tooling.

- **When tooling change breaks a bank, fix the bank — and for live banks, fix it by
  publishing a new version** — the policy is: a validator change that stops a bank being
  read is the tooling doing its job, so the content repo is what changes. If the bank is
  `live`, the fix ships as version N+1, which supersedes N for new entrants while
  in-flight candidates finish on the version they started. Almost all of this already
  works: `Assessment.bank_version` is pinned at start
  (`backend/app/features/teaching/router.py:620`), new entrants always resolve the highest
  version (`order_by(QuestionBankConfig.version.desc())`), old `QuestionBankConfig` rows
  are retained by the `(organisation_id, question_bank_id, version)` unique constraint so
  historical records still resolve, and `check_version_lock.py` already *forces* the bump
  for any assessment change to a live module. So "how do we do this" is mostly "we already
  do" — no new versioning machinery, and specifically no tooling versions, which would be
  per repo rather than per module and would not bind the sync gate at all.

- **Three gaps in that policy, worth closing** — (1) the failure is currently invisible:
  a live bank that fails the new validator at sync records `status="failed"`, the previous
  version keeps serving, and the deploy still goes green, so nobody learns a new version is
  needed — this is Phase 6 and it is what makes the policy work at all. (2) There is no
  "withdraw version N" operation: `QuestionBankOrgStatus.is_live` is per bank, not per
  version, so the only lever for superseding a bad version is publishing the next one, and
  the only blunt fallback is closing the whole bank. Worth knowing before it is needed
  rather than during. (3) `retired` modules are the one case the policy cannot reach —
  `check_version_lock.py` forbids all changes to them, so they can never be brought into
  line with a stricter validator, and because the deploy loop re-uploads every module
  regardless of status they would fail sync on every deploy forever. That is not merely
  untidy: a permanently red deploy trains you to ignore red deploys, which costs the
  signal that gap (1) exists to create. Skipping validation for retired modules is the fix,
  and it belongs with the other two rather than in a separate versioning scheme.

- **The tooling-change sweep reports, it does not block the Quill deploy** — a live bank
  failing revalidation is a content problem, and blocking an app release on it couples the
  wrong things together and creates an incentive to skip the check to ship. Report loudly
  (Slack, plus the failed `QuestionBankSync` rows) and let the content repo publish version
  N+1 in its own time; the previous version keeps serving in the meantime, which is the
  safe default. The same applies to the pull-request sweep below: it names the banks, it
  does not gate the merge.

- **Catch it at pull-request time, not just at deploy** — the deploy sweep tells you a
  live bank broke; a pull-request sweep tells you *before* you merge the change that
  breaks it, which is the difference between "publish version N+1 now" and "publish
  version N+1 while a bank is already failing". The credential objection does not hold:
  `terraform.yml` already runs `google-github-actions/auth` on `pull_request` with
  `GCP_TEACHING_WIF_PROVIDER`, so GCP auth at pull-request time on this public repo is
  established practice, and `ci.yml` already triggers on `pull_request` to main. The sweep
  needs no database either — `sync_question_bank` returns from `validate_only=True` before
  it touches `db` — so it is a plain CLI run over downloaded content. Start it
  non-blocking: the remedy (publish N+1) lives in another repo, so a hard gate would stall
  a tooling pull request on external work, and a `retired` module may have no possible
  remedy at all. Make it loud, name the affected banks, and promote it to a required check
  once the `retired` skip has landed and it has proven quiet.

- **Retire `validate_mdx.js` and validate MDX with the parser production actually uses**
  — the question worth asking at either gate is "will Quill render this as intended?",
  and only `mdx_parser.py` can answer it. Strengthening that parser into a validator (at
  least one slide; recognised components only; well-formed props; an error on any
  component-shaped tag it would otherwise drop) gives one implementation at both gates,
  which is this plan's thesis applied to MDX. It also removes the Node dependency
  entirely: no `scripts/teaching/` directory, no second `package.json` or lockfile, no
  Corepack step in the content CI job, and the "Yarn 4 versus npm" question disappears
  rather than needing an answer. The cost is losing the `@mdx-js` syntax check —
  acceptable, because nothing in Quill compiles MDX, and a tag the Python parser cannot
  read is exactly what the new validating mode flags.

- **Make GCS mirror the repo layout, rather than just renaming `questions/`** — today the
  deploy step tears each bank into three top-level prefixes (`questions/<id>/`,
  `learning/<id>/`, `modules/<id>/module.yaml`) and renames `assessment` to `questions` on
  the way. Nothing requires that: production serves everything through **signed URLs** on a
  private bucket, so there is no public/private split by prefix, and no infra in this repo
  sets per-prefix access rules. The split costs real complexity — around sixteen call
  sites across `storage.py` and `certificate.py` read the three prefixes separately, and
  `download_module_from_gcs` exists *solely* to stitch them back together
  (`modules_prefix`/`assessment_prefix`/`learning_prefix`, `storage.py:614-643`). Moving to
  `modules/<bank_id>/{module.yaml,assessment/,learning/}` deletes that reconstruction
  entirely, makes the pull-request sweep a plain prefix download, and reduces the deploy
  job to one sync per module. Crucially it costs the **same bucket migration** a bare
  rename would: every object moves either way, so the larger change is free. Do it
  after consolidation, when writer and readers are finally in one repo, and before
  building the sweep so it is written against the final layout. No database migration —
  `QuestionBankItem.images` stores only `{"key": filename}`, and URLs are built per request
  by `storage.get_image_url` (`router.py:169`).

- **Name the package `tooling/`, not `content/`** — the first name implied the question
  bank content itself, which is misleading twice over: the real content lives in the
  `teaching-repos/*/modules/` trees and in GCS, and serving it is `storage.py`'s job. There
  was even a `frontend/src/features/teaching/content/` at one point, so the path was
  ambiguous across the stack. `tooling/` keeps the migration legible — the repo was
  `teaching-tooling`, every commit on this branch says tooling, and landing it at
  `teaching/tooling/` makes the history read as one continuous thing. It reads without
  stutter (`tooling/validate.py`, `python -m app.features.teaching.tooling.cli`) and is
  honest about scope: this is the *code* half of what that repo held, with the workflows
  going to `.github/` and the terraform to `infra/github/`. The one weakness is that
  "tooling" is a soft word that invites unrelated scripts into a package with a hard
  dependency constraint — mitigated by the constraint being stated in the package docstring
  and enforced by `test_features_import_boundary.py`, not by the name.

- **Delete `teaching-tooling` once both content repos are cut over** — Quill is not live
  yet, so there is no production history worth preserving and nothing to point a future
  investigation at. Delete rather than archive, and remove the local clone and every
  reference to it in the same pass, so nothing is left half-migrated. Ordering matters:
  a `uses:` reference to a deleted repo fails immediately, so both content repos must be
  cut over and green first.

## Target layout

```text
backend/app/features/gating.py       # MOVED — requires_feature, out of features/__init__.py

backend/app/features/teaching/tooling/   # NEW — pure Python, no app.* imports
├── __init__.py
├── certificate_schema.py            # moved out of ../certificate.py
├── module_schema.py                 # ModuleYaml and friends, from tooling validate.py
├── validate.py                      # merged validator (module + assessment + certificate)
├── check_version_lock.py            # moved from tooling
└── cli.py                           # argv entry point for CI

.github/workflows/teaching-pipeline.yml   # NEW — reusable, ported from tooling
```

**Hard constraint:** `features/teaching/tooling/` must never import `app.models`,
`app.db`, `app.config`, FastAPI, or anything from its own parent package. The import chain
above it (`app`, `app.features`, `app.features.teaching`) must stay docstring-only, so the
package remains runnable with just `pydantic` and `pyyaml` and needs no environment
variables.

## Where validation runs

One package, called at two gates. This is the point of the consolidation: the same code, so
the two gates cannot disagree.

- **Content-repo CI, the `validate` job** — on a pull request, before merge. Runs
  `content.cli` over `modules/` plus the Node MDX check. Blocks the merge.
- **Backend sync** — on `POST /api/ci/teaching/sync`, after the GCS upload. Runs the same
  validator via `sync.py`. Blocks the bank going live.

**Two gates, not three — the `deploy` job should stop re-validating.** The org ruleset on
content repos (`teaching-content-protected-branches`) is `enforcement = active` with
**zero bypass actors**, so nobody — org admins included — can push to `main` or merge
without `pipeline / validate` passing. It also sets
`strict_required_status_checks_policy = true`, which forces a branch to be up to date with
`main` before merging, and `non_fast_forward = true`. Between them, the tree that lands on
`main` is byte-identical to the tree the pull-request check passed on, so re-running the
same validator in `deploy` cannot find anything new. Drop those steps.

The two remaining gates are genuinely different. CI is the only one that gives an author
feedback before merge, and the only one that can stop bad content existing at all. Sync is
the last line before a bank is served to candidates, and the only one that sees what is
actually in GCS rather than what was in the pull request — so it still catches a bucket
written to directly, a partial upload, or content that predates a tightening of the rules.
That second layer is what `tooling_validate.py` provides today, and its docstring records
the reason: teaching assessments determine whether clinicians are fit to practise, so
invalid content must never reach production.

Sync currently runs **two** validators — `run_tooling_validation` for module metadata and
`validate_question_bank` for the assessment and certificate blocks. After Phase 2 these
become a single call to the merged validator, so sync gains the module checks and CI gains
the certificate checks in the same move.

**MDX is a fourth divergent implementation, and the fix is the same as the rest.** There
are two MDX readers today: `validate_mdx.js` compiles with `@mdx-js/mdx` and is strict, and
`backend/app/features/teaching/mdx_parser.py` is a regex extractor with **zero** `raise` or
`except` — it silently drops anything that does not match. Production only ever uses the
Python one: the frontend has no `@mdx-js` dependency and consumes pre-parsed slides from
`GET` on the learning route. So the Node compiler validates against a specification Quill
does not implement, while the reader that actually runs will quietly discard a malformed
`<Figure>` and render the slide without it. That silent content loss is the real risk, and
a strict MDX compile at sync would not catch it — it answers the wrong question.
Resolution in Phase 2: give `mdx_parser.py` a validating mode and run *that* at both gates.

## Phase 1: Move the tooling into Quill

Additive — `teaching-tooling` keeps working untouched throughout this phase.

- [x] Move `requires_feature` from `backend/app/features/__init__.py` into a new
      `backend/app/features/gating.py`, leaving `__init__.py` as a docstring. Update the
      three import sites (`features/teaching/router.py:23` and two inside
      `backend/tests/test_clinical_services.py`). This is what makes the target location
      importable without the FastAPI/SQLAlchemy stack, and it removes an executable
      FastAPI dependency from a package `__init__.py`, which is worth doing regardless.
- [ ] Port `teaching-tooling/scripts/validate.py` and `check_version_lock.py` into
      `backend/app/features/teaching/tooling/`, splitting the Pydantic models into
      `module_schema.py`. Both already import only the standard library, `yaml` and
      `pydantic`, so nothing needs restructuring to move.
      - [x] `check_version_lock.py` — ported with `ModuleStatus` as a `Literal`, YAML
            narrowed through `dict[str, object]` rather than `Any`, and a boolean guard on
            `version` so a YAML `version: yes` no longer reads as `1`.
      - [x] `validate.py` and `module_schema.py` — `ModuleYaml.status` is now a `Literal`
            shared with `check_version_lock`, `moduleId` uses a `pattern` constraint, and
            `renewalMonths`/`order` reject YAML booleans. Verified equivalent: run over the
            fixture tree, old and new flag **the same 7 errors on the same 7 paths**; only
            the invalid-status message wording differs, which is the `Literal` conversion
            doing its job.
- [ ] Bring across the 937 lines of tests from `teaching-tooling/tests/` (including
      `fixtures/`) as `backend/tests/test_teaching_tooling*.py`.
      - [x] The 616 version-lock lines, as `test_teaching_tooling_version_lock.py` and
            `..._integration.py`. The integration ones build real repositories and shell
            out to git, which the backend image lacked — `git` is now installed in the
            **dev** stage only (CI already has it on the runner), with a `skipif` guard so
            a missing binary skips rather than errors.
      - [x] `test_validate.py` as `test_teaching_tooling_validate.py`, and the 34-file
            `fixtures/` tree under `backend/tests/fixtures/teaching_tooling/`. Ruff (which
            teaching-tooling never ran) flagged `B017` blind `Exception` asserts; these now
            assert `ValidationError` and `CalledProcessError` instead.
- [x] Do not port `validate_mdx.js` — MDX validation moves to `mdx_parser.py` in Phase 2,
      so no Node project, lockfile or Corepack step is needed.
- [x] The tooling package carries its own `pyproject.toml` and `poetry.lock`, declaring
      only `pydantic` and `pyyaml`. Content CI runs `poetry install` there, so it gets the
      locked versions rather than a fresh resolve, and never the backend's stack.
      `backend/pyproject.toml` is left untouched — adding a group to it would relock the
      backend and churn the lock for a CI-only concern.
      - The cost is that `pydantic` and `pyyaml` are declared twice.
        `test_teaching_tooling_dependencies.py` is the guard: the shared constraints and
        the `python` requirement must be identical in both files, and the tooling package
        may declare nothing else.
      - Poetry itself is installed unpinned, matching `.github/actions/setup-python`.
        The acceptable range lives in the package's `requires-poetry` constraint, next to
        the lock it governs, rather than as a version number in the workflow.
- [x] Add `cli.py` so CI can run
      `python -m app.features.teaching.tooling.cli <modules_dir>` from `backend/`. Runs
      validation and version lock in one invocation. Carries `--skip-version-lock` for
      content with no git history — the GCS-download case the Phase 7 sweep needs — and
      `--ref` to override the comparison branch.
- [x] Convert the ported code to Quill's typed style — `Literal` types, bounded `Field`
      constraints, no `Any` — matching what `certificate.py` now does. `Any` is gone from
      every ported module; YAML input is narrowed through `dict[str, object]`.
- [x] Add a unit test asserting the import boundary holds — done as
      `backend/tests/test_features_import_boundary.py`, covering `app.features` and
      `app.features.teaching`. It runs the import in a subprocess with `JWT_SECRET` and
      `CORE_DB_PASSWORD` deliberately absent, so a regression fails loudly instead of
      passing on the test runner's own environment. Extend the parametrised list to
      `app.features.teaching.tooling` when that package lands.

## Phase 2: Merge the duplicate validators onto one schema

- [x] Move `TextFieldStyle`, `CertificateStyle`, `CertificateFont`, `Orientation` and the
      boolean-rejecting `Number`/`Whole` annotated types from
      `backend/app/features/teaching/certificate.py` into
      `content/certificate_schema.py`; import them back into `certificate.py`. The
      annotated types went to `content/annotations.py`, shared with `module_schema` which
      had grown its own copy. `certificate.py` keeps the recovery policy and declares
      `__all__` so the models stay importable from their old home. `text_fields()` is now
      a model method rather than the renderer's private mapping, ready for the validator
      to iterate in the next item.
- [x] Fold the certificate checks at `backend/app/features/teaching/validate.py:163` into
      the merged validator, driving them off `CertificateStyle.model_validate` rather than
      hand-rolled conditionals. Now `validate_certificate_config` in `content/validate.py`,
      called by both gates; the sync-side function keeps only the background-image lookup,
      which differs by source (GCS inventory versus a directory on disk). Removed the four
      now-dead constants (`VALID_FONTS`, `VALID_ORIENTATIONS`, `HEX_COLOUR_PATTERN`,
      `CERTIFICATE_TEXT_FIELDS`) that duplicated the schema.
- [x] Close the coverage gaps found during review: `exam_ref` and `margin` are not
      validated at all today, and unknown keys are not rejected, so a misspelled colour key
      silently does nothing. All three close automatically once the model drives the check.
      **The certificate block is now validated at merge time**, which is the original bug:
      `_validate_certificate` runs inside `_validate_assessment_dir`, so a malformed block
      fails a pull request instead of reaching GCS and failing quietly at sync. Note the
      presence requirement for the five text fields was kept deliberately — the model has
      defaults for all of them, so relying on it alone would have *weakened* the check.
      Pydantic's raw pattern message is translated back to "must be a hex colour (e.g.
      #404040)", which is what a clinician editing YAML can act on.
- [x] Give `backend/app/features/teaching/mdx_parser.py` a validating mode: at least one
      slide, recognised components only, well-formed props, and an error for any
      component-shaped tag it would otherwise drop silently. Done as `validate_mdx`, driven
      off the extractors' own patterns (hoisted to module constants) so validator and
      renderer cannot drift.
      **Correction to this plan: `Video` is not supported anywhere yet.** The Node
      validator listed it and checked its props, but nothing in the stack reads it — no
      `_extract_video`, no `ParsedSlide` field, no frontend mapping — so content following
      that validator passed CI and rendered a blank slide. YouTube video *is* supported end
      to end (`youtube_id` → `video-slide` layout → frontend `youtubeId`); hosted video is
      not. `KNOWN_COMPONENTS` is now the three names that actually have extractors, with
      `Video` listed in `NOT_YET_SUPPORTED` so authors get "hosted video is not implemented
      yet — use `<YouTube>` until it lands" rather than "unknown component". No existing
      content uses `<Video>`.
- [ ] **Follow-up, not part of this consolidation: implement hosted `<Video>`.** Planned
      shortly for GCP-hosted files. Four pieces must land together — an `_extract_video` in
      `mdx_parser`, the source field(s) on `ParsedSlide`, the frontend mapping and slide
      layout, and finally moving `Video` from `NOT_YET_SUPPORTED` into `KNOWN_COMPONENTS`.
      `test_known_components_are_the_ones_with_extractors` enforces the last step: adding
      the name without an extractor fails the suite, which is the guard that stops this
      recurring.
      **Deleting `validate_mdx.js` moves to Phase 4/5, not here.** It lives in the
      teaching-tooling repo, whose `pipeline.yml` the content repos still call; removing it
      now would break their CI before cut-over. It dies with the repo in Phase 5.
- [x] Call that validating mode from the merged validator, so learning content is checked
      at both gates by the same code that renders it. `_validate_learning_dir` now runs it,
      importing `mdx_parser` lazily so the `content` package still loads with only
      `pydantic` and `pyyaml`.
- [ ] **Collapse the two validators into one.** Scoped out properly after investigation:
      the plan originally read as though `run_tooling_validation` and
      `validate_question_bank` did much the same job, so one could simply replace the
      other. They barely overlap. `validate_question_bank` uniquely covers email sections,
      per-item uniform and variable checks, image naming, cross-item consistency, warnings
      as well as errors, and — the hard part — **23 places that accept an
      `image_inventory`**, a mapping of directory name to filenames used when content sits
      in GCS and there are no files on disk to look at. The content validator has none of
      that and works only against a real directory; it uniquely covers `module.yaml` and
      learning MDX. Both now check the certificate, so running both double-reports it.
      Genuinely merging them is a rewrite of how live content is validated, so it is broken
      into the units below rather than smuggled into a plumbing-removal step. The regression
      net is the ~32 existing calls in `test_teaching_validate.py`, five of which exercise
      the inventory path; they must keep passing throughout.
      - [x] **Unify the result type.** `content/validate.py` has an errors-only
            `ValidationResult`; the sync one adds `warnings`, `item_count`, `finalise()`
            and `ValidationMessage.to_dict()`, which the sync API and `QuestionBankSync`
            rows depend on. Adopt the richer shape in `content/` first, since everything
            else builds on it. Three conflicts had to be resolved: `is_valid` was a stored
            field on one side and a property on the other (now derived, so it cannot drift
            from the error list); `summary` was an attribute set by `finalise()` on one and
            a method on the other (now a method, so there is no stale state and `finalise()`
            is gone); and `bank_id`/`version` were required on the sync side but absent on
            the CI side (now optional, and their presence selects which summary style to
            print). `ValidationError` is kept as an alias of `ValidationMessage`.
      - [x] **Add the inventory model.** Thread an optional `image_inventory` through the
            content validator so it can check against a list of filenames instead of a
            directory. This is the enabling piece: without it the merged validator cannot
            validate anything in the bucket, which is most of what sync does. Confirmed
            *why* it exists while porting: `download_bank_from_gcs` fetches **only YAML**
            — images are deliberately left in the bucket, since downloading them just to
            check a filename would mean paying for the bytes twice. Question directories do
            exist on disk in that mode (they are created for the YAML), so directory
            scanning stays correct for structure; only the *file listing* comes from the
            inventory, via `_files_in`. Added `validate_module_dir` as the single-bank entry
            point sync will call.
      - [x] **Port the per-item checks** — `_validate_uniform_item` (54 lines),
            `_validate_variable_item` (149), `_get_image_files`, `_check_image_naming` and
            `_cross_item_checks`. The largest chunk, ~280 lines, and where the detailed
            question-level validation lives. The variable per-item pass *subsumes* the
            assessment-level image pass, so that one was removed rather than left to
            double-report a missing or undeclared file; the uniform pair is complementary
            (assessment level names *which* key is missing, item level checks the count)
            and both were kept. Question directories are now parsed once and the data
            reused, which is also what `_cross_item_checks` needs for `item_count`.
            **Finding: three of the ported fixtures were never valid content.** The
            `.variable-*` fixtures used plain-string options with no `question_type` or
            `correct_option_id`, a shape no real bank uses; `.valid-module` declared
            `images_per_item: 2` with no images present and `min_pool_size: 4` with one
            question. They passed only because the tooling validator never looked. All four
            are corrected to match real content. Several test helpers written in earlier
            units had the same problem and were fixed the same way — the validator was
            right, the scaffolding was wrong.
      - [x] **Port the config and email checks** — `_validate_config` (48 lines) and
            `_validate_email_section`/`_validate_email_sections` (45). Resolved a name
            collision on the way: both validators had a `REQUIRED_ASSESSMENT_FIELDS`
            meaning different things — the tooling one was the *top-level* required fields,
            the sync one the fields inside the nested `assessment:` block. They are now
            `REQUIRED_CONFIG_FIELDS` and `REQUIRED_ASSESSMENT_SECTION_FIELDS`. The email
            checks stay conditional: a bank must carry a template only for the emails it is
            configured to send.
            **Six of the seven fixtures were missing `description` and the whole
            `assessment:` block**, and three uniform ones lacked `options` — the same story
            as the last unit, and again fixed rather than worked around. Both real content
            repos already carry everything the ported checks require, verified before
            porting.
      - [x] **Collapse the callers.** `sync.py:191` and the two `run_tooling_validation`
            sites call one validator. `validate_question_bank` is gone entirely (594 lines)
            and `test_teaching_validate.py` was repointed rather than rewritten — which
            immediately earned its keep by catching three behaviours the earlier units had
            missed, because they lived inside `validate_question_bank` itself rather than in
            the helper functions the plan listed: the "config.yaml not found" wording, the
            stray file and directory warnings, and populating `bank_id`/`version` so the
            bank-style summary works.
            **Two entry points, not one, because only two of the four callers have a module
            directory.** `validate_assessment_dir` covers config, email, items, images and
            the certificate, and is what sync calls with its GCS inventory;
            `validate_module_metadata` covers `module.yaml` and learning content, and runs
            at the two sites that resolved a module directory. Together they cover
            everything exactly once — a single call could not, since sync reaches a bank
            through its `assessment/` directory and never sees the module above it.
- [x] Delete `backend/app/features/teaching/tooling_validate.py` and collapse its two call
      sites into the merged call. Its "tooling unavailable — sync blocked for safety" branch
      went with it: the validator now ships inside the backend package, so it cannot be
      missing and the fail-safe is satisfied by construction rather than at runtime.
- [x] Remove the cross-repo plumbing: the Dockerfile `COPY`/`ENV`,
      `TEACHING_TOOLING_SCRIPTS_PATH` in `config.py`, the `compose.dev.yml` env var and bind
      mount, and the checkout steps in `ci.yml` and `deploy.yml` — including a **third**
      checkout in the E2E image-build job that existed only to satisfy the Dockerfile
      `COPY`, and which the plan had not listed. Image rebuilt and verified: the backend
      starts with no `/teaching-tooling-scripts` present and the setting gone.

## Phase 3: Reusable workflow in Quill

- [x] Port `teaching-tooling/.github/workflows/pipeline.yml` to
      `.github/workflows/teaching-pipeline.yml`, keeping the job names `validate`,
      `check-protection`, `auto-pr` and `deploy` exactly as they are. Verified identical to
      the original set, so the rulesets need no edit.
- [x] Replace the tooling checkout in the `validate` job with the sparse checkout of Quill
      shown below. Only the `tooling` directory needs listing: cone mode also brings the
      files sitting directly in each parent directory, which is how `mdx_parser.py` and the
      `app/` `__init__` chain arrive. Simulated the whole job locally — the checkout yields
      37 Python files, and the CLI then runs to completion in a venv holding **only
      pydantic and pyyaml**, confirming the dependency-light constraint holds outside the
      backend container. Run from inside the content checkout so version lock can resolve
      the repository root; `--ref origin/main` makes the comparison explicit.
- [x] Strip validation from the `deploy` job — the tooling checkout, Python setup, pip
      install, Node setup, npm install, and both validate steps. `deploy` is now: checkout
      content, authenticate to GCP, sync to GCS, trigger backend sync. It executes no Quill
      code beyond the workflow file itself. **The sync status-code fix must land before
      Phase 4**, not before this port: the gap only opens when a content repo actually
      starts using this deploy job.
- [x] Fix the stale error message in `check-protection`, which pointed at
      `teaching-tooling/infra/main.tf`; it now points at `quillmedical/infra/github/`,
      where Phase 5 moves the rulesets.

```yaml
- uses: actions/checkout@v7.0.1
  with:
    repository: bailey-medics/quillmedical
    path: tooling
    sparse-checkout: |
      backend/app/features/teaching/tooling
      backend/app/features/teaching/mdx_parser.py
```

## Phase 4: Cut the content repos over

- [ ] Point `respiratory-teaching`'s `.github/workflows/teaching.yml` at
      `bailey-medics/quillmedical/.github/workflows/teaching-pipeline.yml@main`.
- [ ] Confirm a green pull-request run and a real deploy on that repo before continuing.
- [ ] Repeat for `eoeeta-teaching`.

## Phase 5: Terraform and decommissioning

- [ ] Move `teaching-tooling/infra/main.tf` (organisation-level rulesets for content repos)
      into Quill's `infra/github/`. No overlap today — Quill's state manages only the
      `quillmedical` repo — so this is additive to that state.
- [ ] Drop `teaching-tooling`'s own repo-level rulesets (rulesets 3 and 4 in that file).
- [ ] Delete the orphaned `teaching-repos/*/scripts/validate.py` copies.
- [ ] Delete `bailey-medics/teaching-tooling` — only after both content repos are cut over
      and have had a green pull request and a real deploy on the new workflow. A `uses:`
      pointing at a deleted repo fails instantly, so this is the last irreversible step.
- [ ] Remove every local reference in the same pass:
      - `.gitignore:26` — the `teaching-tooling/` entry
      - `Justfile:41,71-80` — the clone/pull block in `initial-install`, and its closing
        "tooling in ./teaching-tooling/" message
      - [x] `Justfile` — `validate-teaching` rewritten to run the merged CLI in
        `quill_backend`, matching how `just ub` works, rather than shelling into the
        `teaching-tooling` checkout with its own venv and npm install. Pulled forward from
        this phase because it is the command a developer actually reaches for, and it was
        silently running the *old* validators. Version lock is skipped locally: it compares
        a branch against `origin/main`, which is a pull-request concern
      - `.claude/skills/crp/SKILL.md:18` — drop the `tooling` repository mapping
      - `backend/app/features/teaching/storage.py:575` — a docstring still describing the
        layout as "the teaching-tooling module directory"
      - the local `teaching-tooling/` working-tree clone itself

## Phase 6: Make GCS mirror the repo layout

Do this before the sweep in Phase 7, so the sweep is built against the final layout and
never needs reconstruction code. One change: bucket and code move together.

Target layout in the bucket, identical to the repo:

```text
modules/<bank_id>/module.yaml
modules/<bank_id>/assessment/     # was questions/<bank_id>/
modules/<bank_id>/learning/       # was learning/<bank_id>/
```

- [ ] Change the writer: the ported `teaching-pipeline.yml` deploy job becomes a single
      `gsutil -m rsync -r -d "$module_dir/" "gs://$BUCKET/modules/$bank_id/"` per module,
      replacing three operations and the `assessment` to `questions` rename.
- [ ] Change the readers — the three prefixes in
      `backend/app/features/teaching/storage.py` (`questions/`, `learning/`, `modules/`,
      around sixteen call sites), the `certificate-blank.png` blob path at
      `backend/app/features/teaching/certificate.py:328`, and the dev-only static route at
      `backend/app/main.py:5551`. That route is registered only when
      `TEACHING_QUESTION_BANK_PATH` is set without a bucket, so it never exists in
      production and carries no API-compatibility consequence.
- [ ] Delete the reconstruction logic in `download_module_from_gcs`
      (`storage.py:614-643`). With the layouts identical it becomes a plain prefix
      download, which also removes the `app.config` import problem that would otherwise
      complicate the Phase 7 sweep.
- [ ] Migrate the bucket: `gsutil -m mv` each of the three old prefixes under
      `modules/<bank_id>/`, or re-run a content deploy against the new layout and delete
      the old prefixes once the new ones are serving.
- [ ] No Alembic migration. `QuestionBankItem.images` holds `{"key": filename}` only and
      image URLs are built per request, so nothing persisted contains a prefix. Confirm by
      grepping a synced database for `questions/` before deleting the old prefixes.
- [ ] Re-sync both banks, then open a learning module and an assessment and confirm images
      and the certificate background still resolve.

## Phase 7: Close the safety gaps that prompted this

- [x] Make `/api/ci/teaching/sync` return a non-2xx status when `errors` is non-empty, so
      `curl -sf` actually fails the content deploy. Land this together with the `deploy`
      trim in Phase 3 — once `deploy` no longer validates, this is the only thing that can
      turn a rejected bank into a red build.
- [x] Confirm the certificate block is validated at pull-request time, before anything
      reaches GCS. Confirmed by running the merge-gate validator over a module carrying a
      deliberately broken block: a font outside the allowed set, a coordinate above the
      permitted range, and a misspelled key are all rejected, along with the missing
      required text fields and the missing background image.
      - Note the gate is conditional, and rightly so: the block is only validated when
        `results.certificate_download` is true. A first attempt at this confirmation looked
        like a failure because the fixture did not enable it, and the block was ignored —
        correct behaviour, not a hole.
- [ ] Check that image files are actually images, by magic bytes. The validator only ever
      matches filenames and extensions — it never opens an image — so anything with the
      right name passes. A hand-committed empty file is far-fetched, but a **Git LFS
      pointer** is not: both content repos' `.gitattributes` declare
      `*.png filter=lfs`, and `actions/checkout` does not fetch LFS unless told to
      (`lfs: true` appears nowhere in `pipeline.yml`). A pointer is a ~132-byte text file
      carrying the right name and extension, so it would pass validation and be synced to
      GCS in place of the image. Candidates would then see a broken image in an assessment,
      where for a visual-diagnosis bank the image *is* the question. Note this is a **size
      check's blind spot** — a pointer is 132 bytes, not 0 — so test the PNG/JPEG magic
      bytes rather than `st_size`. No new dependency needed; Pillow reaches the backend only
      transitively via `reportlab`, and must not become a dependency of the `content`
      package, which stays pydantic + pyyaml only.
- [ ] Reconcile the LFS declaration. Right now `git lfs ls-files` reports **zero files** in
      both content repos despite `.gitattributes` declaring PNGs as LFS — the images are
      plain git blobs (`cover.png` is a 1.2 MB object in git). So nothing is broken today,
      but only by accident: the first person to install git-lfs and commit an image creates
      a pointer that CI will not fetch. Either add `lfs: true` to the content checkouts, or
      drop the misleading `.gitattributes` line. Pick one — leaving it as-is is the trap.
      - **Chosen: `lfs: true` on the content checkouts.** It is entirely a Quill change, so
        neither content repo needs editing; it costs nothing today because there are no LFS
        objects to fetch; and it is correct the moment anyone does commit through LFS.
        Dropping the `.gitattributes` line would instead commit a visual-diagnosis bank's
        images to plain git blobs permanently, which is the case LFS exists for.
      - Added to `validate` and `deploy` only. `auto-pr` never reads the content, and the
        workflow now says so, so the omission is not mistaken for an oversight.
      - Verified `git lfs ls-files` reports zero files in both content repos while both
        `.gitattributes` declare `*.png filter=lfs`, so the mismatch is real and this is
        pre-emptive rather than a fix to something already broken.
- [x] Skip content validation for modules whose `module.yaml` status is `retired`. They are
      frozen by `check_version_lock.py`, so they can never be brought into line with a
      stricter validator, and the deploy loop re-uploads every module regardless of status
      — without this, one retired bank makes every future deploy red and the Phase 6
      signal worthless.
      - The status is read on its own, tolerantly, before any other check: anything
        unreadable is treated as not retired, so a module that cannot be parsed is
        validated normally and reports its own error rather than skipping itself.
      - Both entry points needed it, not just the merge gate. Sync re-imports every module
        through `validate_module_metadata`, so a retired bank would have failed the sync
        instead of the deploy.
      - The skip is counted and printed (`skipped N retired`), mirroring
        `check_version_lock`. A module that vanishes from validation without a word is a
        module nobody remembers is unvalidated.
      - Version lock still applies: retired modules stay frozen, so the two checks are
        complementary — one refuses changes, the other stops re-validating what cannot
        change.
- [ ] Surface failed syncs rather than leaving them in `QuestionBankSync` rows. The data is
      already recorded and exposed at `GET /api/teaching/syncs`; the gap is that nothing
      draws attention to it. A red deploy from the item above covers the common case, so
      keep this small.
- [ ] **Re-validate live banks when the tooling changes, not only when content changes.**
      Today nothing does this: validation runs on a content pull request and on a content
      push to main, and a Quill-side tooling change triggers neither. Quill's `deploy.yml`
      does not call `/api/ci/teaching/sync`, no teaching workflow is scheduled, and startup
      only checks service availability — so after a tightening deploys, a live bank that
      current tooling would reject keeps being served until someone happens to push an
      unrelated content change to that repo. Add a validate-only sweep over all live banks
      to the end of Quill's backend deploy, reusing `sync_question_bank(validate_only=True)`
      (already supported, `sync.py:159`) and the existing `/admin/sync-all` plumbing, and
      report failures to Slack via `.github/workflows/slack-notify.yml`. Validate-only, not
      sync: it answers "which live banks would now fail?" without touching data.
- [ ] **Run the same sweep in Quill's pull-request CI**, so whoever changes the tooling
      sees which live banks they would break before merging rather than after deploying.
      Add a job to `ci.yml` (already triggered on `pull_request` to main), gated on paths
      that can change validation behaviour — `backend/app/features/teaching/tooling/**`,
      `backend/app/features/teaching/mdx_parser.py`,
      `.github/workflows/teaching-pipeline.yml`. Authenticate with
      `google-github-actions/auth` and `GCP_TEACHING_WIF_PROVIDER`, following the existing
      pull-request job in `terraform.yml:42`; the job needs `id-token: write`. Post the
      affected bank ids as a pull-request comment. Non-blocking to begin with — see the
      decision above — and no database is required, because `sync_question_bank` returns
      from `validate_only=True` (`sync.py:195`) before it touches `db`.
- [ ] No layout reconstruction is needed, provided Phase 6 has landed: bucket and repo
      share one shape, so the sweep downloads `modules/<bank_id>/` and runs the validator
      on it directly. If Phase 6 slips, the sweep must reshuffle the three old prefixes
      itself — but do not import `download_module_from_gcs` to do it, because `storage.py`
      imports `app.config`, whose `Settings` require `JWT_SECRET` and `CORE_DB_PASSWORD`.

### Learned while building

- **`download_module_from_gcs` writes zero-byte placeholder files for images**, so that
  existence checks pass without paying to download the bytes. That is what let the module
  path validate without an inventory. It also means the Phase 7 follow-up to check image
  *magic bytes* would break this path: every image there is legitimately empty. Whichever
  way that check is built, it must either run only where real bytes exist, or the
  placeholders must carry a real header.


- **Version lock reports rather than raises when there is no repository to compare
  against.** The ported code called `git rev-parse` for the repository root with
  `check=True` and
  then `Path.relative_to`, so a modules directory outside a git repository produced a
  traceback rather than a violation. That has two distinct failure shapes and *which one
  occurs depends on where the process was started*: from inside a checkout, `git rev-parse`
  succeeds and `relative_to` raises `ValueError`; with no repository at all, `git rev-parse`
  raises `CalledProcessError`. A test written against the second shape passed locally and
  broke CI on the first. Both now return the same violation, pointing at
  `--skip-version-lock`, and both are pinned by tests. Worth remembering when the
  pull-request sweep validates a tree downloaded from GCS — that is exactly this case.

## Phase 8: Per-organisation active version pointers

Not part of the consolidation — a design change that surfaced while reviewing what the
sync path actually does, added here at the maintainer's request.

**The asymmetry.** `QuestionBankOrgStatus.is_live` defaults to false, so a brand-new bank
merging to `main` syncs into the database and stays invisible to candidates until an admin
deliberately opens it. That human promotion step already exists. But `is_live` is per
*bank*, not per *version*, and the candidate-facing queries take
`order_by(version.desc()).first()` — so publishing **version N+1 of an already-live bank
reaches candidates the moment sync completes**, with no human step at all.

Standing up a new assessment needs sign-off; rewriting the questions inside a live one does
not. The second is arguably the higher-risk operation, because it changes an exam
candidates are already sitting. Two things soften it but neither closes it: in-flight
candidates are pinned by `Assessment.bank_version` and finish on the version they started,
and `check_version_lock` refuses any assessment change to a live module without an explicit
version bump — so publishing a revision is deliberate, just not *separately* deliberate
from merging.

**The change.** Each organisation gains a pointer to the version its candidates receive.
Sync imports new versions but never moves the pointer; a staff org admin advances it when
they are ready. That also gives a rollback, which does not exist today.

- [ ] **Model and migration.** Add `active_version: int | None` to
      `QuestionBankOrgStatus`. Nullable, so no `server_default` is needed. Backfill every
      existing row to the highest synced version for that organisation and bank, so no
      live bank changes behaviour on deploy. Created with `just migrate`, with a real
      `downgrade()`.
- [ ] **Sync sets it once and never again.** Creating a status row for a bank's first
      version sets the pointer to that version — harmless, since `is_live` still gates it.
      Syncing a later version must leave the pointer untouched: that is the whole point.
- [ ] **Candidate-facing queries follow the pointer**, not the highest version:
      `start_assessment` (`router.py:572`, the critical one), `get_question_bank`
      (`router.py:344`) and `list_question_banks` (`router.py:249`). A null pointer means
      the bank is not ready and serves nothing.
- [ ] **Admin views show both** — `list_admin_banks` (`router.py:1934`) and
      `get_admin_bank_detail` (`router.py:2181`) keep reporting the latest synced version,
      alongside the active one, so "version 3 active, version 4 available" is visible.
- [ ] **Promotion endpoint** for staff org admins, scoped to their own organisation.
      Validates that the target version exists for that bank, and records who moved it and
      when. Rolling back is the same operation pointing at an earlier version.
- [ ] **Admin UI** — surface the two version numbers and a promote control on the existing
      admin teaching page, which already carries the live/closed toggle.

## Follow-up: one Poetry version for the whole repository

**A separate pull request, not part of this branch.** It touches the production image
build and every CI job, so a failure there should not be tangled up with the teaching
consolidation. Sequence: land this branch, then this, then resume at Phase 4.

The teaching pipeline surfaced the problem but does not cause it. Poetry is currently
pinned in one place and left floating everywhere else:

- `backend/Dockerfile` pins `POETRY_VERSION=2.1.3`
- `.github/actions/setup-python`, `gate-breaking.yml` and the teaching pipeline all run
  `pip install -U pip poetry`, which resolves to 2.4.2 at the time of writing
- Developer hosts run whatever each machine happens to have

So the container that builds the production image runs a different Poetry from the one CI
runs. This already cost us once during Phase 3: adding a dependency group to
`backend/pyproject.toml` relocked with 2.1.3 against a lock generated by 2.3.3 and
produced fifteen lines of pure formatting churn, which is why the tooling package ended up
with its own `pyproject.toml` instead.

### What is actually at risk

Worth separating, because it determines the design:

- **Relocking is version-sensitive.** A different Poetry writes a differently formatted
  lock. This is the real hazard, and the one already encountered.
- **Installing from an existing lock is not.** Verified during Phase 3: Poetry 2.1.3 and
  2.4.2 install identical versions from the same lock file.

The dangerous path is therefore a developer relocking on their host, which no CI-side pin
can reach.

### The change

- [x] Add `.poetry-version` at the repository root, mirroring the existing
      `.python-version`. No Docker build argument is needed — the Dockerfile `COPY`s the
      file and reads it in the `RUN` that installs Poetry.
- [x] Read it from all four install sites: `backend/Dockerfile`,
      `.github/actions/setup-python`, `gate-breaking.yml` and the teaching pipeline. The
      teaching pipeline needed no extra sparse-checkout path — it already reads the root
      `.python-version` through cone mode, which is what proved root files arrive.
- [x] Add `requires-poetry` to `backend/pyproject.toml` and align the tooling package's
      to match. This is the half that catches host drift, because Poetry enforces it
      wherever it runs — including a laptop, where a repository file can install nothing.
- [x] Pin to 2.4.2 rather than the Dockerfile's old 2.1.3. Verified first that the newest
      Poetry accepts the 2.3.3-generated `backend/poetry.lock` and that relocking with it
      leaves the file byte-identical, so aligning forward costs no churn.
- [x] Extend `check-version-consistency.sh`, which already guards Python and Node the same
      way, rather than adding a backend test. A backend test cannot see a root-level file:
      the container mounts only `backend/` at `/app`. The script also fails if any file
      hardcodes `poetry==<version>` instead of reading the pin, so a future bump cannot be
      half-applied. Refactored to `main()` with a source guard and given bats coverage,
      which closes part of the scripts to-do.
- [x] Pin Renovate's Poetry too, via `constraints.poetry` in `renovate.json`. The bot runs
      in its own container and cannot read `.poetry-version`, so it relocked with 2.3.3
      against a 2.4.2 pin on the very next dependency PR. That value is a second copy of
      the version, so `check-version-consistency.sh` asserts it matches. Note this one is
      only provable on the next scheduled run: nothing local can exercise the hosted bot.
- [ ] Confirm CI is green before merging, since every Python job changes how it installs
      Poetry.

Either piece alone is half a fix: `.poetry-version` selects a version, `requires-poetry`
rejects the wrong one.

**Everyone must rebuild their backend container after this lands.** An existing image has
Poetry 2.1.3, which the new constraint refuses; `poetry` commands inside it will fail until
the image is rebuilt. Running tests is unaffected, since pytest does not go through Poetry.

## Verification

- [ ] `just ub` stays green, including the ported tooling tests, the new import-boundary
      test, and `test_clinical_services.py` after the `requires_feature` move.
- [ ] `pre-commit run --all-files` passes. Confirm the new package clears `mypy --strict`
      through the hook, whose `additional_dependencies` are only
      `[alembic, types-requests, types-pyyaml, types-Markdown]`; add `pydantic` if
      resolution fails.
- [ ] Update the `validate-teaching` recipe (`Justfile:242-266`) to call the new CLI, then
      run it over both checked-out content repos. It must pass on current content —
      that is what proves the port is behaviour-preserving.
- [ ] Add a deliberately malformed `certificate:` block to a scratch copy of a module — an
      unsupported font, `y: 1.5`, `margin: yes`, and an unrecognised key from a misspelled
      colour — and confirm the CLI rejects each with a clear message. `margin: yes` is the
      subtle one: `bool` subclasses `int` in Python, so without the boolean guard it
      validates as `1`.
- [ ] Run the MDX validating mode over both content repos' `learning/content.mdx` and
      confirm it passes, then confirm it *fails* on a deliberately malformed `<Figure>` tag
      — the case the current parser drops in silence.
- [ ] Open a draft pull request on `respiratory-teaching` pointed at the new workflow.
      Confirm the checks report as `pipeline / validate` and `pipeline / check-protection`,
      satisfying the existing ruleset unchanged, then confirm a merge deploys to GCS and
      syncs the backend.
- [ ] Prove both gates independently. Push a malformed `certificate:` block and confirm the
      pull-request check fails. Then upload the same malformed content straight to GCS,
      bypassing CI, call `/api/ci/teaching/sync`, and confirm sync rejects it and the bank
      does not go live — this is the layer that would otherwise be lost with
      `tooling_validate.py`.
- [ ] `scripts/run-github-actions-locally.sh` before pushing.

## Risks

- **A Quill change can break content CI with no signal to Quill.** Accepted for the
  `validate` job — that is the whole point, and it fails loudly on a content pull request.
  Once `deploy` stops running the validator it executes no Quill code but the workflow file,
  so the exposure there is limited to the YAML itself; still treat any edit to that job as
  needing a real end-to-end run on `respiratory-teaching`. Keep the ported golden fixtures
  (`teaching-tooling/tests/fixtures/`) running in `just ub` so validator regressions fail in
  Quill's own CI before they reach content.
- **Removing the `deploy` re-validation leans harder on the sync gate.** With two gates
  rather than three, Phase 6 stops being a tidy-up and becomes load-bearing: while
  `/api/ci/teaching/sync` still returns 200 with its errors in the body, the last line of
  defence cannot fail a deploy. Do Phase 6 in the same change as the `deploy` trim, not
  after it.
- **Cut-over window.** Phases 1 to 3 are additive and `teaching-tooling` keeps working
  until Phase 4 flips each repo, so the migration is reversible by reverting a single line
  per content repo.
- **Ported validator drift.** The third verification item is the guard: the new CLI must
  pass on current content before any repo is cut over.
- **Terraform state.** Both configurations use local state and manual apply. Take a state
  backup before merging the organisation rulesets in.

## Related

- `docs/docs/backend/api-compatibility.md` — the expand-contract pattern this plan's
  versioning advice mirrors
- [Version Locking Teaching](2026-05-27-version-lock-teaching-plan.md) — introduced
  `check_version_lock.py`, one of the scripts being moved
- [Teaching Separation of Concerns](2026-05-29-teaching-separation-of-concerns-plan.md)
