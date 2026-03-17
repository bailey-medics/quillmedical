# backend.tf — Remote state in GCS bucket
#
# Before first use:
#   1. Create the bucket:    gsutil mb -p <admin-project> gs://quill-terraform-state
#   2. Enable versioning:    gsutil versioning set on gs://quill-terraform-state
#   3. Initialise Terraform: terraform init

terraform {
  backend "gcs" {
    bucket = "quill-terraform-state"
    prefix = "terraform/state"
  }
}
