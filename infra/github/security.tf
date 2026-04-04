# security.tf — GitHub repository security settings
#
# Enables secret scanning and push protection on both repositories.
# Secret scanning detects accidentally committed credentials (API keys,
# tokens, passwords) and push protection blocks the push before the
# secret reaches the remote.
#
# Prerequisites:
#   - For private repositories, GitHub Advanced Security must be enabled
#     on the organisation billing plan.
#   - Each existing repository must be imported into Terraform state before
#     applying:
#
#       cd infra/github/
#       terraform import github_repository.quillmedical quillmedical
#       terraform import github_repository.question_bank quill-question-bank
#
# The lifecycle block ensures Terraform only manages the security settings
# and does not drift on other repository configuration managed via the UI.

# ---------------------------------------------------------------------------
# Quill Medical — main repository
# ---------------------------------------------------------------------------

resource "github_repository" "quillmedical" {
  name = var.github_repository

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }
    secret_scanning_push_protection {
      status = "enabled"
    }
  }

  lifecycle {
    ignore_changes = [
      description,
      homepage_url,
      visibility,
      has_issues,
      has_projects,
      has_wiki,
      has_downloads,
      has_discussions,
      topics,
      auto_init,
      archived,
      archive_on_destroy,
      is_template,
      allow_merge_commit,
      allow_squash_merge,
      allow_rebase_merge,
      allow_auto_merge,
      delete_branch_on_merge,
      pages,
      template,
      vulnerability_alerts,
      web_commit_signoff_required,
    ]
  }
}

# ---------------------------------------------------------------------------
# Question bank — data repository
# ---------------------------------------------------------------------------

resource "github_repository" "question_bank" {
  name = var.question_bank_repository

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }
    secret_scanning_push_protection {
      status = "enabled"
    }
  }

  lifecycle {
    ignore_changes = [
      description,
      homepage_url,
      visibility,
      has_issues,
      has_projects,
      has_wiki,
      has_downloads,
      has_discussions,
      topics,
      auto_init,
      archived,
      archive_on_destroy,
      is_template,
      allow_merge_commit,
      allow_squash_merge,
      allow_rebase_merge,
      allow_auto_merge,
      delete_branch_on_merge,
      pages,
      template,
      vulnerability_alerts,
      web_commit_signoff_required,
    ]
  }
}
