# modules/dns/outputs.tf

output "zone_name" {
  description = "Cloud DNS managed zone name"
  value       = google_dns_managed_zone.zone.name
}

output "name_servers" {
  description = "Name servers to set at GoDaddy"
  value       = google_dns_managed_zone.zone.name_servers
}

output "dns_name" {
  description = "DNS name of the zone"
  value       = google_dns_managed_zone.zone.dns_name
}
