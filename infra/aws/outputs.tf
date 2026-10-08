# outputs.tf - what the DNS zone has to match
#
# The three DKIM selectors for each account are CNAME records in
# ../dns.tf, written there by hand. If Amazon ever issues new ones, these
# change and those must follow.

output "app_dkim_tokens" {
  description = "DKIM selectors of the App production account, as in ../dns.tf"
  value       = module.app.dkim_tokens
}

output "dev_dkim_tokens" {
  description = "DKIM selectors of the development account, as in ../dns.tf"
  value       = module.dev.dkim_tokens
}
