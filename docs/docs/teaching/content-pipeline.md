# Teaching content pipeline

Teaching content does not live in this repository. Each organisation's
question banks and learning modules sit in a content repository of their own
(`eoeeta-teaching`, `respiratory-teaching`), and reach learners through a
pipeline that is defined here and called from there.

This page follows one change from a content author's branch to a learner's
screen, then the reverse direction, then what it takes to add a content
repository. No single file shows the whole path, because it crosses
repositories.

It was written from `.github/workflows/teaching-pipeline.yml`,
`.github/scripts/teaching-pipeline/`, `.github/scripts/ci/`,
`infra/github/teaching_rulesets.tf`, `infra/main.tf`,
`backend/app/main.py` and `backend/app/features/teaching/`. The application
side, the format of a bank and the sync steps, is in
[Teaching feature](index.md).

## The shape of it

```text
content repo                          quillmedical                    Google Cloud
------------                          ------------                    ------------
feature branch  ──push──▶  teaching-pipeline.yml: auto-pr
pull request    ──────────▶  validate + check-protection
merge to main   ──────────▶  deploy ──────────────────────────────▶  images bucket
                                  └── POST /api/ci/teaching/sync ──▶  backend imports
```

A content repository holds one thin workflow that calls
`bailey-medics/quillmedical/.github/workflows/teaching-pipeline.yml` with its
`org_id`. Everything else, the validator, the scripts and the rules, is in
this repository. The pipeline picks its job from the event that triggered it.

## From a branch to a learner

1. **A push to `feature/**`** runs `auto-pr`, which opens a draft pull
   request with Quill's own `auto-pr/create-pr.sh`.

2. **A pull request** runs two jobs, and both are required before a merge:

    - `validate` checks out the content, then a sparse checkout of the
      validator from `backend/app/features/teaching/tooling/`, and runs it
      over `modules/`. It also runs the version lock, described below.
    - `check-protection` fails if the content repository has no rulesets. It
      catches a repository that was set up without being added to the
      Terraform.

3. **A merge to `main`** runs `deploy`:

    - `sync-to-gcs.sh` mirrors each module whole to
      `modules/<bank_id>/` in the images bucket, with `rsync --delete`, so
      the bucket has the repository's shape and a file removed from the
      repository is removed from the bucket.
    - It then calls `POST /api/ci/teaching/sync` on the backend, with a
      bearer token.

4. **The backend imports.** The endpoint checks the token against
   `TEACHING_SYNC_TOKEN`, lists the banks in the bucket and runs
   `sync_question_bank` for each, which validates again before importing.
   If any bank is rejected the endpoint returns 422 with the rejected banks
   named, so the deploy fails instead of reporting success.

5. **Learners get the newest version.** At the end of every sync
   `_serve_newest_version` points each organisation at the newest version
   of every bank it has switched on. A candidate part way through an
   attempt keeps the version they started on. A bank not yet switched on
   for an organisation stays off: opening a bank is a separate act.

6. **A failed deploy posts to Slack**, quoting the backend's response so the
   message names the bank that was rejected.

## Where validation runs, and why twice

The same validator runs at two gates, so the two cannot disagree. The
reasons are recorded in the
[consolidation plan](../plans/2026-08-30-consolidate-teaching-tooling-plan.md).

- **On the pull request.** The only place an author gets feedback before a
  merge, and the only gate that can stop bad content existing at all.
- **At sync.** The last line before a bank is served, and the only gate that
  sees what is actually in the bucket: it still catches a bucket written to
  directly, a partial upload, or content that predates a tightening of the
  rules.

The `deploy` job deliberately does not validate a third time. The content
ruleset is active with no bypass actors and strict required checks, so the
tree that reaches `main` is byte for byte the one `validate` passed.

### The version lock

`check_version_lock.py` compares the branch with `origin/main` and applies a
rule by the module's status on `main`:

- **draft** - the version stays at 1
- **live** - a change to the assessment needs the version raised by one
- **retired** - no change is allowed

