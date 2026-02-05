# Development Scripts

This directory contains scripts for managing development data and testing.

## 🛡️ Safety Guards

All scripts include safety checks to prevent accidental execution in production environments.

### How It Works

Scripts check for development environment using multiple methods:

1. **Container Environment Check**: Verifies `BACKEND_ENV=development` in running backend container
2. **API Base URL**: Checks if `API_BASE` points to localhost
3. **Localhost Detection**: Verifies API endpoint is on localhost/127.0.0.1

### Production Safety

In production:

- Ensure `BACKEND_ENV=production` in containers
- Use production domain (not localhost) for `API_BASE`

If all checks fail, scripts will abort with an error message.

## Available Scripts

### `create-5-patients.sh`

Creates 5 random test patients with realistic data:

- Random names
- Random dates of birth (1940-2005)
- Random genders
- Random NHS numbers (10 digits)
- Random MRNs (hospital IDs)

**Usage:**

```bash
./dev-scripts/create-5-patients.sh
```

**Requirements:**

- Backend must be running
- User with Clinician role
- `curl` and `jq` installed

### `delete-all-patient-data.sh`

Permanently deletes all patients from the FHIR server.

**Usage:**

```bash
./dev-scripts/delete-all-patient-data.sh
```

**Safety:**

- Requires typing "yes" to confirm
- Requires authentication
- Shows count before deletion
- Protected by dev environment guards

**Requirements:**

- Backend must be running
- User with Clinician role
- `curl` and `jq` installed

## Override (Not Recommended)

To bypass safety checks (for special cases only):

```bash
export DEV_SCRIPTS_ALLOW_PRODUCTION=1
./dev-scripts/script-name.sh
```

⚠️ **WARNING**: Only use this if you fully understand the consequences.
