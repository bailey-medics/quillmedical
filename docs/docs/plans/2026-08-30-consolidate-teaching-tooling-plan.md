# Consolidate teaching-tooling plan

While hardening certificate config parsing (`backend/app/features/teaching/certificate.py`
was converted from hand-rolled `dataclass` definitions to validated Pydantic models), a
question came up that the refactor could not answer on its own: are the `*-teaching`
content repos tested in CI so that no malformed certificate config can be accepted?

They are not. The `certificate:` block schema exists in **three divergent copies**, and
the one the merge gate actually runs is the copy that does not check it:

| Copy | Has certificate checks? | Runs in CI? |
| --- | --- | --- |
| `backend/app/features/teaching/validate.py` | Yes | Only at sync — after merge, after GCS publish |
| `teaching-repos/*/scripts/validate.py` | Yes | **Never** — orphaned since `1b3b90f` |
| `teaching-tooling/scripts/validate.py` | **No** | Yes — this *is* the PR merge gate |

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

| Decision | Rationale |
| --- | --- |
| Consolidate into Quill rather than version the split | The split's only benefit — light content CI — is achievable with `sparse-checkout`. Its costs are real and already biting: three schema copies, ~120 lines of untyped `importlib` plumbing, and a weaker quality gate on the shared contract than on the code consuming it. |
| Place the package at `backend/app/features/teaching/content/` | The content contract belongs with the teaching feature, next to `certificate.py`, `sync.py` and `storage.py`, rather than in a second top-level location. One thing blocks it today: `app/features/__init__.py` defines `requires_feature`, so importing anything under `features/` drags in FastAPI, SQLAlchemy, `app.models`, `app.db` and `app.config` — and `Settings` requires `JWT_SECRET` and `CORE_DB_PASSWORD`, which a YAML validator has no business needing. Relocating that one function (3 import sites) leaves every `__init__.py` in the chain a docstring and makes the natural location viable. |
| Keep `parse_certificate_style` and `_validate_with_recovery` in `certificate.py` | The two consumers want opposite failure behaviour. The validator must raise and report every problem; the renderer must drop the offending key and fall back to a default so a certificate download never returns a 500. Shared schema, separate policy. |
| Preserve the job names `validate` and `check-protection` | Content-repo rulesets require status checks named `pipeline / validate` and `pipeline / check-protection` (`teaching-tooling/infra/main.tf:73-83`). Those names are composed from the caller's job name and the called workflow's job names, so preserving both means no ruleset edit — removing the riskiest part of the migration. |
| Track `@main` rather than pinning content repos to a tag | Tooling changes are improvements, so content should roll forward with them: a bank that fails a stricter validator is a bank that needs fixing, and that failure lands loudly on a pull request where it can be acted on. Quill's higher commit rate is not relevant here — `uses:` resolves one workflow file, and the checkout pulls only the teaching content package and `scripts/teaching/`, so the rate of *content-affecting* change stays what it is today (~32/yr). A pin would also introduce a worse, quieter failure: a forgotten tag bump leaves content repos silently running stale tooling. Revisit if content authoring is ever delegated to people who cannot fix the tooling themselves. |
| Convert `scripts/teaching/` to Yarn 4 | `CLAUDE.md` says "Yarn 4, never use npm" and nothing technically prevents it here: Yarn 4 is provisioned by Corepack from a `packageManager` field, which works per-directory. The content CI job needs two extra lines (`corepack enable && corepack install`) in place of npm's built-in setup. Converting keeps the rule absolute rather than carving out an exception. |
| Archive `teaching-tooling` rather than delete it | Historical workflow runs reference the repository. |

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

scripts/teaching/                    # NEW — isolated Node MDX validator
├── validate_mdx.js
├── package.json                     # packageManager: yarn@4.14.0
├── .yarnrc.yml
├── yarn.lock
└── requirements.txt                 # pyyaml + pydantic, for the content CI job

