#!/usr/bin/env bash
# Guard script to ensure dev scripts only run in development environments

check_dev_environment() {
    # Check if BACKEND_ENV is set to development
    if [ "${BACKEND_ENV:-}" != "development" ]; then
        echo "ERROR: This script can only be run in development environments."
        echo "BACKEND_ENV is set to: ${BACKEND_ENV:-not set}"
        echo ""
        echo "To run this script, ensure you're in a development environment where"
        echo "BACKEND_ENV=development is set (e.g., via Docker Compose dev environment)."
        exit 1
    fi
}

# Call the check immediately when sourced
check_dev_environment
