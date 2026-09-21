#!/usr/bin/env bash
# Reports which Cloud Run services are still running the placeholder image,
# so the deploy can replace them whatever the paths filter decided.
#
# Usage: find-placeholder-services.sh <project> <region> <environment> [service...]
#
# Writes `<service>=true|false` to $GITHUB_OUTPUT for each service, and the
# same as prose to stdout. Services default to backend and frontend.
#
# Why this exists: every image variable in this repository starts as
# `gcr.io/cloudrun/hello`, because a Cloud Run service cannot be created
# without naming an image and ours are not built at `terraform apply` time.
# CI replaces it on the first deploy that touches the service. The paths
# filter in the deploy workflow answers "did the frontend change in this
# commit", which is the right question for an environment already running
# the current build and the wrong one for an environment that has never had
# a real deploy: a commit touching neither skips both, reports success, and
# leaves the hostname serving Google's placeholder page.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "find-placeholder-services"

# Prints the image a Cloud Run service is running, or nothing if it cannot be
# read. Isolated so tests can stub it.
#
# A failure here prints nothing, which reads as "not a placeholder" below. That
# is deliberate: a transient API error should not force a deploy nobody asked
# for, and a service that genuinely does not exist is Terraform's to create.
service_image() {
  local service="$1" project="$2" region="$3"

  gcloud run services describe "$service" \
    --project="$project" \
    --region="$region" \
    --format='value(spec.template.spec.containers[0].image)' 2>/dev/null || true
}

# True when an image is the Cloud Run placeholder. Matches on the name rather
# than an exact tag: the tfvars say `gcr.io/cloudrun/hello:latest`, but a
# digest or a registry mirror is the same placeholder by another spelling.
is_placeholder() {
  case "${1:-}" in
    *cloudrun/hello*) return 0 ;;
    *) return 1 ;;
  esac
}

main() {
  local project="${1:-}" region="${2:-}" environment="${3:-}"

  if [ -z "$project" ] || [ -z "$region" ] || [ -z "$environment" ]; then
    error "Usage: find-placeholder-services.sh <project> <region> <environment> [service...]"
    exit 1
  fi
  shift 3

  local services=("$@")
  if [ "${#services[@]}" -eq 0 ]; then
    services=(backend frontend)
  fi

  local svc image
  for svc in "${services[@]}"; do
    image="$(service_image "quill-${svc}-${environment}" "$project" "$region")"

    if is_placeholder "$image"; then
      log "${svc}: on the placeholder, forcing a deploy"
      printf '%s=true\n' "$svc" >> "${GITHUB_OUTPUT:-/dev/stdout}"
    else
      log "${svc}: ${image:-no image found}"
      printf '%s=false\n' "$svc" >> "${GITHUB_OUTPUT:-/dev/stdout}"
    fi
  done
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