.github/workflows/teaching-pipeline.yml   # NEW — reusable, ported from tooling
```

**Hard constraint:** `features/teaching/content/` must never import `app.models`,
`app.db`, `app.config`, FastAPI, or anything from its own parent package. The import chain
above it (`app`, `app.features`, `app.features.teaching`) must stay docstring-only, so the
package remains runnable with just `pydantic` and `pyyaml` and needs no environment
variables.

## Phase 1: Move the tooling into Quill

Additive — `teaching-tooling` keeps working untouched throughout this phase.

- [ ] Move `requires_feature` from `backend/app/features/__init__.py` into a new
      `backend/app/features/gating.py`, leaving `__init__.py` as a docstring. Update the
      three import sites (`features/teaching/router.py:23` and two inside
      `backend/tests/test_clinical_services.py`). This is what makes the target location
      importable without the FastAPI/SQLAlchemy stack, and it removes an executable
      FastAPI dependency from a package `__init__.py`, which is worth doing regardless.
- [ ] Port `teaching-tooling/scripts/validate.py` and `check_version_lock.py` into
      `backend/app/features/teaching/content/`, splitting the Pydantic models into
      `module_schema.py`. Both already import only the standard library, `yaml` and
      `pydantic`, so nothing needs restructuring to move.
- [ ] Bring across the 937 lines of tests from `teaching-tooling/tests/` (including
      `fixtures/`) as `backend/tests/test_teaching_content*.py`.
- [ ] Port `validate_mdx.js` into `scripts/teaching/`, converting it from npm to Yarn 4:
      add `"packageManager": "yarn@4.14.0"` to its `package.json`, a `.yarnrc.yml` with
      `nodeLinker: node-modules` (matching `frontend/.yarnrc.yml`), and a `yarn.lock`.
      Drop `package-lock.json`.
- [ ] Add `cli.py` so CI can run
      `python -m app.features.teaching.content.cli <modules_dir>` from `backend/`.
- [ ] Convert the ported code to Quill's typed style — `Literal` types, bounded `Field`
      constraints, no `Any` — matching what `certificate.py` now does.
- [ ] Add a unit test asserting that importing `app.features.teaching.content` leaves
      `fastapi`, `sqlalchemy`, `app.models`, `app.db` and `app.config` absent from
      `sys.modules` — this is the guard that keeps the location viable.

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
- [ ] Update `sync.py` to import the merged validator.
- [ ] Delete `backend/app/features/teaching/tooling_validate.py` and convert its two call
      sites (`backend/app/main.py:5469`, `backend/app/features/teaching/router.py:2004`) to
      plain imports.
- [ ] Remove the cross-repo plumbing: `COPY`/`ENV` at `backend/Dockerfile:67-69`,
      `TEACHING_TOOLING_SCRIPTS_PATH` at `backend/app/config.py:196`, the env var and bind
      mount at `compose.dev.yml:13` and `:30`, and the checkout steps at
      `.github/workflows/ci.yml:84-89` and `.github/workflows/deploy.yml:88-93`.

## Phase 3: Reusable workflow in Quill

- [ ] Port `teaching-tooling/.github/workflows/pipeline.yml` to
      `.github/workflows/teaching-pipeline.yml`, keeping the job names `validate`,
      `check-protection`, `auto-pr` and `deploy` exactly as they are.
- [ ] Replace the tooling checkout with the sparse checkout of Quill shown below.
- [ ] Fix the stale error message in `check-protection`, which still points at
      `teaching-tooling/infra/main.tf`.

```yaml
- uses: actions/checkout@v7.0.1
  with:
    repository: bailey-medics/quillmedical
    path: tooling
    sparse-checkout: |
      backend/app/features/teaching/content
      scripts/teaching
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
- [ ] Archive `bailey-medics/teaching-tooling`.

## Phase 6: Close the safety gaps that prompted this

- [ ] Make `/api/ci/teaching/sync` return a non-2xx status when `errors` is non-empty, so
      `curl -sf` actually fails the content deploy.
- [ ] Confirm the certificate block is validated at pull-request time, before anything
      reaches GCS.

## Verification

- [ ] `just ub` stays green, including the ported tooling tests, the new import-boundary
      test, and `test_clinical_services.py` after the `requires_feature` move.
- [ ] `pre-commit run --all-files` passes. Confirm the new package clears `mypy --strict`
      through the hook, whose `additional_dependencies` are only
      `[alembic, types-requests, types-pyyaml, types-Markdown]`; add `pydantic` if
      resolution fails.
- [ ] Update the `validate-teaching` recipe (`Justfile:242-266`) to call the new CLI, then
      run it over both checked-out content repos. It must pass on current content — this is
      what proves the port is behaviour-preserving.
- [ ] Add a deliberately malformed `certificate:` block to a scratch copy of a module — an
      unsupported font, `y: 1.5`, `margin: yes`, and an unrecognised key from a misspelled
      colour — and confirm the CLI rejects each with a clear message. `margin: yes` is the
      subtle one: `bool` subclasses `int` in Python, so without the boolean guard it
      validates as `1`.
- [ ] `yarn install --immutable` then `node scripts/teaching/validate_mdx.js <modules>`
      against real content.
- [ ] Open a draft pull request on `respiratory-teaching` pointed at the new workflow.
      Confirm the checks report as `pipeline / validate` and `pipeline / check-protection`,
      satisfying the existing ruleset unchanged, then confirm a merge deploys to GCS and
      syncs the backend.
- [ ] `scripts/run-github-actions-locally.sh` before pushing.

## Risks

- **A Quill change can break content CI with no signal to Quill.** This is accepted for
  the `validate` job — that is the whole point, and it fails loudly on a content pull
  request. It is *not* acceptable for the `deploy` job, which syncs content to GCS and triggers
  the backend sync: breaking that is not a content-quality problem and would surface only
  when a content deploy silently stops working. Keep the ported golden fixtures
  (`teaching-tooling/tests/fixtures/`) running in `just ub` so validator regressions fail
  in Quill's own CI, and treat any edit to the `deploy` job as needing a real end-to-end
  run on `respiratory-teaching` before it is relied on.
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
