# security.tf — GitHub repository security settings
#
# Enables secret scanning and push protection on the quillmedical repository.
# Secret scanning detects accidentally committed credentials (API keys,
# tokens, passwords) and push protection blocks the push before the
# secret reaches the remote.
#
# Also manages delete_branch_on_merge: branches are deleted on the remote as
# soon as their PR merges, so a merged branch can't be left lying around to
# hit the rebase-after-merge trap documented in .claude/rules/ci.md. This
# only removes the remote branch — deleting a stale local copy is still on
# each developer (`git fetch --prune` or `git branch -d`).
#
# Prerequisites:
#   - For private repositories, GitHub Advanced Security must be enabled
#     on the organisation billing plan.
#   - The repository must be imported into Terraform state before applying:
#
#       cd infra/github/
#       terraform import github_repository.quillmedical quillmedical
#
# The lifecycle block ensures Terraform only manages the security settings
# and does not drift on other repository configuration managed via the UI.

# ---------------------------------------------------------------------------
# Quill Medical — main repository
# ---------------------------------------------------------------------------

resource "github_repository" "quillmedical" {
  name = var.github_repository

  delete_branch_on_merge = true

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
      pages,
      template,
      vulnerability_alerts,
      web_commit_signoff_required,
    ]
  }
}