### The pull request is the gate

Since 27 September 2026 sync always serves the newest version, so a merged
revision reaches learners at the next sync with nobody promoting it. The
review on the content repository's pull request is therefore the only human
gate. The plan records the decision under "Follow-up: always serve the newest
version".

## The other direction: when the validator changes

Content is validated when a content repository changes. Left at that, a
stricter validator could ship from this repository and a published bank that
no longer passes would keep being served. Two jobs in `ci.yml` close that
gap:

- `changed_teaching_tooling` runs `detect-teaching-tooling-changes.sh`,
  which hashes the validator package and `mdx_parser.py` at the branch and
  at its base. It compares content, not which paths were touched, so a
  revert answers "unchanged".
- `teaching_content_sweep` runs only when that hash moved. It downloads the
  published modules from the images bucket, runs the branch's validator over
  them with `sweep-live-banks.sh`, and posts the banks that would now fail
  as a comment on the pull request. It reads only: nothing is synced or
  written back.

The sweep is advisory. It is marked `continue-on-error`, so it reports and
does not block the merge.

## Rules nothing enforces

- **Do not rename the pipeline's jobs.** The content rulesets require checks
  called `pipeline / validate` and `pipeline / check-protection`. Those
  names are the caller's job name joined to the job names in
  `teaching-pipeline.yml`. Rename either and a pull request waits for a
  check that never reports. The caller's job must therefore be named
  `pipeline`.
- **Content repositories track `@main`.** A change to the pipeline or the
  validator on `main` here takes effect on the next content pull request,
  with no version to bump. The plan's reason: a bank that fails a stricter
  validator needs fixing, and the failure lands on a pull request where it
  can be acted on.
- **A repository that declares Git LFS must really use it.** `validate` and
  `deploy` check out with LFS on, so that real images are validated and
  uploaded, not pointers. A repository whose `.gitattributes` claims LFS
  while storing plain files makes every image look modified.

## Adding a content repository

No file lists these together.

1. **Name it `<something>-teaching`.** `just initial-install` clones every
   repository in the organisation whose name ends that way.

2. **Add it to the rulesets.** Append it to `teaching_repos` in
   `infra/github/teaching_rulesets.tf`, then apply with
   `just terraform-github`, which a person runs by hand. The repositories
   are listed by name because wildcards are unreliable in an organisation
   ruleset. Until this is done, `check-protection` fails every pull request
   in the new repository.

3. **Add the caller workflow** to the new repository: one job named
   `pipeline` that calls `teaching-pipeline.yml@main` with `org_id` and
   passes its secrets through.

4. **Let it sign in to Google Cloud.** The pipeline authenticates as the
   `content-sync` service account, which holds one role, on the images
   bucket, granted in `infra/modules/cloud-storage/main.tf`. Two things let
   a repository act as that account, and neither is in Terraform: the
   Workload Identity provider's condition has to name the repository, and
   the account needs an impersonation binding for it. The commands used for
   the first two repositories are in Batch 8 of the
   [environment isolation plan](../plans/2026-09-18-environment-isolation-and-iap-plan.md).

5. **Set the secrets on the new repository.** `teaching-pipeline.yml` reads
   five:

    - `GCP_WORKLOAD_IDENTITY_PROVIDER`
    - `GCP_SERVICE_ACCOUNT`
    - `GCP_TEACHING_GCS_BUCKET`
    - `BACKEND_SYNC_URL`
    - `BACKEND_SYNC_TOKEN`, the same value as the backend's
      `teaching-sync-token` secret

    The failure notice also needs `SLACK_WEBHOOK_URL`.

6. **Switch the bank on.** A first sync imports the bank. An admin still has
   to open it for an organisation before learners see it.

## One thing to know about the sync endpoint

`POST /api/ci/teaching/sync` imports every bank into one org unit: the one
an existing bank is already held by, or, with none yet, the first
organisation in the system. The pipeline's `org_id` input is not sent to it.
Why it was built that way is not recorded in the code or the plans read for
this page.
