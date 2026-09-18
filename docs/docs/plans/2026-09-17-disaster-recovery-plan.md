# Disaster recovery plan

Quill can rebuild its infrastructure but cannot yet restore its data.

Terraform recreates every environment from nothing, and the procedure has
been run for real — production was hibernated by `terraform destroy` and the
restore steps in [GCP infrastructure](../infrastructure/gcp.md) were written
from that exercise. What follows the rebuild is undefined. The runbook ends
on the sentence "a data restore from backups would be needed if any data
existed previously", and no document anywhere says how to perform one.

Three things are therefore true at once: backups exist, nobody has ever
restored one, and the retention actually configured is about thirty days
against a stated policy of ten years.

The intended outcome is a written, rehearsed restore procedure covering every
store that holds state, with backup settings that match what has been claimed
in writing, and the live teaching environment protected at least as well as
the empty hibernated one.

## Why this matters now

**Not because of patient data.** There is none, FHIR and EHRbase are not in
live use, and by the time they are the answer needs to already exist rather
than be commissioned.

The live teaching deployment is the immediate concern. It holds lecture
content, video, images and user accounts representing real authored work, and
it is the environment with the *weakest* backup configuration of the three —
because `pitr_enabled` is set from `var.environment == "prod"`, and teaching
is not prod. The environment that is hibernated and empty is the one
configured most carefully.

The clinician passport raises the stakes. A passport records competencies
signed off by other clinicians, which is a professional record about a real
person that no amount of re-authoring can reconstruct. Losing a lecture
costs an evening. Losing a sign-off means asking an assessor to re-attest to
something they observed months ago, which they may reasonably decline.

Roughly a thousand users are expected initially, growing.

## What exists today

### Cloud SQL

Configured in `infra/main.tf` at the three `cloud-sql` module calls, all
three identical:

```hcl
backup_retained_count = var.environment == "prod" ? 30 : 7
pitr_enabled          = var.environment == "prod"
pitr_days             = var.environment == "prod" ? 7 : 3
```

In practice:

- **Production** — 30 daily backups, PITR on, 7 days of transaction logs.
  Currently hibernated and holding no data.

- **Staging** — 7 daily backups, no PITR. Also removed for cost.

- **Teaching** — 7 daily backups, no PITR. This is the live one.

`retention_unit` is `COUNT`, not days. Thirty retained backups means thirty
days only while backups succeed daily; a run of failures silently lengthens
the window each backup covers rather than shortening the history. Nothing
currently alerts on a failed backup.

**`deletion_protection` is also gated on prod** — `infra/modules/cloud-sql/main.tf`
line 10 sets it from `var.environment == "prod"`. The live teaching database
can therefore be destroyed by a `terraform destroy` or an errant apply
without GCP objecting, and with no PITR to recover to. These two settings
compound: the environment easiest to delete is the one least able to come
back.

### What the policy says instead

[GCP Launch-Ready](2026-03-16-gcp-launch-ready.md) sets out a different
retention regime for clinical data in production: daily backups at 30 days,
weekly at 12 months, monthly snapshots at 10 years as an NHS compliance
baseline, and PITR at 7 days.

Only the first and last are implemented. Cloud SQL automated backups have no
weekly or monthly tier, so the others need either on-demand backups on a
schedule or exports to GCS with a lifecycle policy. Neither exists.

