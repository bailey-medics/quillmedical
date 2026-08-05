# Plan: scope teaching environment — main-only deploys and env-scoped GCP secrets

## Problem

The `teaching` GitHub Environment has no protection rules, and the
`GCP_TEACHING_*` credentials are stored as **repository-level** secrets. That
means:

- Any workflow or job in the repository can read the teaching GCP credentials,
  not just the jobs that deploy to teaching (broad blast radius).
- Nothing restricts which branch can deploy to the teaching environment — a
  `workflow_dispatch` from any branch could target it.

## Goal

1. Restrict the `teaching` environment so it can only be deployed from `main`.
2. Move the three `GCP_TEACHING_*` secrets out of repository scope into the
   environment(s) that actually need them (true least-privilege).

Secret **values** are set via the `gh` CLI, never through Terraform, so they
never land in `terraform.tfstate`.

---

## Key constraint

`GCP_TEACHING_*` (`GCP_TEACHING_WIF_PROVIDER`, `GCP_TEACHING_SERVICE_ACCOUNT`,
`GCP_TEACHING_PROJECT_ID`) is consumed by **three** jobs in
`.github/workflows/deploy.yml`, two of which are not in the teaching
environment:

| Job                     | `environment:`                       | Uses `GCP_TEACHING_*`?                                |
| ----------------------- | ------------------------------------ | ----------------------------------------------------- |
| `build`                 | none                                 | Yes — pushes images to the teaching Artifact Registry |
| `deploy-teaching`       | `teaching`                           | Yes                                                   |
| `promote-to-production` | `production` (currently `if: false`) | Yes — reads the teaching source registry              |

Environment secrets are only visible to jobs that declare that exact
environment. So a naive "move" into the `teaching` environment would break the
`build` job.

The `promote-to-production` job is a special case. It currently authenticates
**twice** — once as the teaching service account (to read the teaching source
registry) and once as the production service account (to write to the
production registry and deploy Cloud Run). We do **not** want teaching
(non-clinical) secrets living in the `production` (clinical) environment. So:

- Add `environment: teaching` to the `build` job (brings it under the teaching
  env secrets and the main-only policy).
- Keep the `production` environment holding **only** `GCP_PROD_*` secrets.
- Grant the production service account cross-project read on the teaching
  Artifact Registry via IAM, and refactor `promote-to-production` to
  authenticate **only** as the production service account — so it no longer
  needs any teaching secrets at all.

---

## Decisions

- **True least-privilege**: add the environment to `build`, remove the
  repository-level teaching secrets.
- **Secret values via `gh secret set --env`** — never Terraform (keeps secrets
  out of `terraform.tfstate`).
- **Branch limit** via explicit `custom_branch_policies = true` plus a
  deployment policy with `branch_pattern = "main"` (avoids ambiguity between
  rulesets and classic branch protection).
- **Production environment holds only production secrets** — the promote job
  reads the teaching source registry via a cross-project IAM grant on the
  production service account, not via teaching secrets. No teaching secrets go
  into the `production` environment.
- **Promote-job refactor is deferred** until `promote-to-production` is
  re-enabled (it is `if: false` today), but is captured here so the teaching
  secrets are never reintroduced into the production environment.

---

## Phase 1: workflow change

`.github/workflows/deploy.yml` — add `environment: teaching` to the `build`
job. This is semantically correct (the job pushes to the teaching registry) and
brings the job under the main-only deployment branch policy.

---

## Phase 2: Terraform (new file `infra/github/environments.tf`)

Mirrors the provider and patterns already in
`infra/github/branch_rules.tf` (provider `integrations/github ~> 6.0`, owner via
`var.github_owner`, auth via `GITHUB_TOKEN`).

```hcl
resource "github_repository_environment" "teaching" {
  repository  = var.github_repository
  environment = "teaching"

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "teaching_main" {
  repository     = var.github_repository
  environment    = github_repository_environment.teaching.environment
  branch_pattern = "main"
}
```

The `teaching` environment already exists (created manually). If
`terraform apply` reports it already exists, import it first:

```bash
cd infra/github/
terraform import github_repository_environment.teaching quillmedical:teaching
```

Then:

