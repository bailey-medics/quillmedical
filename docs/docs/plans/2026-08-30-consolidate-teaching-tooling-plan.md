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

- **Place the package at `backend/app/features/teaching/content/`** — The content
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
  after
  consolidation, when writer and readers are finally in one repo, and before building the
  sweep so the sweep is written against the final layout. No database migration —
  `QuestionBankItem.images` stores only `{"key": filename}`, and URLs are built per request
  by `storage.get_image_url` (`router.py:169`).

- **Delete `teaching-tooling` once both content repos are cut over** — Quill is not live
  yet, so there is no production history worth preserving and nothing to point a future
  investigation at. Delete rather than archive, and remove the local clone and every
  reference to it in the same pass, so nothing is left half-migrated. Ordering matters:
  a `uses:` reference to a deleted repo fails immediately, so both content repos must be
  cut over and green first.

## Target layout

```text
backend/app/features/gating.py       # MOVED — requires_feature, out of features/__init__.py

backend/app/features/teaching/content/   # NEW — pure Python, no app.* imports
├── __init__.py
├── certificate_schema.py            # moved out of ../certificate.py
├── module_schema.py                 # ModuleYaml and friends, from tooling validate.py
├── validate.py                      # merged validator (module + assessment + certificate)
├── check_version_lock.py            # moved from tooling
└── cli.py                           # argv entry point for CI

.github/workflows/teaching-pipeline.yml   # NEW — reusable, ported from tooling
```

**Hard constraint:** `features/teaching/content/` must never import `app.models`,
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
      `backend/app/features/teaching/content/`, splitting the Pydantic models into
      `module_schema.py`. Both already import only the standard library, `yaml` and
      `pydantic`, so nothing needs restructuring to move.
      - [x] `check_version_lock.py` — ported with `ModuleStatus` as a `Literal`, YAML
            narrowed through `dict[str, object]` rather than `Any`, and a boolean guard on
            `version` so a YAML `version: yes` no longer reads as `1`.
      - [ ] `validate.py` and `module_schema.py`.
- [ ] Bring across the 937 lines of tests from `teaching-tooling/tests/` (including
      `fixtures/`) as `backend/tests/test_teaching_content*.py`.
      - [x] The 616 version-lock lines, as `test_teaching_content_version_lock.py` and
            `..._integration.py`. The integration ones build real repositories and shell
            out to git, which the backend image lacked — `git` is now installed in the
            **dev** stage only (CI already has it on the runner), with a `skipif` guard so
            a missing binary skips rather than errors.
      - [ ] `test_validate.py` and the `fixtures/` tree.
- [ ] Do not port `validate_mdx.js` — MDX validation moves to `mdx_parser.py` in Phase 2,
      so no Node project, lockfile or Corepack step is needed. The content CI job installs
      two pinned dependencies inline (`pip install "pydantic>=2" "pyyaml>=6"`) rather than
      carrying a requirements file.
- [ ] Add `cli.py` so CI can run
      `python -m app.features.teaching.content.cli <modules_dir>` from `backend/`.
- [ ] Convert the ported code to Quill's typed style — `Literal` types, bounded `Field`
      constraints, no `Any` — matching what `certificate.py` now does.
- [x] Add a unit test asserting the import boundary holds — done as
      `backend/tests/test_features_import_boundary.py`, covering `app.features` and
      `app.features.teaching`. It runs the import in a subprocess with `JWT_SECRET` and
      `CORE_DB_PASSWORD` deliberately absent, so a regression fails loudly instead of
      passing on the test runner's own environment. Extend the parametrised list to
      `app.features.teaching.content` when that package lands.

## Phase 2: Merge the duplicate validators onto one schema

- [ ] Move `TextFieldStyle`, `CertificateStyle`, `CertificateFont`, `Orientation` and the
      boolean-rejecting `Number`/`Whole` annotated types from
      `backend/app/features/teaching/certificate.py` into
      `content/certificate_schema.py`; import them back into `certificate.py`.
