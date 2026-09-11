# modules/passport-storage/main.tf — clinician passport repositories
#
# One bucket holding every passport: each as a `git bundle` object, with its
# evidence blobs as objects beside it. Cloud Run has no durable disk, so this
# is where the record actually lives in a deployed environment.
#
# See docs/docs/plans/2026-09-08-clinician-passport-plan.md, Phase 2.
#
# Deliberately not the `cloud-storage` module, which exists for teaching
# images. That module carries a lifecycle rule deleting objects at 365 days,
# and on a versioned bucket a Delete action against a live object archives it:
# the bytes survive as a noncurrent version, but the live object is gone, so
# the application reads the passport as absent. Recoverable by hand, and still
# an outage on a professional record. Teaching images tolerate that because CI
# re-uploads them; a passport has no such source to be restored from.
#
# So there is no lifecycle rule here at all, and that is the point of a
# separate module rather than a flag on the shared one: nothing expires, ever,
# and there is no configuration anybody could set that would make it.

resource "google_storage_bucket" "passports" {
  project  = var.project_id
  name     = "quill-passports-${var.environment}"
  location = var.region

  # Never force-destroyable, in any environment. The shared module allows it
  # outside prod, which is right for regenerable content and wrong here: a
  # staging passport is still somebody's record of assessed competence, and
  # `terraform destroy` should refuse rather than take it with the bucket.
  force_destroy = false

  uniform_bucket_level_access = true

  # No passport is ever public. Enforced rather than merely unset, so an
  # `allUsers` binding cannot be added later by hand or by accident.
  public_access_prevention = "enforced"

  # The backstop for a history rewrite. The application refuses any
  # non-fast-forward update, so a rewrite cannot arrive through it — but a
  # bundle replaced directly in the bucket would leave no trace without this.
  # Object versions are that trace, and nothing removes them.
  versioning {
    enabled = true
  }
}

# ---------- The backend reads and writes passports ----------
# `objectAdmin` rather than `objectViewer`: the backend creates bundles,
# replaces them on every write, and uploads evidence blobs. It never deletes,
# but the role is the smallest standard one covering create and overwrite.
#
# Explicit, because a Cloud Run service account does not inherit object-level
# access from project editor — the symptom being a 403 on
# `storage.objects.list` at the first request. See the Cloud Storage IAM note
# in docs/docs/infrastructure/gcp.md, which asks for exactly this binding to
# live in Terraform rather than being applied by hand on each new environment.
resource "google_storage_bucket_iam_member" "backend" {
  bucket = google_storage_bucket.passports.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.service_account_email}"
}