```bash
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

---

## Phase 3: secret migration (`gh` CLI, ordered to avoid downtime)

1. Set the three teaching secrets at environment level (the environment already
   exists):

   ```bash
   gh secret set GCP_TEACHING_WIF_PROVIDER   --env teaching --repo bailey-medics/quillmedical
   gh secret set GCP_TEACHING_SERVICE_ACCOUNT --env teaching --repo bailey-medics/quillmedical
   gh secret set GCP_TEACHING_PROJECT_ID      --env teaching --repo bailey-medics/quillmedical
   ```

2. Merge the Phase 1 workflow change (`build` gets `environment: teaching`).
3. Apply the Phase 2 Terraform (teaching environment + main-only policy).
4. Verify a teaching deploy succeeds (both `build` and `deploy-teaching`
   authenticate to GCP).
5. **Only then** delete the repository-level teaching secrets:

   ```bash
   gh secret delete GCP_TEACHING_WIF_PROVIDER   --repo bailey-medics/quillmedical
   gh secret delete GCP_TEACHING_SERVICE_ACCOUNT --repo bailey-medics/quillmedical
   gh secret delete GCP_TEACHING_PROJECT_ID      --repo bailey-medics/quillmedical
   ```

> Note: the `production` environment keeps only its `GCP_PROD_*` secrets — no
> teaching secrets are added to it. The promote job's read of the teaching
> registry is handled by the cross-project IAM grant in Phase 4.

---

## Phase 4: production promote via cross-project IAM (deferred)

Deferred until `promote-to-production` is re-enabled (it is `if: false` today),
but captured so teaching secrets are never reintroduced into the production
environment.

1. Grant the **production** service account read access to the **teaching**
   Artifact Registry (cross-project), in the GCP Terraform (not the GitHub
   Terraform):

   ```hcl
   resource "google_artifact_registry_repository_iam_member" "prod_reads_teaching" {
     project    = var.teaching_project_id
     location   = var.gcp_region
     repository = "quill"
     role       = "roles/artifactregistry.reader"
     member     = "serviceAccount:${var.prod_deploy_service_account}"
   }
   ```

2. Refactor the `promote-to-production` job in `.github/workflows/deploy.yml`:
   - Remove the "Authenticate to GCP (teaching — source registry)" step and the
     `GCP_TEACHING_WIF_PROVIDER` / `GCP_TEACHING_SERVICE_ACCOUNT` references.
   - Authenticate **only** as the production service account; that single token
     can both read the teaching source repo (via the Phase 4 IAM grant) and
     write to the production repo.
   - Source the teaching project id for the `SRC_REGISTRY` path from a
     **non-secret** repository/organisation variable (e.g.
     `vars.TEACHING_PROJECT_ID`) rather than a `production`-scoped secret — the
     project id is an identifier, not a credential.

---

## Phase 5: documentation

Update the secrets inventory in `docs/docs/infrastructure/gcp.md` (the "Nine
repository secrets" note, ~line 158) to reflect that the teaching secrets are
now environment-scoped rather than repository-level.

---

## Verification

- `terraform plan` shows only the environment and deployment-policy additions.
- `gh secret list --env teaching` shows the three teaching secrets.
- A deploy run: `build` authenticates via environment secrets,
  `deploy-teaching` authenticates, teaching smoke test returns `200`.
- Confirm a `workflow_dispatch` started from a non-`main` branch is blocked on
  the environment jobs (expected behaviour).

---

## Further considerations

1. The main-only policy will **block `workflow_dispatch` runs started from a
   non-`main` branch** for `build` and `deploy-teaching`. Hotfixes are
   dispatched from `main` using the `manual_commit` input, so this should be
   fine — but confirm that matches the intended hotfix flow. Alternative: use
   `protected_branches = true` instead of a custom branch pattern.
2. **Sequencing is critical** — environment secrets and the workflow change must
   land _before_ deleting the repository-level secrets, or deploys break.
3. The `production` environment deliberately holds **only** `GCP_PROD_*`
   secrets. The promote job's need to read the teaching registry is met by a
   cross-project IAM grant (Phase 4), keeping non-clinical credentials out of
   the clinical environment.
4. Related follow-up (out of scope here): fully manage the `production`
   environment in Terraform and add required reviewers — already tracked in
   `docs/docs/plans/todo.md`.
