# modules/networking/outputs.tf

output "vpc_id" {
  description = "VPC network ID"
  value       = google_compute_network.vpc.id
}

output "vpc_name" {
  description = "VPC network name"
  value       = google_compute_network.vpc.name
}

output "subnet_id" {
  description = "Private subnet ID"
  value       = google_compute_subnetwork.private.id
}

output "subnet_name" {
  description = "Private subnet name"
  value       = google_compute_subnetwork.private.name
}

output "vpc_connector_id" {
  description = "Serverless VPC connector ID for Cloud Run"
  value       = google_vpc_access_connector.connector.id
}

output "private_vpc_connection" {
  description = "Private VPC connection (for Cloud SQL dependency)"
  value       = google_service_networking_connection.private_vpc_connection
}
