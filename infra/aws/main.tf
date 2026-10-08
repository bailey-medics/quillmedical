# main.tf – Amazon SES in London, in the two AWS accounts that send email
#
# What Quill has in AWS is small: one verified domain, a few SES settings
# and one user whose key sends mail, in each of two accounts. It was made
# by hand on 6 and 7 October 2026 and is adopted here, in imports.tf, so
# that a change to it is a reviewed pull request and not a console click.
# See docs/docs/plans/2026-10-06-amazon-ses-email-plan.md, Phase 7.
#
# Usage: `just terraform-aws` (alias tf-aws), from any checkout, after
# `just al` and `just al management`. It plans, asks, then applies. A
# person applies this and CI never does; see
# .github/workflows/aws-terraform.yml for why.
#
# Not here, on purpose:
#   - The access keys. A key Terraform makes is written into its state in
#     plain text. Keys are made by hand and go straight into GCP Secret
#     Manager (production) or backend/.env (development).
#   - The DNS records SES needs. They are in ../dns.tf, with the rest of
#     the zone. The `dkim_tokens` outputs here are what those must match.
#   - The organisation: its accounts and the policy that allows London
#     only. That needs the management account and is a later step.

terraform {
  required_version = ">= 1.15.0"

  # Beside the GCP and GitHub state in the same bucket, under its own
  # prefix. State is read and written with the caller's own Google
  # sign-in (`just gl`).
  backend "gcs" {
    bucket = "quill-medical-app-terraform-state"
    prefix = "terraform/aws"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# Each provider names its account, and refuses any other. The profiles
# are the ones `just al` signs in; a sign-in that landed in the wrong
# account, which has happened, fails here before anything is read.
provider "aws" {
  alias               = "app"
  profile             = var.app_profile
  region              = var.region
  allowed_account_ids = [var.app_account_id]
}

# The development account has no sign-in of its own. It is reached from
# the management account, through the role every account made by the
# organisation is given. Named here and not left to a CLI profile that
# chains the two: the provider cannot follow such a profile when the
# first sign-in is `aws login`.
provider "aws" {
  alias               = "dev"
  profile             = var.management_profile
  region              = var.region
  allowed_account_ids = [var.dev_account_id]

  assume_role {
    role_arn     = "arn:aws:iam::${var.dev_account_id}:role/OrganizationAccountAccessRole"
    session_name = "terraform-aws"
  }
}

# ---------- App production ----------
module "app" {
  source    = "./modules/ses-account"
  providers = { aws = aws.app }

  domain             = var.domain
  mail_from_domain   = "mail.${var.domain}"
  region             = var.region
  user_name          = "quill-backend-ses"
  policy_name        = "quill-backend-ses-london"
  policy_description = "Send email and manage newsletter contacts through SES, in eu-west-2 only"

  # Read before each newsletter send, so somebody whose address bounced
  # or who pressed "spam" is marked unsubscribed in Quill too.
  may_read_suppression_list = true
}

# ---------- Development ----------
# Still in the SES sandbox, which is right for it: it can write only to
# addresses verified in the account. Sandbox or production is not a
# setting Terraform has; Amazon grants it on request.
module "dev" {
  source    = "./modules/ses-account"
  providers = { aws = aws.dev }

  domain             = var.domain
  mail_from_domain   = "mail.${var.domain}"
  region             = var.region
  user_name          = "quill-backend-ses-dev"
  policy_name        = "quill-backend-ses-london"
  policy_description = "Send email through SES, in eu-west-2 only (development)"

  may_read_suppression_list = false
}
