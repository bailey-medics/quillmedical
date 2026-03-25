# modules/load-balancer/outputs.tf

output "lb_ip" {
  description = "Global load balancer static IP address"
  value       = google_compute_global_address.lb_ip.address
}

output "ssl_certificate_id" {
  description = "Google-managed SSL certificate ID"
  value       = google_compute_managed_ssl_certificate.cert.id
}

output "security_policy_id" {
  description = "Cloud Armor security policy ID"
  value       = google_compute_security_policy.waf.id
}
