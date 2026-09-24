# backend.tf — Remote state in GCS bucket
#
# The bucket lives in quill-medical-app, the project that holds everything
# shared. It moved there from quill-medical-production on 2026-09-24 so that
# project could be deleted; see Batch 10a of
# docs/docs/plans/2026-09-18-environment-isolation-and-iap-plan.md.
#
# Created by hand rather than by Terraform, because a bucket cannot hold the
# state that creates it. To recreate it:
#
#   gcloud storage buckets create gs://quill-medical-app-terraform-state \
#     --project=quill-medical-app --location=europe-west2 \
#     --uniform-bucket-level-access --public-access-prevention
#   gcloud storage buckets update gs://quill-medical-app-terraform-state \
#     --versioning
#   gcloud storage buckets add-iam-policy-binding \
#     gs://quill-medical-app-terraform-state \
#     --member=serviceAccount:github-actions@quill-medical-app.iam.gserviceaccount.com \
#     --role=roles/storage.objectAdmin
#
# Only the app environment's CI account is granted. State holds secrets in
# plain text (random_password.jwt_secret, the Cloud SQL password), so no
# other environment's account should read it.

terraform {
  backend "gcs" {
    bucket = "quill-medical-app-terraform-state"
    prefix = "terraform/state"
  }
}
