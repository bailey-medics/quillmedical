# modules/load-balancer/outputs.tf

output "lb_ip" {
  description = "Global load balancer IP address"
  value       = google_compute_global_address.lb_ip.address
}

output "url_map_id" {
  description = "URL map resource ID"
  value       = google_compute_url_map.https.id
}
