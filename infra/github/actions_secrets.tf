# ---------------------------------------------------------------------------
# Which repositories may read the organisation's Actions secrets
# ---------------------------------------------------------------------------
#
# Only the repository list. The secret's value is set with `gh secret set`
# and never reaches Terraform, its state, or this public repository.
#
# SLACK_WEBHOOK_URL is the incoming webhook every pipeline posts its
# failures to. Anybody holding it can post to the channel, so it is visible
# to the repositories that send a message and no others, never ALL. The
# list was set by hand on 5 November 2026, when the four framework
# repositories were added to it, and is imported below, so the first apply
# changes nothing. See Phase 17 of
# docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.

locals {
  # quill-medical-framework-testing is protected beside the other framework
  # repositories in framework_rulesets.tf, but its caller passes no
  # secrets, so it is left out here.
  repositories_without_secrets = ["quill-medical-framework-testing"]

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

import {
  to = github_actions_organization_secret_repositories.slack_webhook_url
  id = "SLACK_WEBHOOK_URL"
}
