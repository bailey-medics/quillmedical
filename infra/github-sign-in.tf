# github-sign-in.tf - how GitHub Actions signs in to Google Cloud
#
# GitHub hands each workflow run a signed token that names its repository
# and branch. The pool `github-pool` and its provider `github-provider`
# swap that token for a Google one, with no key stored anywhere. Which
# Google account a run may then act as is a binding on that account.
#
# quillmedical's own workflows sign in through this provider. So do the
# teaching repositories and the framework repositories, which act as
# `content-sync` to start their sync job.
#
# All of it was made by hand: the pool, the provider and the teaching
# repositories' bindings on 23 September 2026, and the framework
# repositories' place in the condition and their bindings on 5 November
# 2026. It is imported below, so the first apply changes nothing. See
# Phase 17 of docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.
#
# CI may not change the pool or the provider. Its apply account,
# github-actions, holds roles/iam.workloadIdentityPoolViewer, which reads
# them and changes nothing; roles/iam.workloadIdentityPoolAdmin was refused
# because it lets its holder make new ways to sign in to the project (see
# owl.tf). So a change to the condition, such as a new framework
# repository, shows in the pull request's plan as an update to
# github-provider, and a person makes that one change by hand before the
# pull request merges:
#
#   gcloud iam workload-identity-pools providers update-oidc github-provider \
#     --workload-identity-pool=github-pool --location=global \
#     --project=quill-medical-app \
#     --attribute-condition="<the new condition, from the plan>"
#
# Otherwise the apply after the merge fails on the provider, and every
# apply after it. The binding on content-sync is a grant on a service
# account, which github-actions may make, so it needs no hand step.

locals {
  # The teaching repositories, which sign in from any branch. The same
  # three are protected in infra/github/teaching_rulesets.tf, which is a
  # separate Terraform root and cannot read this list.
  teaching_repositories = [
    "bailey-medics/eoeeta-teaching",
    "bailey-medics/respiratory-teaching",
    "bailey-medics/eoeeta-teaching-testing",
  ]

  # Every repository that may act as content-sync: the teaching
  # repositories, and each framework repository App production reads.
  # The two testing repositories, quill-medical-framework-testing and
  # quill-medical-2-framework-testing, are not here, because they are on no
  # framework list and start no sync.
  content_sync_repositories = concat(
    local.teaching_repositories,
    keys(local.framework_repositories),
  )

  # A framework repository signs in from main only, because only a merged
  # framework may start the sync. A branch push runs validate and
  # check-protection, which sign in to nothing.
  github_sign_in_condition = join(" || ", [
    "assertion.repository in [${join(", ", [
      for repository in concat(["bailey-medics/quillmedical"], local.teaching_repositories) :
      "'${repository}'"
    ])}]",
    "(assertion.repository in [${join(", ", [
      for repository in keys(local.framework_repositories) : "'${repository}'"
    ])}] && assertion.ref == 'refs/heads/main')",
  ])

  content_sync_account = "projects/${var.project_id}/serviceAccounts/content-sync@${var.project_id}.iam.gserviceaccount.com"

  # The bindings that were made by hand, and are imported. Fixed, not
  # read from the lists above: a repository added to a list later has no
  # binding to import yet, and an import of one that does not exist stops
  # the plan. The new one is created instead.
  content_sync_bindings_made_by_hand = [
    "bailey-medics/eoeeta-teaching",
    "bailey-medics/eoeeta-teaching-testing",
    "bailey-medics/respiratory-teaching",
    "bailey-medics/general-clinical-skills-quill-medical-framework",
    "bailey-medics/gloucestershire-radiotherapy-record-framework",
    "bailey-medics/royal-united-hospitals-bath-sact-passport-framework",
    "bailey-medics/uk-sact-board-prescribing-framework",
  ]
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions Pool"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.repo_ref"   = "assertion.repository + '@' + assertion.ref"
  }
  attribute_condition = local.github_sign_in_condition

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Each repository may act as content-sync, whichever branch it signed in
# from. The condition above is what holds a framework repository to main.
resource "google_service_account_iam_member" "content_sync_repository" {
  for_each = toset(local.content_sync_repositories)

  service_account_id = local.content_sync_account
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${each.key}"
}

import {
  to = google_iam_workload_identity_pool.github
  id = "projects/${var.project_id}/locations/global/workloadIdentityPools/github-pool"
}

import {
  to = google_iam_workload_identity_pool_provider.github
  id = "projects/${var.project_id}/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
}

import {
  for_each = toset(local.content_sync_bindings_made_by_hand)

  to = google_service_account_iam_member.content_sync_repository[each.key]
  id = "${local.content_sync_account} roles/iam.workloadIdentityUser principalSet://iam.googleapis.com/projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${each.key}"
}
