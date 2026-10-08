# Disaster recovery plan

Quill can rebuild its infrastructure but cannot yet restore its data.
Terraform builds the whole environment from nothing, and that has been done
for real: `quill-medical-app` was built from an empty project on 21 and
22 September 2026. But it was filled by running the migrations and a seed,
not by restoring anything. Backups are taken every night, nobody has ever
restored one, and no document says how.

The intended outcome is a written, rehearsed restore procedure covering every
store that holds state, with backup settings that match what has been claimed
in writing. This plan was written on 17 September 2026, when there were
three environments, and was checked line by line against the Terraform and
the live project on 8 October 2026, when there is one. What that check
changed is marked where it applies.

## Why this matters now

**Not because of patient data.** There is none, FHIR and EHRbase are not
deployed anywhere, and by the time they are the answer needs to already exist
and not be commissioned in a hurry.

The app environment is the immediate concern, and it is the only one. It
holds lecture content, video, images, user accounts, exam results and
clinician passports. It is also configured as the least protected kind of
environment, because every protective setting in the Terraform is switched on
by `var.environment == "prod"`, and no environment is called `prod` any more.
The careful settings were written for a project that has since been deleted.

The clinician passport raises the stakes. A passport records competencies
signed off by other clinicians, which is a professional record about a real
person that no amount of re-authoring can reconstruct. Losing a lecture
costs an evening. Losing a sign-off means asking an assessor to re-attest to
something they observed months ago, which they may reasonably decline.

Roughly a thousand users are expected initially, growing.

## What exists today

Read from `infra/` and from the live project on 8 October 2026.

### One environment

- **`app` is the only environment**, in the project `quill-medical-app`.
  Staging, teaching and production were retired with their projects in
  Batches 8 and 10a of the
  [environment isolation plan](2026-09-18-environment-isolation-and-iap-plan.md),
  and only `infra/environments/app/` remains.

- **The hibernation and restore runbook is gone.** This plan used to lean on
  the restore steps in [GCP infrastructure](../infrastructure/gcp.md),
  written when production was hibernated by `terraform destroy`. That
  section was removed when production was retired. The record of a real
  build from nothing is now Batch 4 of the environment isolation plan.

- **The old database went with its backups.** `quill-core-teaching` was
  destroyed by Terraform on 23 September 2026, on the instruction that
  nothing in it was wanted, and its automated backups went with it. That
  was the right outcome then. It is also what would happen to the live
  database today.

### Cloud SQL

One instance, `quill-core-app`, PostgreSQL 18 on `db-f1-micro`, single zone.
Configured at the `cloud_sql_core` module call in `infra/main.tf`, lines 173
to 175:

```hcl
backup_retained_count = var.environment == "prod" ? 30 : 7
pitr_enabled          = var.environment == "prod"
pitr_days             = var.environment == "prod" ? 7 : 3
```

The environment is `app`, so the live instance has:

- **Seven daily backups**, taken at 03:00 UTC. All seven were present and
  successful on 8 October 2026, the newest from that morning.

- **No point-in-time recovery.** Up to a day of work is lost on any restore.

- **No deletion protection**, at either level. `deletion_protection` in
  `infra/modules/cloud-sql/main.tf` line 10 is the Terraform guard and is
  set from the same test on `prod`. The separate guard inside Google Cloud,
  `settings.deletion_protection_enabled`, is not set anywhere, and the live
  instance reports it as off.

- **No backups kept after deletion.** `settings.retain_backups_on_delete`
  is not set and defaults to off, and no final backup is taken. Deleting
  the instance, by `terraform destroy`, an errant apply or a click in the
  console, takes the backups with it.

These compound: the database is easy to delete, and deleting it removes the
only thing it could be restored from.

`retention_unit` is `COUNT`, not days. Seven retained backups means seven
days only while backups succeed daily; a run of failures silently lengthens
the window each backup covers without shortening the history. Nothing
alerts on a failed backup: the `monitoring` module watches the disk filling
and nothing else about the database.

