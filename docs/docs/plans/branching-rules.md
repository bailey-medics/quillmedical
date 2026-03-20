# Branch protection rules — Terraform plan

## Status: complete — applied 20 March 2026

## Goal

Manage GitHub branch protection for `quillmedical` using Terraform GitHub
provider Rulesets (not classic branch protection). This supports the DCB 0129
clinical safety case by providing auditable, version-controlled enforcement of
the branching model.

## Branch model

| Pattern         | Policy                                          |
| --------------- | ----------------------------------------------- |
| `main`          | Protected — PR only, no force push, no deletion |
| `clinical-live` | Protected — PR only, no force push, no deletion |
| `release/**`    | Protected — PR only, no force push, no deletion |
| `feature/**`    | Direct push allowed                             |
| `hotfix/**`     | Direct push allowed                             |
| Any other name  | Rejected at creation                            |

## Terraform resources

1. **`github_repository_ruleset.protected_branches`** — targets `main`,
   `clinical-live`, `release/**`. Enforces: pull request required (1 approval,
   stale reviews dismissed), no force push, no branch deletion.
2. **`github_repository_ruleset.branch_naming`** — targets all branches
   _except_ the protected set. Enforces: branch name must match
   `^(feature|hotfix)/.+`.

## File layout

- `infra/github/branch_rules.tf` — provider config, variables, and both
  rulesets in a single self-contained file.

## Design decisions

- **Separate directory** (`infra/github/`) rather than adding the GitHub
  provider to the existing GCP root module. The GCP infra uses a GCS backend
  and GCP-specific variables; GitHub config is orthogonal and should have its
  own `terraform init`/`apply` lifecycle.
- **No bypass actors** — rulesets apply to everyone including repository
  admins to satisfy clinical safety audit requirements.
- **`required_approving_review_count = 1`** — solo developer, but the rule
  ensures at least one review (can be self-review via GitHub settings) before
  merge, creating an auditable approval record.

## Steps

- [x] Read existing Terraform layout and variables
- [x] Write `infra/github/branch_rules.tf`
- [x] Create `infra/github/terraform.tfvars`
- [x] Run `terraform init` (GitHub provider v6.11.1 installed)
- [x] Fix repo name: `quillmedical` not `quill-medical`
- [x] Authenticate with `gh auth login` and `export GITHUB_TOKEN=$(gh auth token)`
- [x] Run `terraform plan` and `terraform apply` — 2 resources created
- [x] Update this plan with learnings

## Variables and tfvars

The file is self-contained in `infra/github/` — no changes needed to the
existing GCP `infra/variables.tf`. You need:

### Variables (already declared in `branch_rules.tf`)

| Variable            | Type     | Default             | Description                  |
| ------------------- | -------- | ------------------- | ---------------------------- |
| `github_owner`      | `string` | _(none — required)_ | GitHub org or user namespace |
| `github_repository` | `string` | `"quillmedical"`    | Repository name              |

### terraform.tfvars (create at `infra/github/terraform.tfvars`)

```hcl
github_owner      = "bailey-medics"
github_repository = "quillmedical"   # optional — matches default
```

### Authentication

Set the `GITHUB_TOKEN` environment variable before running `terraform apply`:

```bash
export GITHUB_TOKEN="ghp_..."
```

Or use a GitHub App installation token for CI.

## Applying

```bash
cd infra/github/
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

## Learnings

- The existing Terraform root (`infra/`) is GCP-only with a GCS backend and
  GCP-specific providers. Adding the GitHub provider there would mix concerns
  and require everyone running GCP infra to also have a GitHub token. A
  separate `infra/github/` directory with its own `terraform init` lifecycle
  keeps the two independent.
- GitHub Rulesets use `refs/heads/` prefixed ref patterns in `conditions`,
  and `~ALL` as a special token meaning "all branches". The exclude list in
  the naming ruleset carves out the protected branches so they aren't subject
  to the `feature/*/hotfix/*` naming requirement.
- In GitHub provider v6.x, `deletion` and `non_fast_forward` are **boolean
  attributes** (`= true`), not empty blocks (`{}`). The older block syntax
  causes "Unsupported block type" errors.
- No remote backend is configured for this module yet. For a solo developer
  local state is fine initially; a GCS backend block can be added later if
  needed.
- The actual GitHub repo name is `quillmedical` (no hyphen), not
  `quill-medical`. Fixed in both `branch_rules.tf` default and
  `terraform.tfvars`.
- `terraform init` completed successfully — provider `integrations/github`
  v6.11.1 was installed.
- `terraform plan`/`apply` requires a `GITHUB_TOKEN` env var. The `gh` CLI
  is installed but not authenticated; running `gh auth login` interactively
  in a terminal is the easiest way to get a token, then
  `export GITHUB_TOKEN=$(gh auth token)`.
- Applied successfully on 20 March 2026. Ruleset IDs: `protected-branches`
  = 14145768, `branch-naming-convention` = 14145767. Both active on the
  `quillmedical` repository.
- The `repo` scope on the `gh` CLI token is sufficient for creating
  rulesets — `admin:org` is not required for personal/org repos where you
  are an admin.
