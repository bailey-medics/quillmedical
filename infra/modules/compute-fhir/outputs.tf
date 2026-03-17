# modules/compute-fhir/outputs.tf

output "instance_name" {
  description = "Compute Engine instance name"
  value       = google_compute_instance.fhir.name
}

output "internal_ip" {
  description = "Internal IP of the FHIR + EHRbase VM"
  value       = google_compute_instance.fhir.network_interface[0].network_ip
}

output "service_account_email" {
  description = "Service account email for the VM"
  value       = google_service_account.fhir_vm.email
}