This plan does not assume ten years is right — see [Decisions needed](#decisions-needed).
It does assume the gap between a written policy and the running configuration
should be closed in one direction or the other, because a policy nobody
implements is worse than no policy: it produces false confidence in an audit,
and this one is cited against DCB 0129.

### Object storage

Five buckets, with materially different protection:

- **Clinician passports** (`quill-passports-<env>`) — versioned,
  `force_destroy = false` in every environment, `public_access_prevention`
  enforced, and deliberately no lifecycle rule at all. The module comment in
  `infra/modules/passport-storage/main.tf` explains why it is a separate
  module rather than a flag on the shared one. This is the best-protected
  store in the estate and needs no change.

- **Teaching images** (`quill-images-teaching`) — versioned, with a lifecycle
  rule deleting `ARCHIVED` versions after 365 days. `force_destroy` is true
  outside prod.

- **Processed video** (`quill-teaching-videos-processed-teaching`) —
  versioned, no lifecycle rule.

- **Source video** (`quill-teaching-videos-source-teaching`) — deliberately
  *not* versioned, with a retention-age deletion rule. Sound for raw uploads,
  but a source video deleted in error is gone.

- **Landing site** (in the load-balancer module) — rebuilt by CI from the
  repository, so it needs no backup.

Versioning is not backup. It protects against overwrite and deletion within
one bucket, in one region, under one set of credentials. It does not protect
against the bucket being deleted, the project being deleted, or a credential
compromise that deletes versions too.

**Passport history lives in these buckets, not in git as a working tree.**
Each passport is a `git bundle` object with evidence blobs beside it under
`files/sha256/…`, per the passport plan's "Where the repository lives". There
is no clone on a disk anywhere and nothing is pushed to GitHub, so the bucket
is the only copy. Certificates are generated on demand from a background
image rather than stored, so they need no backup of their own.

### The FHIR and EHRbase VM

`enable_fhir` is true for prod and staging, both currently torn down. Both
would run HAPI FHIR and EHRbase in containers on a single Compute Engine VM
with a 30 GB `pd-standard` boot disk.

**That disk has no snapshot schedule.** Whatever those containers persist
locally is unprotected. The clinical databases are separate Cloud SQL
instances and are backed up, but any state on the VM is not, and this needs
establishing precisely rather than assumed.

Lower priority than it first appears, since neither environment is running —
but it must be settled before clinical data arrives, not after.

### The rebuild path

Terraform state lives in `gs://quill-medical-terraform-state`, with a
`terraform/state` prefix and one workspace per environment. Versioning was
enabled by hand at creation, per the comment in `backend.tf`, and is not
enforced by code.

**The state bucket sits in the production project.** All three environments'
state is in there. Losing that project therefore costs the ability to cleanly
manage staging and teaching too. They would keep running, since state is not
in the serving path, but every later change would need a state rebuild by
import.

Secret *containers* are Terraform-managed; secret *values* are set manually
or by CI and the module comment notes they are "never in Terraform state".
Correct for security, and it means **no copy of any secret value exists
outside GCP Secret Manager**. Some regenerate harmlessly; others do not.
Rotating the JWT secret invalidates every session, and rotating the video
signing key invalidates every issued CDN cookie. Both are recoverable
inconveniences, but they belong in a runbook rather than being discovered
mid-incident.

## Phase 1: Look before changing anything

Establish the live position from GCP itself rather than from Terraform. The
code says what was intended; only the console says what is true. Mark runs
these and reads the output himself — the point is that he has seen it, not
that it has been reported to him.

- [ ] Confirm automated backups exist on the teaching core database, with
      timestamps and retention — `gcloud sql backups list --instance=<core>`
      and the Cloud SQL Backups tab

- [ ] Confirm whether PITR is on for teaching and, if so, its window length
      (expected off, per `infra/main.tf` line 143)

- [ ] Confirm object versioning is live on every bucket, especially
      `quill-passports-teaching` — `gsutil versioning get gs://<bucket>`

- [ ] List lifecycle rules on every bucket and confirm none deletes live
      objects — `gsutil lifecycle get gs://<bucket>`

- [ ] Confirm the Terraform state bucket has versioning enabled

- [ ] Capture the output of each as evidence for the DCB 0129 safety case

- [ ] Establish what, if anything, the FHIR VM persists to its boot disk

## Phase 2: Close the gaps the lookups confirm

- [ ] Enable PITR for teaching — change the conditional in `infra/main.tf`
      line 143 so teaching is included

- [ ] Raise teaching's `backup_retained_count` above the staging default of 7

- [ ] Enable `deletion_protection` for teaching in
      `infra/modules/cloud-sql/main.tf` line 10

- [ ] Alert on backup failure through the existing `monitoring` module, so
      `COUNT` retention cannot degrade invisibly

- [ ] Enforce Terraform state bucket versioning in code rather than relying
      on a manual `gsutil` command run once

- [ ] Decide and implement the long-retention tier, or amend the stated
      policy to match reality

- [ ] Add a snapshot schedule to the FHIR VM, or record why none is needed

## Phase 3: Write the restore procedures

One document, `docs/docs/infrastructure/disaster-recovery.md`, holding a
procedure per scenario, written to be followed by someone under pressure who
did not write it: exact commands, expected output, and a stated way to tell
success from failure. Each states its expected duration, because the
difference between ten minutes and six hours changes what you tell people.

- [ ] A bad migration or bad deploy — restore to a point in time or to the
      most recent daily backup, including how to choose and what is lost

- [ ] One table or one row — restore to a clone, extract, reimport, rather
      than restoring a whole instance to fix one mistake

- [ ] A deleted or overwritten object, per bucket, since the versioned ones
      and the unversioned one need different answers

- [ ] A corrupted or lost passport bundle — recover the prior generation and
      verify with `git fsck` before putting it back

- [ ] A lost Cloud SQL instance — restore into a new one and repoint the
      application

- [ ] A lost project — the full rebuild, folding in the hibernation runbook
      rather than duplicating it

- [ ] A lost region, stated plainly as having no answer today beyond
      restoring elsewhere and accepting the loss

- [ ] A note in each procedure marking where user communication belongs

## Phase 4: Build the restore tool

A single documented command, because a procedure followed by hand at three in
the morning is a procedure followed wrongly.

- [ ] Dry run by default; a real run needs an explicit flag *and* a typed
      confirmation phrase

- [ ] A banner at start and end stating DRY RUN or LIVE RUN, and every output
      line prefixed with the mode so it is unambiguous mid-scroll

- [ ] The target project ID stated explicitly, never defaulted, so restoring
      into the wrong project takes deliberate effort

- [ ] Refuse to run against the live project unless separately confirmed

- [ ] Verbose throughout — say what is about to happen before doing it

- [ ] Human-triggered only. No automation restores anything unsupervised

## Phase 5: Rehearse

Against a throwaway project spun up by Terraform, since there is no staging
environment any more. **This rehearsal is the only place the procedure is
ever tested before it matters.**

- [ ] Stand up a scratch project, restore into it, point a test deployment at
      it, verify the data is present and sane, record elapsed time, tear it
      down

- [ ] Set the recovery time objective from what the first rehearsal actually
      took, rather than guessing it beforehand

- [ ] Write down what the runbook got wrong. That record is worth more than
      the runbook

- [ ] Restore a backup taken *before* a schema migration and confirm the
      application still starts

- [ ] Confirm a restored database's secrets still match what Cloud Run expects

- [ ] Repeat quarterly, and treat the interval as provisional until it has
      survived contact with a real quarter

## Phase 6: Reduce the single-person dependency

Mark is currently the only person who could perform a restore. That is
tolerable at this size and a genuine risk as it grows.

- [ ] Write the procedures so someone else could follow them cold — the test
      is whether a competent person unfamiliar with Quill could

- [ ] Record what access a second person would need, without granting it yet

- [ ] Revisit when the team grows past one, or when clinical data arrives

## Scope

**In scope:** Cloud SQL, object storage, the FHIR VM, Terraform state and
secrets, across all environments.

**Out of scope, deliberately:**

- **High availability** — about staying up, not coming back. Already deferred
  with a recorded trigger in [GCP Launch-Ready](2026-03-16-gcp-launch-ready.md).

- **Multi-region** — same reasoning, larger price tag. The single-region
  exposure is documented here, not fixed here.

- **FHIR and EHRbase content** — not in live use. The VM disk question is in
  scope because it must be settled before that changes.

- **Migration validation against production-shaped data** — related, already
  a separate `todo.md` item.

- **Business continuity in the wider sense** — who tells users, contractual
  and regulatory notification. Real, but not this document.

## Decisions needed

Two of these are properly yours rather than technical.

- **Is ten-year retention actually required?** It appears in the launch-ready
  plan as an NHS compliance baseline. Retention obligations attach to
  *records*, which may be better served by export and archive than by
  hoarding database backups — and ten years of monthly snapshots is a real
  running cost for data nobody will read. The alternative is a shorter
  operational retention now, with long-term archival handled separately when
  clinical data arrives.

- **What is the acceptable data loss?** The draft's answer is that minutes are
  tolerable and a day of lost sign-offs is not, which argues for PITR on
  teaching and settles Phase 2's first item. Worth confirming, since it is the
  judgement the whole plan rests on.

- **How much is this worth spending?** Longer retention, snapshot schedules
  and cross-region copies all cost money continuously against a risk that may
  never materialise. A deliberate "we accept 24 hours of loss and
  single-region exposure" is respectable, and far better than an undeclared one.

## Decisions

- **Look before changing** — Phase 1 changes nothing. Terraform says what was
  intended and the console says what is true, and on a live system holding
  other people's sign-offs the difference should be established first.

- **Teaching before everything else** — it is live, it is least protected, and
  it is the only environment currently holding data. Prod and staging are
  torn down, so work on them is theoretical.

- **A tool, not just a document** — restores happen rarely, under stress, by
  one person. A dry-run-by-default command with a typed confirmation is worth
  more than a longer runbook.

- **Rehearse in a throwaway project** — there is no staging environment to
  rehearse in, and rehearsing against teaching would risk the thing being
  protected.

- **The passport bucket needs no change** — it is already versioned,
  undeletable and free of lifecycle rules, and its module comment explains
  why. Recorded so a later reader does not "improve" it.

## Open questions

- Does Cloud SQL's PITR survive an instance restore, or does the window
  restart? This affects how procedures chain.

- What does the video pipeline do if the processed bucket is restored to an
  earlier state — reconcile, or need re-triggering?

- Is there state in Cloud Run itself worth capturing? Believed stateless;
  worth confirming rather than assuming.

- Does a restored passport bundle verify under `git fsck` after a GCS
  generation rollback, or can a torn write leave it subtly broken?