The two other `cloud-sql` module calls, for FHIR and EHRbase, carry the same
three lines and create nothing, because `enable_fhir` is false.

### What the policy says instead

[GCP Launch-Ready](2026-03-16-gcp-launch-ready.md) sets out a different
retention regime for clinical data in production: daily backups at 30 days,
weekly at 12 months, monthly snapshots at 10 years as an NHS compliance
baseline, and PITR at 7 days.

None of it is running. The first and last exist in the Terraform but apply
only to an environment named `prod`. Cloud SQL automated backups have no
weekly or monthly tier, so the others need either on-demand backups on a
schedule or exports to Cloud Storage with a lifecycle policy. Neither exists.

This plan does not assume ten years is right: see
[Decisions needed](#decisions-needed). It does assume the gap between a
written policy and the running configuration should be closed in one
direction or the other, because a policy nobody implements is worse than no
policy: it produces false confidence in an audit, and this one is cited
against DCB 0129. The
[terms and privacy policy plan](2026-10-06-terms-and-privacy-policy-plan.md)
is waiting on the same figure, since the privacy policy has to say how long
deleted data survives in backups.

### Object storage

Nine buckets, with materially different protection. All are in
`europe-west2` except the landing site, which is in the `EU` multi-region.

- **Clinician passports** (`quill-passports-app`) - versioned,
  `force_destroy = false`, `public_access_prevention` enforced, and
  deliberately no lifecycle rule at all. The module comment in
  `infra/modules/passport-storage/main.tf` explains why it is a separate
  module and not a flag on the shared one. This is the best-protected store
  in the estate and needs no change.

- **Deleted test passports** (`quill-passports-deleted-app`) - added since
  this plan was written. Not versioned, and everything in it is deleted
  after 30 days. That is its job: it holds only what the admin job's
  `delete-passport` action removed.

- **Teaching content** (`quill-images-app`) - question bank YAML and
  images. Versioned, with a lifecycle rule deleting superseded versions
  after 365 days. `force_destroy` is true, from the same test on `prod`.
  The content is rebuilt by CI from the teaching repositories on GitHub, so
  the bucket is a copy and not the source.

- **Processed video** (`quill-teaching-videos-processed-app`) - versioned,
  no lifecycle rule. **This is the only copy of a lecture video**, because
  of the next bucket.

- **Source video** (`quill-teaching-videos-source-app`) - deliberately not
  versioned, and emptied after one day. When this plan was written the
  source was kept for longer. Today the transcode job deletes each upload
  once the renditions verify, so a lost rendition means asking the lecturer
  to upload again.

- **Guide screenshots** (`quill-medical-app-guide-assets` and
  `-guide-assets-private`) - added since. Not versioned, and remade by the
  screenshot workflow after each merge, so they need no backup.

- **Landing site** (`quill-medical-app-landing`) - rebuilt by CI from the
  repository, so it needs no backup.

- **Terraform state** (`quill-medical-app-terraform-state`) - see
  [The rebuild path](#the-rebuild-path).

Versioning is not backup. It protects against overwrite and deletion within
one bucket, in one region, under one set of credentials. It does not protect
against the project being deleted, or a credential compromise that deletes
versions too.

**Soft delete is on for every bucket, at the default of seven days.** This
plan did not mention it. Cloud Storage keeps a deleted object, and a deleted
bucket, for seven days, during which it can be restored and cannot be
permanently removed. So an unversioned bucket is not as bare as it looks,
and a deleted bucket is recoverable for a week. Nothing in the Terraform
sets it, so it is a default that could change, not a decision.

**Passport history lives in the bucket, not in git as a working tree.** Each
passport is a `git bundle` object with evidence blobs beside it under
`files/sha256/…`, per the passport plan's "Where the repository lives". There
is no clone on a disk anywhere and nothing is pushed to GitHub, so the bucket
is the only copy. Teaching certificates are generated on demand from a
background image and not stored, so they need no backup of their own.

**The database and the passport bucket are restored separately, and must
agree afterwards.** The `passport` table caches where each repository's
history has got to. `backend/app/features/passport/reconcile.py` already
handles the bucket being ahead of the row, which is what a database restore
produces: it moves the row forward. The bucket being behind the row, which
is what rolling a bundle back produces, is reported and never healed. A
passport created after the backup that the database was restored from has a
bundle and no row at all.

### Analytics

The `analytics` module keeps a BigQuery dataset of the public site's request
logs, fed by a log sink, with each day's rows expiring after 30 days. Losing
it loses a month of raw visit logs and nothing else, so it is not backed up.

### The FHIR and EHRbase VM

Not deployed: `enable_fhir` is false in the only environment. When it is
switched on, HAPI FHIR and EHRbase run in containers on a single Compute
Engine VM with a 30 GB `pd-standard` boot disk and no snapshot schedule.

The VM keeps nothing. `infra/modules/compute-fhir/startup.sh` writes its
compose file and its environment file afresh on every boot, from the script
itself and from Secret Manager, and neither container is given a volume.
Both keep their data in their own Cloud SQL instances. So the disk needs no
snapshot, and a lost VM is rebuilt by Terraform.

### The rebuild path

Terraform state lives in `gs://quill-medical-app-terraform-state`. It holds
three states: the app environment under `terraform/state`, AWS under
`terraform/aws` and GitHub under `terraform/github`. The bucket is created
by hand, because a bucket cannot hold the state that creates it, and the
commands are in `infra/backend.tf`. Versioning was switched on by hand and
is on. Nothing in code enforces it.

**Everything is in one project.** The state bucket, the DNS zone for
`quill-medical.com`, the database, every bucket and every secret are in
`quill-medical-app`. When this plan was written the state sat in the
production project, apart from the live one. Now losing the project loses
the means of rebuilding it as well as the thing to rebuild. A deleted
project can be restored for thirty days.

**The DNS zone would come back with different nameservers.** `infra/dns.tf`
holds the zone with `prevent_destroy`, and its comment says why: a recreated
zone is not given the same nameservers, so the delegation at GoDaddy, the
registrar, has to be changed by hand before the site or any email works.

**Secret values are in two places, not one.** This plan said no copy of any
secret value exists outside Secret Manager. That is true only of the ones
set by hand: the Amazon SES keys, the PagerDuty key, the alert phone number
and the teaching sync token. The ones Terraform generates, which are the
JWT secret, the database password, the video signing key and the transcode
callback token, are also in the Terraform state, in plain text, as
`infra/backend.tf` says. So a state file restores them, and losing the
state bucket does not lose them. The push notification key starts as a
Terraform placeholder and is meant to be replaced by hand.

Some regenerate harmlessly; others do not. Rotating the JWT secret
invalidates every session, and rotating the video signing key invalidates
every issued CDN cookie. Both are recoverable inconveniences, but they
belong in a runbook and should not be discovered mid-incident.

**One person can do any of this.** The project has one owner.

## Phase 1: Look before changing anything

Establish the live position from Google Cloud itself and not from
Terraform. The code says what was intended; only the project says what is
true. This phase changes nothing.

This plan asked Mark to run these and read the output himself. Claude ran
them on 8 October 2026, at Mark's request, with read-only `gcloud` commands
as `mark@quill-medical.com`, and the results are below and in "What exists
today". Each command is given so he can run it again and see the same.

- [x] **Confirm automated backups exist on the core database.** Seven
      automated backups, 2 to 8 October 2026, each started at 03:00 UTC and
      each successful. `gcloud sql backups list --instance=quill-core-app
      --project=quill-medical-app`.

- [x] **Confirm whether PITR is on.** Off. Retention is seven backups by
      count, and deletion protection is off. `gcloud sql instances describe
      quill-core-app --project=quill-medical-app`.

- [x] **Confirm object versioning on every bucket.** On for passports,
      teaching content, processed video and Terraform state. Off for source
      video, deleted test passports, both guide screenshot buckets and the
      landing site, each by design. `gcloud storage buckets list
      --project=quill-medical-app`.

- [x] **List lifecycle rules on every bucket and confirm none deletes live
      objects that matter.** Three buckets have a rule. Teaching content
      deletes only superseded versions, after 365 days. Source video
      deletes live objects after one day and deleted test passports after
      thirty, both by design. The other six have none.
      `gcloud storage buckets describe gs://<bucket>
      --format='json(lifecycle_config)'`.

- [x] **Confirm the Terraform state bucket has versioning enabled.** It
      has.

- [x] **Confirm whether a restore has ever been run.** Added on 8 October
      2026. It has not: the instance's operations are its creation and
      seventeen backups, with no restore, clone, export or import.
      `gcloud sql operations list --instance=quill-core-app
      --project=quill-medical-app`.

- [x] **Establish what, if anything, the FHIR VM persists to its boot
      disk.** Nothing, read from `startup.sh`: see "The FHIR and EHRbase
      VM". Not checked on a running VM, because there is none.

- [ ] **Capture the output of each as evidence for the DCB 0129 safety
      case.** Not done. The results are summarised in this plan, but the
      output itself is not kept anywhere. Decide where it should live
      before saving it: this repository is public.

## Phase 2: Close the gaps the lookups confirm

Every step here is a Terraform change, applied by CI when it merges.

- [ ] **Stop gating the database's protection on `prod`.** In
      `infra/main.tf` lines 173 to 175, give the core database PITR and a
      longer history whatever the environment is called. The module's own
      defaults are already thirty backups, PITR on and seven days of logs,
      so deleting the three lines does it. Enabling PITR on a running
      instance restarts it, so apply it at a quiet time.

- [ ] **Raise `backup_retained_count` above seven**, in the same change.
      The figure is the one the privacy policy will quote, so settle it
      with [Decisions needed](#decisions-needed).

- [ ] **Enable deletion protection at both levels**, in
      `infra/modules/cloud-sql/main.tf`. `deletion_protection` at line 10
      stops Terraform destroying the instance. `deletion_protection_enabled`
      inside `settings` stops Google Cloud deleting it by any route, the
      console included. The plan named only the first.

- [ ] **Keep backups when an instance is deleted.** Added on 8 October
      2026. Set `retain_backups_on_delete` inside `settings`, and take a
      final backup on deletion if the provider offers it. Without this the
      "lost instance" procedure in Phase 3 has nothing to restore from.

- [ ] **Alert on backup failure** through the existing `monitoring` module,
      so `COUNT` retention cannot degrade invisibly.

- [ ] **Stop the teaching content bucket being force-destroyable.** Added
      on 8 October 2026. `force_destroy` in
      `infra/modules/cloud-storage/main.tf` is true for every environment
      not named `prod`. The content can be rebuilt from GitHub, so this is
      tidiness and not rescue.

- [ ] **Enforce Terraform state bucket versioning in code**, so it does not
      rest on a `gcloud` command run once. The bucket cannot be created by
      the state it holds, so this means importing it, or a check in CI that
      fails when versioning is off.

- [ ] **Set the soft delete period on purpose.** Added on 8 October 2026.
      Every bucket has the default seven days because nothing sets it.
      State the period in Terraform for the passport and processed video
      buckets, which are the two that hold the only copy of something.

- [ ] **Decide and implement the long-retention tier, or amend the stated
      policy to match reality.**

- [x] **Add a snapshot schedule to the FHIR VM, or record why none is
      needed.** None is needed, and why is recorded under "The FHIR and
      EHRbase VM": the VM keeps nothing. Look again if a container is ever
      given a volume.

## Phase 3: Write the restore procedures

One document, `docs/docs/infrastructure/disaster-recovery.md`, holding a
procedure per scenario, written to be followed by someone under pressure who
did not write it: exact commands, expected output, and a stated way to tell
success from failure. Each states its expected duration, because the
difference between ten minutes and six hours changes what you tell people.
The document does not exist yet.

- [ ] **A bad migration or bad deploy** - restore to a point in time or to
      the most recent daily backup, including how to choose and what is
      lost. A backup can be restored onto the same instance. A point in
      time cannot: Cloud SQL always makes a new instance for it, which the
      application and the Terraform state then have to be pointed at.

- [ ] **One table or one row** - restore to a clone, extract, reimport, and
      do not restore a whole instance to fix one mistake.

- [ ] **A deleted or overwritten object, per bucket**, since the versioned
      ones and the unversioned ones need different answers, and soft delete
      gives the unversioned ones seven days.

- [ ] **A corrupted or lost passport bundle** - recover the prior
      generation and verify with `git fsck` before putting it back.

- [ ] **A database restored behind the passport bucket.** Added on
      8 October 2026. After any database restore, say how to run the
      reconcile over every passport, and how to find and re-link a bundle
      whose row was lost with the restore.

- [ ] **A lost Cloud SQL instance** - restore into a new one and repoint
      the application. Depends on Phase 2 keeping backups after deletion.

- [ ] **A lost project** - the full rebuild, from Batch 4 of the
      environment isolation plan, which is the record of doing it. It has
      to cover the state bucket and the DNS zone being lost with the
      project, the change of nameservers at the registrar, and putting a
      value back in every secret that was set by hand.

- [ ] **A lost region**, stated plainly as having no answer today beyond
      restoring elsewhere and accepting the loss.

- [ ] **A note in each procedure marking where user communication
      belongs.**

## Phase 4: Build the restore tool

A single documented command, because a procedure followed by hand at three in
the morning is a procedure followed wrongly. Nothing of it exists: there is
no restore recipe in the `Justfile` and no restore action in the admin job.

- [ ] Dry run by default; a real run needs an explicit flag *and* a typed
      confirmation phrase

- [ ] A banner at start and end stating DRY RUN or LIVE RUN, and every output
      line prefixed with the mode so it is unambiguous mid-scroll

- [ ] The target project ID stated explicitly, never defaulted, so restoring
      into the wrong project takes deliberate effort

- [ ] Refuse to run against the live project unless separately confirmed

- [ ] Verbose throughout: say what is about to happen before doing it

- [ ] Human-triggered only. No automation restores anything unsupervised

## Phase 5: Rehearse

Against a throwaway project spun up by Terraform, since there is no staging
environment. **This rehearsal is the only place the procedure is ever tested
before it matters.**

- [ ] Stand up a scratch project, restore into it, point a test deployment at
      it, verify the data is present and sane, record elapsed time, tear it
      down

- [ ] Set the recovery time objective from what the first rehearsal actually
      took, and do not guess it beforehand

- [ ] Write down what the runbook got wrong. That record is worth more than
      the runbook

- [ ] Restore a backup taken *before* a schema migration and confirm the
      application still starts

- [ ] Confirm a restored database's secrets still match what Cloud Run expects

- [ ] Repeat quarterly, and treat the interval as provisional until it has
      survived contact with a real quarter

## Phase 6: Reduce the single-person dependency

Mark is the only person who could perform a restore, and the only owner of
the project. That is tolerable at this size and a genuine risk as it grows.

- [ ] Write the procedures so someone else could follow them cold. The test
      is whether a competent person unfamiliar with Quill could

- [ ] Record what access a second person would need, without granting it yet

- [ ] Revisit when the team grows past one, or when clinical data arrives

## Scope

**In scope:** Cloud SQL, object storage, Terraform state, the DNS zone and
secrets, in the app environment, and the FHIR VM for when it is deployed.

**Out of scope, deliberately:**

- **High availability** - about staying up, not coming back. Already deferred
  with a recorded trigger in [GCP Launch-Ready](2026-03-16-gcp-launch-ready.md).

- **Multi-region** - same reasoning, larger price tag. The single-region
  exposure is documented here, not fixed here.

- **FHIR and EHRbase content** - not in live use.

- **Migration validation against production-shaped data** - related, already
  a separate `todo.md` item.

- **Business continuity in the wider sense** - who tells users, contractual
  and regulatory notification. Real, but not this document. The
  [NHS procurement plan](2026-10-08-preparing-for-nhs-procurement-plan.md)
  asks for a written incident process and an exit plan, and points here for
  the tested restore.

## Decisions needed

Two of these are properly Mark's and not technical.

- **Is ten-year retention actually required?** It appears in the launch-ready
  plan as an NHS compliance baseline. Retention obligations attach to
  *records*, which may be better served by export and archive than by
  hoarding database backups, and ten years of monthly snapshots is a real
  running cost for data nobody will read. The alternative is a shorter
  operational retention now, with long-term archival handled separately when
  clinical data arrives.

- **What is the acceptable data loss?** The draft's answer is that minutes are
  tolerable and a day of lost sign-offs is not, which argues for PITR on
  the app database and settles Phase 2's first item. Worth confirming, since
  it is the judgement the whole plan rests on.

- **How much is this worth spending?** Longer retention, PITR logs and
  cross-region copies all cost money continuously against a risk that may
  never materialise. A deliberate "we accept 24 hours of loss and
  single-region exposure" is respectable, and far better than an undeclared
  one.

- **Should the state and the DNS zone sit apart from what they rebuild?**
  Added on 8 October 2026. They moved into `quill-medical-app` so the old
  production project could be deleted. One project is simpler and cheaper.
  It also means one deletion takes everything, with thirty days to undo it.

## Decisions

- **Look before changing** - Phase 1 changes nothing. Terraform says what was
  intended and the project says what is true, and on a live system holding
  other people's sign-offs the difference should be established first.

- **The app environment is the whole of it** - it is live, it is the least
  protected kind, and it is the only environment. This replaced "teaching
  before everything else" when the other three were retired.

- **A tool, not just a document** - restores happen rarely, under stress, by
  one person. A dry-run-by-default command with a typed confirmation is worth
  more than a longer runbook.

- **Rehearse in a throwaway project** - there is no staging environment to
  rehearse in, and rehearsing against the live one would risk the thing being
  protected.

- **The passport bucket needs no change** - it is already versioned,
  undeletable and free of lifecycle rules, and its module comment explains
  why. Recorded so a later reader does not "improve" it.

- **Gate protection on what a store holds, not on the environment's name** -
  added on 8 October 2026. Every setting keyed on `prod` stopped applying
  the day the last environment of that name was retired, and nothing
  failed or warned. A database is protected because it is a database.

## Open questions

- Does Cloud SQL's PITR window survive restoring a backup onto an instance,
  or does it restart? This affects how procedures chain. Google's pages on
  backups and on PITR, read on 8 October 2026, do not say. They do say a
  point-in-time recovery always creates a new instance.

- What does the video pipeline do if the processed bucket is restored to an
  earlier state: reconcile, or need re-triggering? With the source gone
  after a day, re-triggering may not be possible.

- Is there state in Cloud Run itself worth capturing? Believed stateless;
  worth confirming and not assuming.

- Does a restored passport bundle verify under `git fsck` after a
  generation rollback, or can a torn write leave it subtly broken?

- Does the Terraform provider in use expose a final backup on deletion, and
  under what name? `retain_backups_on_delete` is documented; the final
  backup setting was not found in the provider's pages on 8 October 2026.