- [ ] Fold the certificate checks at `backend/app/features/teaching/validate.py:163` into
      the merged validator, driving them off `CertificateStyle.model_validate` rather than
      hand-rolled conditionals.
- [ ] Close the coverage gaps found during review: `exam_ref` and `margin` are not
      validated at all today, and unknown keys are not rejected, so a misspelled colour key
      silently does nothing.
- [ ] Give `backend/app/features/teaching/mdx_parser.py` a validating mode: at least one
      slide, recognised components only (`Callout`, `YouTube`, `Figure`, `Video`),
      well-formed props, and an error for any component-shaped tag it would otherwise drop
      silently. It has zero `raise`/`except` today, so malformed content is discarded
      without a word. Use the assertions in `validate_mdx.js` as the specification, then
      delete that file.
- [ ] Call that validating mode from the merged validator, so learning content is checked
      at both gates by the same code that renders it.
- [ ] Point `sync.py` at the merged validator so that sync runs the _same_ checks as CI —
      module metadata, assessment structure, images and the certificate block — replacing
      today's split between `run_tooling_validation` and `validate_question_bank`.
- [ ] Delete `backend/app/features/teaching/tooling_validate.py` and collapse its two call
      sites (`backend/app/main.py:5488`, `backend/app/features/teaching/router.py:2050`)
      into the single merged call. Its "tooling unavailable — sync blocked for safety"
      branch can go with it: once the validator ships inside the backend package, it cannot
      be missing, so the fail-safe is satisfied by construction rather than at runtime.
- [ ] Remove the cross-repo plumbing: `COPY`/`ENV` at `backend/Dockerfile:67-69`,
      `TEACHING_TOOLING_SCRIPTS_PATH` at `backend/app/config.py:196`, the env var and bind
      mount at `compose.dev.yml:13` and `:30`, and the checkout steps at
      `.github/workflows/ci.yml:84-89` and `.github/workflows/deploy.yml:88-93`.

## Phase 3: Reusable workflow in Quill

- [ ] Port `teaching-tooling/.github/workflows/pipeline.yml` to
      `.github/workflows/teaching-pipeline.yml`, keeping the job names `validate`,
      `check-protection`, `auto-pr` and `deploy` exactly as they are.
- [ ] Replace the tooling checkout in the `validate` job with the sparse checkout of Quill
      shown below.
- [ ] Strip validation from the `deploy` job — the tooling checkout, Python setup, pip
      install, Node setup, npm install, and both validate steps. `deploy` becomes:
      checkout content, authenticate to GCP, sync to GCS, trigger backend sync. Beyond
      shortening it, this means `deploy` no longer executes any Quill code except the
      workflow file itself, which shrinks what a Quill change can break there.
- [ ] Fix the stale error message in `check-protection`, which still points at
      `teaching-tooling/infra/main.tf`.

```yaml
- uses: actions/checkout@v7.0.1
  with:
    repository: bailey-medics/quillmedical
    path: tooling
    sparse-checkout: |
      backend/app/features/teaching/content
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
      - `Justfile:243-252` — rewrite `validate-teaching` to call the new CLI directly
        instead of shelling into the `teaching-tooling` checkout
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

- [ ] Make `/api/ci/teaching/sync` return a non-2xx status when `errors` is non-empty, so
      `curl -sf` actually fails the content deploy. Land this together with the `deploy`
      trim in Phase 3 — once `deploy` no longer validates, this is the only thing that can
      turn a rejected bank into a red build.
- [ ] Confirm the certificate block is validated at pull-request time, before anything
      reaches GCS.
- [ ] Skip content validation for modules whose `module.yaml` status is `retired`. They are
      frozen by `check_version_lock.py`, so they can never be brought into line with a
      stricter validator, and the deploy loop re-uploads every module regardless of status
      — without this, one retired bank makes every future deploy red and the Phase 6
      signal worthless.
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
      that can change validation behaviour — `backend/app/features/teaching/content/**`,
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
