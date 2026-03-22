#!/bin/bash
# startup.sh — Compute Engine startup script for FHIR + EHRbase VM
# This is a Terraform templatefile; variables are substituted at plan time.
set -euo pipefail

# Container-Optimised OS (COS) ships with Docker but not Docker Compose.
# COS has a read-only root filesystem — /usr/local/ is not writable.
# Install Docker Compose plugin to the root user's home directory instead.
COMPOSE_PLUGIN_DIR="/root/.docker/cli-plugins"
if ! docker compose version &>/dev/null; then
  mkdir -p "$COMPOSE_PLUGIN_DIR"
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o "$COMPOSE_PLUGIN_DIR/docker-compose"
  chmod +x "$COMPOSE_PLUGIN_DIR/docker-compose"
fi

# Use /var/lib/quill for config — /opt/ is read-only on COS
QUILL_DIR="/var/lib/quill"
mkdir -p "$QUILL_DIR"

# Fetch secrets from Secret Manager
FHIR_DB_PASSWORD=$(gcloud secrets versions access latest --secret="${fhir_db_password_secret}" 2>/dev/null)
EHRBASE_DB_PASSWORD=$(gcloud secrets versions access latest --secret="${ehrbase_db_password_secret}" 2>/dev/null)
EHRBASE_API_PASSWORD=$(gcloud secrets versions access latest --secret="${ehrbase_api_password_secret}" 2>/dev/null)
EHRBASE_ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret="${ehrbase_admin_password_secret}" 2>/dev/null)

# Write env file for Docker Compose (not in version control)
cat > "$QUILL_DIR/.env" <<EOF
FHIR_DB_HOST=${fhir_db_host}
FHIR_DB_PASSWORD=$FHIR_DB_PASSWORD
EHRBASE_DB_HOST=${ehrbase_db_host}
EHRBASE_DB_PASSWORD=$EHRBASE_DB_PASSWORD
EHRBASE_API_PASSWORD=$EHRBASE_API_PASSWORD
EHRBASE_ADMIN_PASSWORD=$EHRBASE_ADMIN_PASSWORD
SYSTEM_ALLOW_TEMPLATE_OVERWRITE=false
EOF

# Pull the compose file from the repo (or use a pre-baked one)
# For now, use a minimal inline compose that starts FHIR + EHRbase
cat > "$QUILL_DIR/docker-compose.yml" <<'COMPOSE'
services:
  fhir:
    image: hapiproject/hapi:latest
    container_name: fhir
    environment:
      - spring.datasource.url=jdbc:postgresql://$${FHIR_DB_HOST}:5432/fhir
      - spring.datasource.username=fhir
      - spring.datasource.password=$${FHIR_DB_PASSWORD}
      - spring.datasource.driverClassName=org.postgresql.Driver
      - spring.jpa.properties.hibernate.dialect=ca.uhn.fhir.jpa.model.dialect.HapiFhirPostgresDialect
    ports:
      - "8080:8080"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/fhir/metadata"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  ehrbase:
    image: ehrbase/ehrbase:latest
    container_name: ehrbase
    environment:
      - DB_URL=jdbc:postgresql://$${EHRBASE_DB_HOST}:5432/ehrbase
      - DB_USER=ehrbase
      - DB_PASS=$${EHRBASE_DB_PASSWORD}
      - SECURITY_AUTHTYPE=BASIC
      - SECURITY_AUTHUSER=ehrbase-user
      - SECURITY_AUTHPASSWORD=$${EHRBASE_API_PASSWORD}
      - SECURITY_AUTHADMINUSER=ehrbase-admin
      - SECURITY_AUTHADMINPASSWORD=$${EHRBASE_ADMIN_PASSWORD}
      - SYSTEM_ALLOW_TEMPLATE_OVERWRITE=$${SYSTEM_ALLOW_TEMPLATE_OVERWRITE}
    ports:
      - "8081:8080"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/ehrbase/rest/status"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
COMPOSE

cd "$QUILL_DIR"
docker compose --env-file .env up -d
