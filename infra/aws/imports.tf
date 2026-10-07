# imports.tf – adopt what was made by hand
#
# Everything below existed before this directory did. An import block
# tells Terraform the resource is already there, so the first apply
# records it and creates nothing. Once applied these blocks do nothing;
# they stay as the record of where each resource came from.

locals {
  app_policy_arn = "arn:aws:iam::${var.app_account_id}:policy/quill-backend-ses-london"
  dev_policy_arn = "arn:aws:iam::${var.dev_account_id}:policy/quill-backend-ses-london"
}

# ---------- App production ----------
import {
  to = module.app.aws_sesv2_email_identity.domain
  id = var.domain
}

import {
  to = module.app.aws_sesv2_email_identity_mail_from_attributes.domain
  id = var.domain
}

import {
  to = module.app.aws_sesv2_account_suppression_attributes.account
  id = var.app_account_id
}

import {
  to = module.app.aws_iam_user.sender
  id = "quill-backend-ses"
}

import {
  to = module.app.aws_iam_policy.sender
  id = local.app_policy_arn
}

import {
  to = module.app.aws_iam_user_policy_attachment.sender
  id = "quill-backend-ses/${local.app_policy_arn}"
}

# ---------- Development ----------
import {
  to = module.dev.aws_sesv2_email_identity.domain
  id = var.domain
}

import {
  to = module.dev.aws_sesv2_email_identity_mail_from_attributes.domain
  id = var.domain
}

import {
  to = module.dev.aws_sesv2_account_suppression_attributes.account
  id = var.dev_account_id
}

import {
  to = module.dev.aws_iam_user.sender
  id = "quill-backend-ses-dev"
}

import {
  to = module.dev.aws_iam_policy.sender
  id = local.dev_policy_arn
}

import {
  to = module.dev.aws_iam_user_policy_attachment.sender
  id = "quill-backend-ses-dev/${local.dev_policy_arn}"
}
