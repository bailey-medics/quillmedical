# Justfile for common Docker Compose workflows

set shell := ["/bin/sh", "-cu"]

# Run dev stack (base + dev overrides)
# Usage: just up
alias up := up-dev

up-dev:
	docker compose -f compose.yml -f compose.dev.yml up

# Rebuild images and start dev stack
reup:
	docker compose -f compose.yml -f compose.dev.yml up --build

# Stop and remove containers
Down:
	docker compose down
