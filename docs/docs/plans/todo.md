# Project to-do list

## Branch protection

- [ ] Increase `required_approving_review_count` from 0 to 1 (or higher) in
      `infra/github/branch_rules.tf` when a second developer joins the team.
      Currently set to 0 because a solo developer cannot approve their own PRs.
      The PR requirement still creates an auditable change record for DCB 0129.
