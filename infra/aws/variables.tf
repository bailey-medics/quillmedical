# variables.tf – inputs for the AWS root

# The account numbers have no default and are not in a tfvars file: this
# repository is public. `just terraform-aws` reads them from
# backend/.env, which is gitignored, and passes them as TF_VAR_*.
variable "app_account_id" {
  description = "Number of the AWS account that sends App production's email"
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.app_account_id))
    error_message = "An AWS account number is twelve digits."
  }
}

variable "dev_account_id" {
  description = "Number of the AWS account that sends development's email"
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.dev_account_id))
    error_message = "An AWS account number is twelve digits."
  }
}

variable "app_profile" {
  description = "AWS CLI profile signed in to the App production email account"
  type        = string
  default     = "quill-emails"
}

variable "management_profile" {
  description = "AWS CLI profile signed in to the management account, from which the development account is reached"
  type        = string
  default     = "quill-management"
}

variable "region" {
  description = "The one region SES is used in. London: every SES resource is per region, and one made elsewhere is email data outside the UK."
  type        = string
  default     = "eu-west-2"

  validation {
    condition     = var.region == "eu-west-2"
    error_message = "Email stays in London (eu-west-2). The site promises the UK."
  }
}

variable "domain" {
  description = "The domain email is sent from"
  type        = string
  default     = "quill-medical.com"
}

variable "management_account_id" {
  description = "Number of the organisation's management account"
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.management_account_id))
    error_message = "An AWS account number is twelve digits."
  }
}

variable "london_only_policy_id" {
  description = "Id of the service control policy that allows London only, as AWS issued it. Needed to adopt the policy; an id, not a secret."
  type        = string
  default     = "p-fmj00ti8"
}

variable "identity_account_id" {
  description = "Number of the account that holds the sign-in directory"
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.identity_account_id))
    error_message = "An AWS account number is twelve digits."
  }
}
