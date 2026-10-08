# ses-account - everything one AWS account needs to send Quill's email
#
# A verified domain, where its bounces come back, what Amazon refuses to
# send to, and one user who may send from London and nothing else.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# ---------- The domain ----------
# Easy DKIM: Amazon holds the keys and rotates them, and the domain
# proves itself with three CNAME records, which are in the DNS zone.
resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.domain

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# The MAIL FROM name, where bounces come back. Without it the envelope
# sender is amazonses.com and SPF does not line up with the domain,
# which DMARC wants. USE_DEFAULT_VALUE: if the MX record is ever
# missing, mail still leaves, from Amazon's own name, and is not refused.
resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity         = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain       = var.mail_from_domain
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

# ---------- Who Amazon will not send to ----------
# An address that hard-bounces, or whose owner presses "spam", goes on
# the account's suppression list and is refused from then on. Both
# reasons, always: sending again to either is what gets an account
# paused. Quill reads this list before each newsletter send.
resource "aws_sesv2_account_suppression_attributes" "account" {
  suppressed_reasons = ["BOUNCE", "COMPLAINT"]
}

# ---------- The user whose key sends mail ----------
# The key itself is not here: see ../../main.tf. Path "/" and no tags,
# as it was made.
resource "aws_iam_user" "sender" {
  name = var.user_name
}

data "aws_iam_policy_document" "sender" {
  # The region condition is the point. A stolen key cannot send from, or
  # read anything in, any region but London.
  statement {
    sid       = "SendFromLondonOnly"
    effect    = "Allow"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.region]
    }
  }

  # Reads, and can change nothing: not add to the list, not remove from
  # it. Only where the account sends newsletters.
  dynamic "statement" {
    for_each = var.may_read_suppression_list ? [1] : []

    content {
      sid       = "ReadBouncesAndComplaintsLondonOnly"
      effect    = "Allow"
      actions   = ["ses:ListSuppressedDestinations"]
      resources = ["*"]

      condition {
        test     = "StringEquals"
        variable = "aws:RequestedRegion"
        values   = [var.region]
      }
    }
  }
}

resource "aws_iam_policy" "sender" {
  name   = var.policy_name
  policy = data.aws_iam_policy_document.sender.json

  # IAM cannot change a policy's description: a new one replaces the
  # policy. So this is the wording each was made with, even where the
  # policy has since been narrowed and the wording is out of date.
  description = var.policy_description
}

resource "aws_iam_user_policy_attachment" "sender" {
  user       = aws_iam_user.sender.name
  policy_arn = aws_iam_policy.sender.arn
}
