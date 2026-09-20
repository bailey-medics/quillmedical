# Disaster recovery plan

## Summary

Quill can rebuild its infrastructure but cannot yet restore its data. This
plan closes that gap.

Terraform recreates every environment from nothing, and the procedure has
been run for real — production was hibernated by `terraform destroy` and the
restore steps in [GCP infrastructure](../infrastructure/gcp.md) were written
from that exercise. What follows the rebuild is undefined. The runbook ends
on the sentence "a data restore from backups would be needed if any data
existed previously", and no document anywhere says how to perform one.

Three things are therefore true at once: backups exist, nobody has ever
restored one, and the retention actually configured is about thirty days
against a stated policy of ten years.

The work divides into four parts, in the order they should be done:

1. **Make the backups match the claim** — retention, point-in-time recovery,
   and the environments currently protected least.
2. **Write the restore procedures** — one per class of data, because a
   Cloud SQL restore and a GCS object restore share nothing but the word.
3. **Prove they work** — a drill, with a written result. An untested backup
   is a hypothesis.
4. **Close the single points of failure** — the things whose loss would make
   the rebuild itself impossible, rather than merely the data.

## Why this matters now

**Not because of patient data.** There is none, and by the time there is, the
answer needs to already exist rather than be commissioned.

The live teaching deployment is the immediate concern. It holds lecture
content, video, images and user accounts representing real authored work, and
it is the environment with the *weakest* backup configuration of the three —
because `pitr_enabled` is set from `var.environment == "prod"`, and teaching
is not prod. The environment that is hibernated and empty is the one
configured most carefully.

That inversion is the plan's starting point.

## What exists today

### Cloud SQL

