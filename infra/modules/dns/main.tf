# modules/dns/main.tf — Cloud DNS zone + records

resource "google_dns_managed_zone" "zone" {
  project     = var.project_id
  name        = "quill-zone"
  dns_name    = "${var.domain}."
  description = "DNS zone for ${var.domain}"
}
