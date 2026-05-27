# modules/cloud-sql/outputs.tf

output "instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.instance.name
}

output "connection_name" {
  description = "Cloud SQL connection name (project:region:instance)"
  value       = google_sql_database_instance.instance.connection_name
}

output "private_ip" {
  description = "Private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.instance.private_ip_address
}

output "database_name" {
  description = "Database name"
  value       = google_sql_database.database.name
}

output "database_user" {
  description = "Database user name"
  value       = google_sql_user.user.name
}