Configured in [`infra/main.tf`](https://github.com/bailey-medics/quillmedical/blob/main/infra/main.tf)
at the three `cloud-sql` module calls, all three identical:

```hcl
backup_retained_count = var.environment == "prod" ? 30 : 7
pitr_enabled          = var.environment == "prod"
pitr_days             = var.environment == "prod" ? 7 : 3
```

The module writes those into a `backup_configuration` block with a 03:00 UTC
start time and `retention_unit = "COUNT"`.

So, in practice:

- **Production** — 30 daily backups, PITR on, 7 days of transaction logs.
  Currently hibernated and holding no data.
- **Staging** — 7 daily backups, no PITR.
- **Teaching** — 7 daily backups, no PITR. This is the live one.

`retention_unit` is `COUNT`, not days. Thirty retained backups means thirty
days only while backups succeed daily; a run of failures silently lengthens
the window each backup covers rather than shortening the history. Nothing
currently alerts on a failed backup.

### What the policy says instead

[GCP Launch-Ready](2026-03-16-gcp-launch-ready.md) sets out a different
retention regime for clinical data in production:

- Daily backups, 30-day retention
- Weekly backups, 12-month retention
- Monthly snapshots, 10-year retention, named as an NHS compliance baseline
- PITR enabled, 7-day window

Only the first and last of those are implemented. Cloud SQL automated backups
have no weekly or monthly tier, so the other two need either on-demand
backups on a schedule, or exports to GCS with a lifecycle policy. Neither
exists.

This plan does not assume the ten-year figure is right — see
[Decisions needed](#decisions-needed). It does assume the gap between a
written policy and the running configuration should be closed in one
direction or the other, because a policy nobody implements is worse than no
policy: it produces false confidence in an audit.

### Object storage

Four bucket families, with materially different protection:

- **Teaching images** (`quill-images-teaching`) — versioned, with a
  lifecycle rule deleting `ARCHIVED` versions after 365 days. Well
  configured, and the comment in
  [`modules/cloud-storage/main.tf`](https://github.com/bailey-medics/quillmedical/blob/main/infra/modules/cloud-storage/main.tf)
  records a real bug that was fixed there. `force_destroy` is true for every
  environment except prod.
- **Processed video** (`quill-teaching-videos-processed-teaching`) —
  versioned, no lifecycle rule.
- **Source video** (`quill-teaching-videos-source-teaching`) — deliberately
  *not* versioned, with a retention-age deletion rule. The reasoning is sound
  for raw uploads, but it means a source video deleted in error is gone.
- **Clinician passports** — provisioned in all three environments. Needs
  checking against the same questions; the module was added later than the
  others.

Versioning is not backup. It protects against overwrite and deletion within
one bucket, in one region, under one set of credentials. It does not protect
against the bucket being deleted, the project being deleted, or a credential
compromise that deletes versions too.

### The FHIR and EHRbase VM

`enable_fhir` is true for prod and staging. Both run HAPI FHIR and EHRbase in
containers on a single Compute Engine VM with a 30 GB `pd-standard` boot
disk.

**That disk has no snapshot schedule.** Whatever those containers persist to
local disk is unprotected. The clinical databases themselves are separate
Cloud SQL instances and are backed up — but any state on the VM is not, and
this needs establishing precisely rather than assumed. It matters because
this is the clinical data path, the one that will hold patient records.

This is the largest unknown in the current picture and the first thing to
investigate.

### The rebuild path

Terraform state lives in `gs://quill-medical-terraform-state`, with a
`terraform/state` prefix and one workspace per environment. Versioning was
enabled by hand at creation, per the comment in `backend.tf`, and is not
enforced by code.

**The state bucket sits in the production project.** All three environments'
state is in there. Losing that project therefore does not cost you production
alone — it costs the ability to cleanly manage staging and teaching too. They
would keep running, since Terraform state is not in the serving path, but
every subsequent change would need a state rebuild by import.

Secret *containers* are Terraform-managed; secret *values* are set manually
via `gcloud secrets versions add` or by CI, and the module comment notes they
are "never in Terraform state". Correct for security, and it means **no copy
of any secret value exists outside GCP Secret Manager**. Losing the project
loses the JWT signing key, the video signing key and every database password
simultaneously.

Some of those regenerate harmlessly. Others do not: rotating the JWT secret
invalidates every session, and rotating the video signing key invalidates
every issued CDN cookie. Both are recoverable inconveniences rather than data
loss, but they belong in the runbook rather than being discovered mid-incident.

## What this plan adds

### Part 1 — Make the configuration match the intent

- **Enable PITR on teaching.** One-line change to the conditional in
  `main.tf`. Teaching is live and holds authored work; a seven-backup window
  with no PITR means a mistake noticed on a Monday may be unrecoverable to
  any point other than 03:00 that morning.
- **Raise teaching's retained backup count.** Seven is a staging number.
- **Alert on backup failure.** The `monitoring` module already sends email
  and Slack; a failed or missing backup should reach the same place. Without
  this, `COUNT` retention degrades invisibly.
- **Decide and implement the long-retention tier**, or amend the stated
  policy to match reality. See [Decisions needed](#decisions-needed).
- **Establish what the FHIR VM persists**, then either add a snapshot
  schedule or document why none is needed.
- **Review the passport bucket** against the versioning and lifecycle
  questions answered for the others.

### Part 2 — Write the restore procedures

One document, `docs/docs/infrastructure/disaster-recovery.md`, holding a
procedure per scenario. Each is written to be followed by someone under
pressure who did not write it, which means exact commands, expected output,
and a stated way to tell success from failure.

The scenarios, roughly in ascending order of severity:

- **A bad migration or bad deploy.** By far the most likely. Restore to a
  point in time, or to the most recent daily backup. Includes how to decide
  which, and what is lost either way.
- **One table or one row.** Restoring an entire instance to fix one mistake
  is usually wrong. Restore to a clone, extract, reimport.
- **A deleted or corrupted object.** Per bucket, because the versioned ones
  and the unversioned one need different answers, and the unversioned one may
  have no answer at all.
- **A lost Cloud SQL instance.** Restore from backup into a new instance,
  then repoint the application.
- **A lost project.** The full rebuild: what survives, what does not, and in
  what order. The hibernation runbook is most of this already and should be
  folded in rather than duplicated.
- **A lost region.** Everything is single-region `europe-west2` with
  `enable_ha = false`. This scenario currently has no answer beyond "restore
  into another region and accept the data loss". Say so plainly rather than
  leave it unaddressed.

Each procedure states its expected duration, because the difference between
ten minutes and six hours changes what you tell people.

### Part 3 — Prove it works

A drill, run against **staging**, which is the environment that exists for
exactly this purpose and where nothing is lost by being wrong.

The first drill should be the full rebuild, because it subsumes the smaller
ones and because the hibernation exercise showed the value of doing this for
real rather than on paper. Write down what actually happened, including what
the runbook got wrong — that record is more valuable than the runbook itself.

Thereafter a lighter drill on a schedule, restoring teaching's database to a
clone and verifying the data is intact. Quarterly is the figure named in
`todo.md`; the honest test of that interval is whether it survives contact
with a real quarter.

Two drills are worth running once each regardless of schedule, because both
have caught real problems elsewhere: restoring a backup taken *before* a
schema migration and confirming the application still starts, and confirming
that a restored database's secrets still match what Cloud Run expects.

### Part 4 — Close the single points of failure

- **Enforce state bucket versioning in code**, rather than relying on a
  manual `gsutil` command run once in the past. It can be verified but not
  currently guaranteed.
- **Consider moving Terraform state out of the production project**, so that
  losing one environment does not degrade management of the others. This may
  be more disruption than it is worth; it should be a recorded decision
  either way.
- **Decide what happens to secret values.** The current position — no copy
  outside Secret Manager — is defensible and secure. It is also a total loss
  on project deletion. The alternatives all involve a second custodian, which
  the repository's own security rules are rightly sceptical of. At minimum,
  document which secrets regenerate freely and which have consequences, so
  the incident is not the first time anyone thinks about it.
- **Note that Secret Manager has a deletion delay** and that this is part of
  the recovery story for an accidental `terraform destroy`.

## Scope

**In scope:** everything above — Cloud SQL, object storage, the FHIR VM,
Terraform state and secrets, across all three environments.

**Out of scope, deliberately:**

- **High availability.** HA is about staying up; this plan is about coming
  back. They are different problems and HA is already deferred with a
  recorded trigger in [GCP Launch-Ready](2026-03-16-gcp-launch-ready.md).
- **Multi-region.** Same reasoning, larger price tag. The single-region
  exposure gets documented here, not fixed here.
- **Migration validation against production-shaped data.** Related, and
  already a separate `todo.md` item.
- **Business continuity in the wider sense** — who tells users, contractual
  obligations, regulatory notification. Real, but not this document. The
  restore procedures should leave a hook where comms belongs.

## Decisions needed

These need answering before the work starts, and two of them are properly
yours rather than technical.

- **Is ten-year retention actually required?** It appears in the launch-ready
  plan as an NHS compliance baseline. Retention obligations for clinical
  records are real and long, but they attach to *records*, which may be
  better served by an export and archive strategy than by hoarding database
  backups. Ten years of monthly snapshots is also a meaningful running cost
  for data nobody will read. The alternative is to state a shorter operational
  retention now and handle long-term archival separately when clinical data
  actually arrives.
- **What is the acceptable data loss for teaching?** PITR gives minutes;
  daily backups alone give up to 24 hours. This is a judgement about how much
  re-authoring is tolerable, not a technical question.
- **How much is this worth spending?** Longer retention, snapshot schedules
  and cross-region copies all cost money continuously, against a risk that
  may never materialise. A deliberate "we accept 24 hours of loss and
  single-region exposure" is a perfectly respectable answer, and is much
  better than an undeclared one.
- **Does the FHIR VM hold state that matters?** Technical, and blocking —
  the answer determines whether Part 1 includes snapshot work.

## Sequencing

Part 1's teaching PITR change is small, cheap and independent — it should go
first and separately, because the live environment is currently the least
protected and that is worth fixing before anything else is designed.

The FHIR VM investigation should also happen early, since it is the one place
where the answer might change the shape of the plan.

Parts 2 and 3 belong together: writing a procedure without running it
produces a document that is wrong in ways nobody knows. Expect the first
drill to invalidate parts of what was written, and treat that as the drill
working.

Part 4 is the least urgent and the easiest to defer, which is exactly why it
should be given a date rather than left to "later".

## Open questions

- Does Cloud SQL's PITR survive an instance restore, or does the window
  restart? This affects how the procedures chain.
- What does the video pipeline do if the processed bucket is restored to an
  earlier state — does it reconcile, or does it need re-triggering?
- Is there any state in Cloud Run itself worth capturing, or is it genuinely
  stateless? Believed stateless; worth confirming rather than assuming.
