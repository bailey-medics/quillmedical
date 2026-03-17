# backend.tf — Remote state in GCS bucket
#
# Before first use:
#   1. Create the bucket:    gsutil mb -p quill-medical-production gs://quill-medical-terraform-state
#   2. Enable versioning:    gsutil versioning set on gs://quill-medical-terraform-state
#   3. Initialise Terraform: terraform init

terraform {
  backend "gcs" {
    bucket = "quill-medical-terraform-state"
    prefix = "terraform/state"
  }
}
