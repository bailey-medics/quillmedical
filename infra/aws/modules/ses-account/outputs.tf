output "dkim_tokens" {
  description = "The three DKIM selectors Amazon issued for the domain"
  value       = aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens
}

output "sender_arn" {
  description = "ARN of the user whose key sends mail"
  value       = aws_iam_user.sender.arn
}
