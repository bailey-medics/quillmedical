# ---------------------------------------------------------------------------
# Which repositories may read the organisation's Actions secrets
# ---------------------------------------------------------------------------
#
# Only the repository list. The secret's value is set with `gh secret set`
# and never reaches Terraform, its state, or this public repository.
#
# SLACK_WEBHOOK_URL is the incoming webhook every pipeline posts its
# failures to. Anybody holding it can post to the channel, so only the
# repositories that send a message may read it, never ALL.

locals {
  # The two testing repositories are protected beside the other framework
  # repositories in framework_rulesets.tf, but their callers pass no
  # secrets, so they are left out here.
  repositories_without_secrets = [
    "quill-medical-framework-testing",
    "quill-medical-2-framework-testing",
  ]

  slack_webhook_repositories = concat(
    [var.github_repository],
    local.teaching_repos,
    [
      for repository in local.framework_repos : repository
      if !contains(local.repositories_without_secrets, repository)
    ],
  )
}

# GitHub names the repositories by number, not by name.
data "github_repository" "slack_webhook" {
  for_each = toset(local.slack_webhook_repositories)

  full_name = "${var.github_owner}/${each.key}"
}

resource "github_actions_organization_secret_repositories" "slack_webhook_url" {
  secret_name = "SLACK_WEBHOOK_URL"

  selected_repository_ids = [
    for repository in data.github_repository.slack_webhook : repository.repo_id
  ]
}
