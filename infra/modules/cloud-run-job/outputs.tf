# modules/cloud-run-job/outputs.tf

output "job_name" {
  description = "The name of the Cloud Run Job"
  value       = google_cloud_run_v2_job.job.name
}

output "job_id" {
  description = "The fully-qualified ID of the Cloud Run Job"
  value       = google_cloud_run_v2_job.job.id
}
