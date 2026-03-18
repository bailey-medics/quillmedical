# outputs.tf — Root-level outputs

output "lb_ip" {
  description = "Global load balancer IP address (point DNS A records here)"
  value       = module.load_balancer.lb_ip
}

output "backend_url" {
  description = "Cloud Run backend URL (direct, bypasses LB)"
  value       = module.cloud_run_backend.service_url
}

output "frontend_url" {
  description = "Cloud Run frontend URL (direct, bypasses LB)"
  value       = module.cloud_run_frontend.service_url
}

output "auth_db_connection" {
  description = "Auth database Cloud SQL connection name"
  value       = module.cloud_sql_auth.connection_name
}

output "fhir_vm_ip" {
  description = "FHIR + EHRbase VM internal IP (prod/staging only)"
  value       = var.enable_fhir ? module.compute_fhir[0].internal_ip : null
}

output "vpc_connector_id" {
  description = "Serverless VPC connector ID"
  value       = module.networking.vpc_connector_id
}
