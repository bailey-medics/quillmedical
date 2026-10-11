# Terraform and the deploy: who owns a running service

Two workflows change a Cloud Run service, and each owns a different part of
it. Knowing which is which explains the one surprise this page exists for:
**a setting changed in Terraform is not live when the apply finishes. It
goes live on the next deploy.**

It was written from `infra/modules/cloud-run/main.tf`,
`infra/modules/cloud-run-job/main.tf`, `infra/modules/secrets/main.tf`,
`.github/workflows/deploy.yml`, `.github/workflows/terraform.yml`,
`.github/scripts/deploy/deploy-tagged.sh` and
`.github/scripts/deploy/find-placeholder-services.sh`. The reasons are in
the comments of those files and in the "What was learnt" section of the
[environment isolation plan](../plans/2026-09-18-environment-isolation-and-iap-plan.md).

## Who owns what

- **Terraform (`terraform.yml`) owns the template.** Environment variables,
  which secrets are mounted, the service account, scaling and probes. It
  applies on a merge to `main` that touches `infra/**`.
- **The deploy (`deploy.yml`) owns the image and the traffic.** It builds
  the images, puts a new revision on the service, tests it, and only then
  sends it traffic. It runs on a merge to `main` that touches anything but
  documentation.

The split is written into `lifecycle.ignore_changes` in
`modules/cloud-run`: Terraform ignores the container image, `traffic`,
`client` and `client_version`. The `traffic` block in that module only sets
the starting state when a service is first created.

## How a deploy puts a revision live

For the backend, `deploy-tagged.sh` does it in three steps:

1. **Deploy with no traffic, under a tag.** `gcloud run services update
   --image ... --no-traffic --tag rev-<sha>`. Live traffic stays on the
   previous revision.
2. **Smoke-test that revision at its own tagged URL.** Through the admin
   Cloud Run job, which can reach a service whose ingress is closed to the
   internet. A failure stops here and nothing has changed for users.
3. **Promote the tested revision by name.** `update-traffic
   --to-revisions=<revision>=100`, removing the tag in the same call, then
   polling until that revision carries all the traffic.

The frontend does not go through this script. Its step in `deploy.yml` is a
plain `gcloud run services update --image`, followed by the workflow's
public smoke test and security header check.

The backend promotes by name and never with `--to-latest`. "Latest" is whatever
revision is newest when the command lands, which can be one Terraform made
in the meantime and nobody tested.

## What follows from the split

### A Terraform change waits for the next deploy

When Terraform changes the template, Cloud Run makes a new revision. That
revision gets no traffic, because the deploy pinned traffic to the revision
it tested and Terraform does not manage `traffic`. The apply is green and
the old revision is still serving.

The change goes live when the next deploy builds a revision from the new
template and carries it through the smoke test. That is deliberate: the
plan calls it "the right way round".

**The deploy that runs on the same merge does not do it.** An `infra/`
only merge does start `deploy.yml`, but its paths filter reports that the
backend did not change, so the "Deploy backend" step is skipped and the run
finishes green without moving anything. This is recorded in the
[Amazon SES plan](../plans/2026-10-06-amazon-ses-email-plan.md): merging a
secret mount left the app on the previous night's revision until
`deploy.yml` was run by hand. A run started with `workflow_dispatch` treats
the backend as changed.

So after a Terraform change to a service:

1. Wait for the `Terraform` run on the merge to finish.
2. Run the `Deploy` workflow by hand from the Actions tab.
3. Check which revision is serving. It should be newer than the one the
   apply made:

   ```bash
   gcloud run services describe quill-backend-app \
     --project=<project> --region=europe-west2 \
     --format='yaml(status.traffic)'
   ```

### Each apply shows the service as changed

Terraform clears the revision name on every apply and Cloud Run picks a new
one, so each apply creates one spare revision that serves nothing. The
comment in `modules/cloud-run` gives the reason: ignoring the name instead
made Terraform send back the name of the revision the deploy had just made,
and any template change then failed with "Error 409: Revision named '...'
with different configuration already exists".

### Do not run the two at once

On 2026-09-23 an apply rewrote a service's traffic while a deploy was
between tagging a revision and looking the tag up. The tag vanished, the
deploy failed, and the untested revision went live. Terraform no longer
manages traffic, which closes that hole, but the procedural lesson is kept
in the plan: **check `deploy.yml` is idle before re-running
`terraform.yml`** by hand. Deploys already queue behind each other, through
the fixed `deploy` concurrency group.

### A new service starts on a placeholder

A Cloud Run service cannot be created without an image, and ours are not
built when Terraform runs, so every image variable starts as
`gcr.io/cloudrun/hello`. `find-placeholder-services.sh` makes the deploy
replace it whatever the paths filter decided. Without it, a commit that
touched neither side would report success and leave the hostname serving
Google's placeholder page.

The Cloud Run jobs follow the same rule in `modules/cloud-run-job`:
Terraform ignores their image, and the deploy points the transcode and
caption jobs at each build.

## Secrets

`modules/secrets` creates each Secret Manager secret as an empty
container. **Terraform never holds a value**, so none reaches its state. A
person adds the versions.

### Adding a secret

The order matters, because Cloud Run refuses a revision that mounts a
secret with no version.

1. Add the name to the secrets list in Terraform and merge. The apply
   creates the empty container.
2. Add the value as a version:

   ```bash
   printf '%s' "<value>" | gcloud secrets versions add <secret-name> \
     --project=<project> --data-file=-
   ```

   `printf`, not `echo`: `echo` adds a trailing newline, which becomes part
   of the secret.
3. Only then mount it on the service, in `infra/runtime-identities.tf`, and
   merge.
4. Run the `Deploy` workflow by hand and check the serving revision, as
   above.

A new environment needs every secret filled before its first apply. The
backend service fails to create while a mounted secret is empty, and the
error names the secret's path, not the missing value.

### Changing a secret's value

A mount reads `versions/latest`, but Cloud Run resolves that when a
container starts, not when the version is added. A running revision keeps
the value it started with.

1. Add the new version with `printf`, as above.
2. Run the `Deploy` workflow by hand. The new revision reads the new
   version when it starts.
3. Check the serving revision.

Do not add a version while an apply is running. The plan records a service
created sixteen seconds before a new version was added, which kept the old
one.

## Not recorded

Whether a Terraform change to the frontend service waits for a deploy in
the same way is not written down. Its deploy step does not pin traffic to a
named revision, and every case recorded in the plans is the backend.

Whether old secret versions are disabled or destroyed after a change is
not written down anywhere in the code or the plans.
