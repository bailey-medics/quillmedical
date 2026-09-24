# dns.tf — the quill-medical.com zone
#
# The zone GoDaddy, the registrar, delegates quill-medical.com to. It lived
# in quill-medical-production, created by hand, until Batch 10a of
# docs/docs/plans/2026-09-18-environment-isolation-and-iap-plan.md moved it
# here so that project could be deleted. quill-medical-app holds everything
# shared, so the zone is held by exactly one environment: set
# manage_dns_zone in that environment's tfvars and nowhere else.
#
# Creating this zone changes nothing on its own. Traffic only reaches it once
# the nameservers at GoDaddy are changed to the ones it is assigned, which
# are in the dns_zone_name_servers output. Until then it serves no one, so
# every record can be checked against the live zone first.
#
# The TTLs are copied from the zone this replaces, record by record. The
# email records carry long ones (60 hours) because they almost never change;
# the web records carry five minutes, so a load balancer move takes effect
# quickly.

locals {
  dns_zone_count = var.manage_dns_zone ? 1 : 0
  dns_apex       = "${var.domain}."
}

resource "google_dns_managed_zone" "primary" {
  count = local.dns_zone_count

  project     = var.project_id
  name        = "quill-medical-com"
  dns_name    = local.dns_apex
  description = "quill-medical.com: the site, the app, and the Proton Mail and Resend email records."
  visibility  = "public"

  # Losing the zone would take the site and every inbound email down until
  # a new one was created and GoDaddy repointed at its new nameservers, since
  # a recreated zone is not guaranteed the same nameserver set.
  lifecycle {
    prevent_destroy = true
  }
}

# The email records are provider-issued values, DKIM hosts and keys among
# them, copied verbatim; they are not words.
# cspell:disable
locals {
  # "TYPE:name", with name relative to the apex and empty for the apex
  # itself => the record set.
  dns_records = {
    # ---------- The site ----------
    "A:" = {
      type    = "A"
      ttl     = 300
      rrdatas = [module.load_balancer.lb_ip]
    }
    "A:app" = {
      type    = "A"
      ttl     = 300
      rrdatas = [module.load_balancer.lb_ip]
    }
    "CNAME:www" = {
      type    = "CNAME"
      ttl     = 300
      rrdatas = [local.dns_apex]
    }

    # ---------- Inbound mail: Proton Mail ----------
    "MX:" = {
      type    = "MX"
      ttl     = 216000
      rrdatas = ["10 mail.protonmail.ch.", "20 mailsec.protonmail.ch."]
    }
    # Two values in one record set, because DNS allows one TXT set per name:
    # Proton's ownership check, and the SPF policy saying Proton may send as
    # this domain.
    "TXT:" = {
      type = "TXT"
      ttl  = 216000
      rrdatas = [
        "\"protonmail-verification=9261d6f80e1d327d54efdf492097df6887616709\"",
        "\"v=spf1 include:_spf.protonmail.ch ~all\"",
      ]
    }
    "TXT:_dmarc" = {
      type    = "TXT"
      ttl     = 216000
      rrdatas = ["\"v=DMARC1; p=quarantine\""]
    }
    "CNAME:protonmail._domainkey" = {
      type    = "CNAME"
      ttl     = 216000
      rrdatas = ["protonmail.domainkey.d3q5dkq3hmfucgklk5pzuidomopir5gg3hbdemxyuzp4znnk7wn6a.domains.proton.ch."]
    }
    "CNAME:protonmail2._domainkey" = {
      type    = "CNAME"
      ttl     = 216000
      rrdatas = ["protonmail2.domainkey.d3q5dkq3hmfucgklk5pzuidomopir5gg3hbdemxyuzp4znnk7wn6a.domains.proton.ch."]
    }
    "CNAME:protonmail3._domainkey" = {
      type    = "CNAME"
      ttl     = 216000
      rrdatas = ["protonmail3.domainkey.d3q5dkq3hmfucgklk5pzuidomopir5gg3hbdemxyuzp4znnk7wn6a.domains.proton.ch."]
    }

    # ---------- Outbound mail: Resend, sending through Amazon SES ----------
    # A public key, not a secret: receivers fetch it to check Resend's
    # signatures.
    "TXT:resend._domainkey" = {
      type    = "TXT"
      ttl     = 18000
      rrdatas = ["\"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCp4HenKERJfTpIszemf3uDmRd6NchibA7Yd9LqIQ7IRY3w4NPXaWm5KBBjJtQRkfqrR/+ffdt0Aw/ocDdXufWAQXKqvqKzBklwD+Jd0UBMh3waD2UW7/rA7Oxlru8NrlTgOnNS7afCHyhYTCHharwgZXYsqsmtYaFoHuTSCSeD2wIDAQAB\""]
    }
    "MX:send" = {
      type    = "MX"
      ttl     = 18000
      rrdatas = ["10 feedback-smtp.eu-west-1.amazonses.com."]
    }
    "TXT:send" = {
      type    = "TXT"
      ttl     = 18000
      rrdatas = ["\"v=spf1 include:amazonses.com ~all\""]
    }

    # Not carried over: staging.quill-medical.com, which pointed at
    # 35.186.223.130, an address that stopped answering when staging's load
    # balancer was destroyed.
  }
}
# cspell:enable

resource "google_dns_record_set" "primary" {
  for_each = var.manage_dns_zone ? local.dns_records : {}

  project      = var.project_id
  managed_zone = google_dns_managed_zone.primary[0].name
  name         = split(":", each.key)[1] == "" ? local.dns_apex : "${split(":", each.key)[1]}.${local.dns_apex}"
  type         = each.value.type
  ttl          = each.value.ttl
  rrdatas      = each.value.rrdatas
}
