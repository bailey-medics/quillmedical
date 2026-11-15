# organisation.tf - the organisation, its accounts, the rule that keeps
# every one of them in London, and the rule that keeps the email
# accounts to email
#
# Adopted from what was made by hand, so that a new account, or a change
# to what an account may do, is a reviewed pull request.
#
# Not here, on purpose: what AWS manages itself. The organisation was
# made by AWS's own sign-up, which keeps policies of its own on the root
# (ManagedAccountSecurityControlPolicy, the Budgets spend-limit ones,
# ManagedAccountResourceControlPolicy), runs sign-in through an Identity
# Center it owns, and holds its roles under /managed/, where its policy
# stops anybody else changing them. Terraform holding those would be
# refused, or would fight it.

# The management account: policies and new accounts. Nothing runs in it.
provider "aws" {
  alias               = "management"
  profile             = var.management_profile
  region              = var.region
  allowed_account_ids = [var.management_account_id]
}

# Read as well as managed below. Reading is how each account's email
# address is found without writing it down: see `accounts`.
data "aws_organizations_organization" "existing" {
  provider = aws.management
}

# ---------- The organisation ----------
# All features, which is what allows policies at all, and the two kinds
# of policy in use. Which AWS services are trusted with the organisation
# is left alone: AWS's own sign-up turns those on and off.
resource "aws_organizations_organization" "this" {
  provider = aws.management

  feature_set = "ALL"
  enabled_policy_types = [
    "RESOURCE_CONTROL_POLICY",
    "SERVICE_CONTROL_POLICY",
  ]

  # Deleting the organisation would cut every account loose.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [aws_service_access_principals]
  }
}

# ---------- The accounts ----------
# Four, all directly under the root. To add one, make it in the console,
# put its number in backend/.env, and add it here with an import: the
# check below fails a plan until every account is listed.
locals {
  accounts = {
    # Policies and new accounts. Nothing runs in it.
    management = {
      name = "Quill Medical Superadmin"
      id   = var.management_account_id
    }
    # The sign-in directory.
    identity = {
      name = "Quill Medical ID"
      id   = var.identity_account_id
    }
    # SES for App production.
    emails_app = {
      name = "Quill Medical Emails App"
      id   = var.app_account_id
    }
    # SES for development, in the sandbox.
    emails_dev = {
      name = "Quill Medical Emails Dev"
      id   = var.dev_account_id
    }
  }

  # Each account's email address, as AWS holds it. Looked up and not
  # written here: this repository is public, and the address is where
  # an account's root sign-in and its password resets go.
  account_emails = {
    for account in data.aws_organizations_organization.existing.accounts :
    account.id => account.email
  }
}

resource "aws_organizations_account" "this" {
  provider = aws.management
  for_each = local.accounts

  name      = each.value.name
  email     = local.account_emails[each.value.id]
  parent_id = data.aws_organizations_organization.existing.roots[0].id

  # Removing an account from here must never remove it from AWS.
  # Terraform refuses to plan it. The three ignored settings are read
  # only when an account is made, and an adopted one has none recorded.
  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      role_name,
      iam_user_access_to_billing,
      create_govcloud,
    ]
  }
}

import {
  for_each = local.accounts
  to       = aws_organizations_account.this[each.key]
  id       = each.value.id
}

# An account made in the console and not added above would otherwise go
# unnoticed. This warns on every plan and apply until the two lists agree.
#
# A warning, not a failure: a `check` block that does not hold is reported
# and stops nothing. That is enough here, because this Terraform is
# applied by a person, who reads the plan. The opposite mistake, an
# account listed above that the organisation does not hold, does fail:
# the lookup of its email address has nothing to find.
check "every_account_is_listed" {
  assert {
    condition = (
      toset(data.aws_organizations_organization.existing.accounts[*].id)
      == toset([for account in local.accounts : account.id])
    )
    error_message = "The organisation holds an account that organisation.tf does not list, or lists one it does not hold."
  }
}

# ---------- London only ----------
# Nothing of Quill's can be made anywhere but London.
#
# AWS made this policy when the organisation's advanced features were
# switched on. Its name and description are AWS's and are kept, so this
# stays the same policy.
#
# Three statements, in policies/london-only.json:
#   - RegionFloor refuses everything outside eu-west-2, us-east-1 and
#     us-west-2.
#   - UsEast1Partitional and UsWest2Partitional then refuse everything
#     in those two American regions except the global services AWS runs
#     from them. us-east-1 allows signing in, billing, support and a few
#     read-only console calls. us-west-2 allows signing in and read-only
#     key lookups.
resource "aws_organizations_policy" "london_only" {
  provider = aws.management

  name        = "AdvancedModeRegionRestrictionSecurityControlPolicy"
  description = "AdvancedModeRegionRestrictionSecurityControlPolicy"
  type        = "SERVICE_CONTROL_POLICY"
  content     = file("${path.module}/policies/london-only.json")

  # Deleting it would let any account use any region.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_organizations_policy_attachment" "london_only" {
  provider = aws.management

  policy_id = aws_organizations_policy.london_only.id
  target_id = data.aws_organizations_organization.existing.roots[0].id

  lifecycle {
    prevent_destroy = true
  }
}

# ---------- Email only ----------
# The London-only policy above says where an account may work. This one
# says what the two email accounts may do there: send email through SES,
# and little else. Without it, a leaked key or an IAM grant made too
# wide could start servers or store data in London, and the only thing
# in the way would be IAM itself.
#
# One statement, in policies/email-only.json: in eu-west-2, refuse
# everything except SES, the sign-in and token calls that reach an
# account (signin, sts), and the read-only console calls that show
# SES's sending figures, quotas and health. IAM, billing and the
# organisation are reached through us-east-1, so this does not touch
# them.
#
# Attached to the two email accounts, not the root. The identity
# account holds the sign-in directory, which AWS runs for itself, and
# a rule written for email would break it. The management account is
# never bound by a service control policy, wherever it is attached.
#
# Using a new AWS service in either email account means adding it here
# first, or AWS refuses it. That is the point.
resource "aws_organizations_policy" "email_only" {
  provider = aws.management

  name        = "QuillEmailAccountsEmailOnly"
  description = "In London, the email accounts may use SES and nothing else but sign-in and read-only console calls."
  type        = "SERVICE_CONTROL_POLICY"
  content     = file("${path.module}/policies/email-only.json")
}

resource "aws_organizations_policy_attachment" "email_only" {
  provider = aws.management
  for_each = toset(["emails_app", "emails_dev"])

  policy_id = aws_organizations_policy.email_only.id
  target_id = local.accounts[each.key].id
}
