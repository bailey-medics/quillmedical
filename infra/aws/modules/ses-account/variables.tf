variable "domain" {
  description = "The domain email is sent from"
  type        = string
}

variable "mail_from_domain" {
  description = "The subdomain bounces come back to"
  type        = string
}

variable "region" {
  description = "The one region the sending user may act in"
  type        = string
}

variable "user_name" {
  description = "Name of the IAM user whose key sends mail"
  type        = string
}

variable "policy_name" {
  description = "Name of the policy that says what that user may do"
  type        = string
}

variable "policy_description" {
  description = "The policy's description. IAM cannot change one in place, so an imported policy keeps the wording it was made with."
  type        = string
}

variable "may_read_suppression_list" {
  description = "Whether the sending user may read who Amazon refuses to send to"
  type        = bool
  default     = false
}
