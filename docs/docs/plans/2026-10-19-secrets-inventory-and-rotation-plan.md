# Secrets inventory and rotation plan

Two items from `todo.md`, both about knowing what secrets exist and how
to change them. The first asks for a temporary admin password on the
`quill-ehrbase-staging` Cloud SQL instance to be rotated; the staging
project that instance lived in was removed on 2026-09-24, and the only
Cloud SQL instance in the only project left is `quill-core-app`, so the
item is settled by evidence rather than by a rotation. The second asks
for the secrets and their rotation procedure to be written down, which
`docs/docs/infrastructure/gcp.md` does only in part: it lists what
Terraform creates and what GitHub holds, says nothing about how any of
them is changed, and its GitHub table still names the two pipeline
secrets deleted on 2026-10-19.

The outcome is one page a person can follow under pressure: every secret
named, where it lives, who sets it, what reads it, how to rotate it and
what that rotation costs the people using the app. Built as its own
`secrets` stack from `main` rather than above #2137: the `security`
stack (#2135 to #2137) was checked out in another worktree when the
build started, a stack lives in one worktree, and nothing here depends
on that stack's code.

## Phase 1: Settle the staging password item

- [x] Record what exists and strike the item. `gcloud projects list`
      from the owner account shows `quill-medical-app` alone, and
      `gcloud sql instances list --project quill-medical-app` shows
      `quill-core-app` alone; `git log` dates the removal of
      `infra/environments/staging` and the staging project to
      2026-09-24 (`chore(infra): remove what still names the production
      and staging projects`). An instance that no longer exists has no
      password to rotate. Tick the item in `todo.md` with those three
      facts, and amend the row in
      `docs/docs/learnings/fhir-ehrbase-issues.md` that names the
      instance as where `uuid-ossp` was applied by hand, so that a
      future EHR production build knows the extension is wanted and
      that nothing applied it in the project that exists.

## Phase 2: The inventory

- [x] Add a `## Secrets` section to `docs/docs/infrastructure/gcp.md`,
      above `## Security`, listing every secret as bullets rather than a
      table (a table of ten rows with long cells is unreadable raw).
      Each bullet names the secret, who creates its container, who sets
      its value, what reads it, and the setting it arrives as. From
      `infra/main.tf` and `infra/runtime-identities.tf`, in App
      production:

      - **Terraform creates and fills**: `jwt-secret` and
        `vapid-private` (a placeholder from `random_password`, written
        once; the comment at the `vapid_placeholder` resource says the
        real VAPID key replaces it by hand), `core-db-password` (the
        `cloud-sql` module generates it and sets it on the database user
        in the same apply, so the two cannot drift), and
        `teaching-video-signing-key` (generated so the load balancer and
        the backend hold the same bytes).
      - **Terraform creates, a person fills**: `ses-access-key-id` and
        `ses-secret-access-key` (an AWS IAM user that may send from
        `eu-west-2` only), `pagerduty-service-key`, `alert-sms-number`,
        `feedback-notify-email` (addresses, not a credential, but
        people's own), `feedback-slack-webhook-url` (a credential:
        anyone holding it may post to the channel).
      - **Gone**: `teaching-sync-token` (2026-10-19, the pipeline starts
        a job instead) and `teaching-transcode-callback-token`
        (2026-10-18, the jobs present identity tokens). Named so that
        nobody goes looking for them.
      - **EHR production only**, when `enable_fhir` is true:
        `fhir-db-password`, `ehrbase-db-password`, `ehrbase-api-password`,
        `ehrbase-admin-password`.
      - **Not in Secret Manager at all**: the VAPID public key, which is
        not secret and sits in `deploy.yml` as `VITE_VAPID_PUBLIC`; the
        callback identity tokens, minted per request by the metadata
        server and never stored; and the `.env` files on a developer's
        machine, which hold development values only.

- [x] Correct the GitHub section in the same page. "Six repository
      secrets for the teaching content pipeline" is three since
      2026-10-19: the WIF provider, the content service account and the
      bucket, with `SLACK_WEBHOOK_URL` an organisation secret rather
      than a repository one. Say outright that GitHub holds no
      credential the app accepts: the WIF provider and service account
      emails are identifiers, worth nothing to whoever reads them, and
      the Slack webhook is the one credential GitHub genuinely uses
      itself. The `trigger the backend sync` sentence below the table
      goes with it.

## Phase 3: How each secret is rotated

- [x] Add `### Rotating a secret` under the inventory, one procedure per
      class, each ending with the step that is always forgotten:
      **re-run `deploy.yml`**, because a new secret version or a
      Terraform apply makes a Cloud Run revision that serves no traffic,
      and `gcloud run services update` is not the answer (it makes a
      revision Terraform then refuses with a 409). That rule is already
      in this repository's memory of a rotation that went wrong; here it
      is written where the next person will look.

      - **A hand-set value**: `printf '%s' "$VALUE" | gcloud secrets
        versions add <name> --data-file=-`, with `printf` and not
        `echo`, which appends a newline that then fails the login. Then
        re-run `deploy.yml` and confirm the serving revision changed.
        Old versions stay readable until disabled; disable the previous
        one once the new revision is seen working, and destroy it a
        week later.
      - **A Terraform-generated value**: an apply with
        `-replace=<the random_password resource>`, which regenerates it
        and, for the database password, sets the new value on the
        database user in the same apply. Run from the Terraform workflow
        by hand, never from a laptop against the live state; the next
        step gives the workflow the input that makes that possible.
        Then `deploy.yml`.
      - **The JWT secret** is a Terraform-generated value with a
        consequence: every session is signed out at once, and every
        password reset and email verification link in flight stops
        working. Rotate it in a quiet hour and say so in Slack first.
      - **The VAPID pair** is two values that must change together: the
        private key in Secret Manager and the public key in
        `deploy.yml`. `just vapid-key` prints a fresh pair. Every
        existing push subscription dies with the old key, which is
        acceptable while notifications are switched off in Settings.
      - **The video signing key** is Terraform-generated and read by two
        things, the backend and the load balancer, in one apply; a
        learner mid-video gets a 403 on the next segment and the player
        asks again. No announcement needed.
      - **The SES key pair**: make the new access key in AWS IAM first,
        set both secrets, deploy, send one test email
        (the feedback form is the quickest), then delete the
        old key in AWS. Never the other way round: deleting first stops
        every email until the deploy lands.
      - **The Slack webhook and the PagerDuty key** are rotated at the
        other end (Slack, PagerDuty) and the new value set here, with
        the same deploy afterwards; the alert SMS number is a number
        and is simply replaced.

- [x] Add a schedule, one line each, with the first date: hand-set
      credentials (SES, Slack, PagerDuty) yearly; Terraform-generated
      values on demand, since nothing leaves the project and nobody
      types them; everything immediately on any suspicion of exposure.
      Put the first yearly date, 2027-10, in `todo.md` beside the
      `security.txt` renewal, which is the same kind of reminder.
      Landed with the procedures above, in the same unit, because a
      schedule on its own is too small a pull request to read.

- [ ] Give `terraform.yml`'s `workflow_dispatch` an optional `replace`
      input, the address of one resource, passed to `terraform apply`
      as `-replace=` when set. Today the dispatch takes only the
      environment, so a regenerated secret would need an apply from
      somebody's laptop with the apply account's rights, which nobody
      holds outside GitHub by design. Validate the input against a
      short allow-list of the generated-secret addresses (the
      `random_password` resources, and `random_bytes.signing_key` in
      the video pipeline module) rather than accept any resource, so
      the dispatch cannot be used to replace a database. A `.bats` test
      of the script that builds the apply arguments, as the other
      workflow scripts have.

## Decisions

- **Settle the staging item with evidence, not a rotation** - the
  instance, its project and the environment that defined it are gone.
  A page saying so is worth more than a tick with nothing behind it,
  because the next reader of `todo.md` will otherwise go looking for
  the instance too.

- **Bullets, not a table, for the inventory** - the page already uses
  tables for short cells. Ten secrets with four facts each are long
  cells, and a table of those is only readable rendered.

- **Rotation runs through the Terraform workflow, not a laptop** - the
  plan account cannot apply and the apply account lives in GitHub's
  environment, so an apply from a laptop would need a human's owner
  credentials against live state. The workflow has a `workflow_dispatch`
  input for exactly this.
