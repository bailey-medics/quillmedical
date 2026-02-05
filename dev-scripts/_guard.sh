#!/usr/bin/env bash
# Guard rails to prevent dev scripts from running in production

check_dev_environment() {
    # Check if we're in a development environment
    # This function should be sourced by all dev scripts

    local is_dev=0

    # Method 1: Check BACKEND_ENV environment variable (set in compose.dev.yml)
    if [ "${BACKEND_ENV:-}" = "development" ]; then
        is_dev=1
    fi

    # Method 2: Check if dev containers are actually running (not prod)
    # This checks if quill_backend container has BACKEND_ENV=development
    if command -v docker >/dev/null 2>&1; then
        if docker ps --filter "name=quill_backend" --format "{{.Names}}" 2>/dev/null | grep -q "quill_backend"; then
            local backend_env
            backend_env=$(docker exec quill_backend sh -c 'echo $BACKEND_ENV' 2>/dev/null || echo "")
            if [ "$backend_env" = "development" ]; then
                is_dev=1
            fi
        fi
    fi

    # Method 3: Check if API_BASE explicitly points to localhost
    if [ "${API_BASE:-}" = "http://localhost/api" ] || [ "${API_BASE:-}" = "http://localhost:80/api" ]; then
        is_dev=1
    fi

    # Method 4: If API_BASE not set, check for localhost pattern
    if [ -z "${API_BASE:-}" ]; then
        # Default API_BASE is localhost, so assume dev
        is_dev=1
    elif [[ "$API_BASE" == *"localhost"* ]] || [[ "$API_BASE" == *"127.0.0.1"* ]]; then
        is_dev=1
    fi

    if [ $is_dev -eq 0 ]; then
        echo ""
        echo "╔════════════════════════════════════════════════════════════╗"
        echo "║                    🚨 SAFETY CHECK FAILED 🚨                ║"
        echo "╚════════════════════════════════════════════════════════════╝"
        echo ""
        echo "This script is intended for DEVELOPMENT environments only."
        echo ""
        echo "Production environment detected. Aborting to prevent data loss."
        echo ""
        echo "If you're certain this is a development environment, ensure:"
        echo "  • BACKEND_ENV=development is set in the backend container"
        echo "  • API_BASE points to localhost (or is not set)"
        echo "  • Dev containers are running (docker ps | grep quill_backend)"
        echo ""
        echo "To bypass this check (NOT RECOMMENDED), set:"
        echo "  export DEV_SCRIPTS_ALLOW_PRODUCTION=1"
        echo ""
        exit 1
    fi
}

# Allow override for special cases (NOT RECOMMENDED)
if [ "${DEV_SCRIPTS_ALLOW_PRODUCTION:-}" != "1" ]; then
    check_dev_environment
fi
