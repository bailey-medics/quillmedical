# Backend Architecture

## Overview

The Quill Medical backend is the application server that handles all the business logic, data processing, and communication between the web interface and the databases. It ensures patient data is stored securely and can be accessed by authorised users.

## What Does It Do?

### Core Functions

**Application Server** - Processes requests and manages business logic

- Handles all communication from the web interface
- Applies business rules and workflows
- Ensures data is valid before storing it
- Provides automatic documentation of all functions

### Healthcare Data Standards

#### FHIR (Fast Healthcare Interoperability Resources)

- **Purpose**: Stores patient demographics and administrative information
- **What it holds**: Patient names, dates of birth, addresses, contact details
- **Why it matters**: International healthcare standard for data exchange

#### OpenEHR

- **Purpose**: Stores clinical documents and detailed health records
- **What it holds**: Clinical letters, medical notes, observations, patient history
- **Why it matters**: Specialised standard for long-term health records

### Web Server

**Caddy** Web Server

- Routes web traffic to the right services
- Manages HTTPS security certificates automatically
- Serves the web application files
- Balances load across multiple servers if needed

## Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                        Client Browser                       │
│                (React TypeScript PWA Frontend)              │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                      Caddy Web Server                       │
│                    (Reverse Proxy / TLS)                    │
└─────┬────────────────────────────────────┬──────────────────┘
      │                                    │
      │ /api/*                             │ /*
      ↓                                    ↓
┌──────────────────┐              ┌──────────────┐
│     FastAPI      │              │   Frontend   │
│     Backend      │              │    Static    │
│    (Python)      │              │    Files     │
└───┬────┬────┬────┘              └──────────────┘
    │    │    │
    │    │    │
    │    │    └──────────────────────┐
    │    └─────────┐                 │
    │              ↓                 ↓
    │      ┌─────────────┐    ┌─────────────┐
    │      │   EHRbase   │    │  HAPI FHIR  │
    │      │  (OpenEHR)  │    │   Server    │
    │      │   (Java)    │    │   (Java)    │
    │      └──────┬──────┘    └──────┬──────┘
    │             │                  │
    ↓             ↓                  ↓
┌──────────┐ ┌──────────┐    ┌──────────┐
│PostgreSQL│ │PostgreSQL│    │PostgreSQL│
│  (Auth)  │ │(EHRbase) │    │  (FHIR)  │
└──────────┘ └──────────┘    └──────────┘
```

## How Data Flows Through the System

### Managing Patient Information

1. **Creating a new patient**: Web interface → Application server → FHIR system → Database
2. **Viewing patient details**: Web interface → Application server → FHIR system → Returns patient information
3. **Updating patient details**: Web interface → Application server → FHIR system → Updates database

The application server communicates with the FHIR system to manage patient information including names, dates of birth, gender, addresses, and contact details.

### Managing Clinical Letters

1. **Creating a letter**: Web interface → Application server → OpenEHR system → Database
2. **Viewing a letter**: Web interface → Application server → OpenEHR system → Returns letter
3. **Listing all letters**: Web interface → Application server → OpenEHR system → Returns list of letters

The application server communicates with the OpenEHR system to create, retrieve, and manage clinical letters and other health records for patients.

## Available Functions

All functions are organised under the `/api` prefix:

### System Health

- **Health Check** (`GET /api/health`): Check availability of all services (FHIR, EHRbase, authentication database)
  - Returns overall system status ("healthy" or "degraded")
  - Provides detailed service availability for each dependency
  - Used by frontend during startup to detect FHIR readiness
  - Safety-critical: Tests actual patient data access (`/Patient?_count=1`) not just metadata

### User Authentication

- Register a new account (`POST /api/auth/register`)
- Log in with credentials and optional TOTP (`POST /api/auth/login`)
- Refresh your session (`POST /api/auth/refresh`)
- Log out securely (`POST /api/auth/logout`)
- View your profile (`GET /api/auth/me`)
- Change password (`POST /api/auth/change-password`)
- Request password reset (`POST /api/auth/forgot-password`)
- Reset password with token (`POST /api/auth/reset-password`)
- Set up TOTP two-factor authentication (`POST /api/auth/totp/setup`, `/verify`, `/disable`)
- List organisations for registration (`GET /api/auth/organizations`)

### Patient Management

- **View list of all patients** (`GET /api/patients`): Returns patient array plus `fhir_ready` flag
  - `fhir_ready: true` means FHIR server is fully ready to serve patient data
  - `fhir_ready: false` means FHIR is still initializing (search indexes building)
  - Atomic response eliminates race conditions between health check and data fetch
- **Verify patient** (`POST /api/patients/verify`): Check a patient exists in FHIR
- Create new patient record (`POST /api/patients`)
- View single patient (`GET /api/patients/{id}`)
- Update patient demographics (`PATCH /api/patients/{id}`)
- Upsert demographics (`PUT /api/patients/{id}/demographics`)
- View demographics (`GET /api/patients/{id}/demographics`)
- View patient metadata (`GET /api/patients/{id}/metadata`): Activation status
- Deactivate patient (`POST /api/patients/{id}/deactivate`)
- Activate patient (`POST /api/patients/{id}/activate`)
- View shared organisations (`GET /api/patients/{id}/shared-organisations`)

### Clinical Letters

- Create a new clinical letter for a patient
- View all letters for a patient
- Retrieve a specific letter

### Messaging

- **Create conversation** (`POST /api/conversations`): Start a new patient conversation with initial message
  - Writes first message to FHIR as source of truth
  - Creates SQL projection for fast reads
  - Automatically links shared organisations between creator and patient
- **List conversations** (`GET /api/conversations`): List conversations for the current user
  - Filterable by status and patient
  - Shows unread counts per conversation
- **View conversation** (`GET /api/conversations/{id}`): Get conversation with all messages
  - Marks conversation as read for the current user
- **Send message** (`POST /api/conversations/{id}/messages`): Send a message in a conversation
  - Supports message amendments via `amends_id`
- **Manage participants**: Add participants (`POST`), self-join as staff (`POST .../join`), list participants (`GET`)
- **Mark as read** (`POST /api/conversations/{id}/read`): Mark conversation as read for the current user
- **Update status** (`PATCH /api/conversations/{id}`): Update conversation status (new, active, resolved, closed)
- **Patient conversations** (`GET /api/patients/{id}/conversations`): List all conversations for a specific patient

### User Management (Admin)

- **List users** (`GET /api/users`): List users, filterable by patient shared access
- **Get user** (`GET /api/users/{id}`): Get user details including CBAC fields
- **Create user** (`POST /api/users`): Create user with CBAC configuration
- **Update user** (`PATCH /api/users/{id}`): Update user details
- **Link patient** (`PATCH /api/users/{id}/link-patient`): Link user to FHIR patient

### Organisations (Admin)

- **List organisations** (`GET /api/organizations`): List all organisations
- **Create organisation** (`POST /api/organizations`): Create new organisation
- **View organisation** (`GET /api/organizations/{id}`): Get organisation with staff/patient lists
- **Update organisation** (`PUT /api/organizations/{id}`): Update organisation details
- **Manage membership**: Add/remove staff and patients
- **List features** (`GET /api/organizations/{id}/features`): List organisation feature flags
- **Toggle feature** (`PUT /api/organizations/{id}/features/{key}`): Enable or disable a feature

### CBAC (Competency-Based Access Control)

- **View competencies** (`GET /api/cbac/my-competencies`): Get current user’s resolved competencies
- **Update competencies** (`PATCH /api/cbac/my-competencies`): Update user's additional/removed competencies (note: admin gate not yet enforced — see code TODO)

### External Access

- **Invite external user** (`POST /api/patients/{id}/invite-external`): Generate invite link for external HCPs or patient advocates
- **Accept invite** (`POST /api/accept-invite`): Register or grant access via invite token
- **Revoke access** (`DELETE /api/patients/{id}/external-access/{user_id}`): Revoke external access
- **List grants** (`GET /api/patients/{id}/external-access`): List external access grants

### Push Notifications

- **Subscribe** (`POST /api/push/subscribe`): Register a push subscription for the current browser
- **Send test** (`POST /api/push/send-test`): Send a test notification to all subscribers (development only)

### Teaching (feature-gated)

All teaching routes are under `/api/teaching` and require the `teaching` feature to be enabled on the user's organisation.

- **List question banks** (`GET /api/teaching/question-banks`)
- **Get question bank** (`GET /api/teaching/question-banks/{bank_id}`)
- **Start assessment** (`POST /api/teaching/assessments`)
- **Assessment history** (`GET /api/teaching/assessments/history`)
- **Get assessment** (`GET /api/teaching/assessments/{id}`)
- **Current item** (`GET /api/teaching/assessments/{id}/current`)
- **Submit answer** (`POST /api/teaching/assessments/{id}/answer`)
- **Update answer** (`PUT /api/teaching/assessments/{id}/answer/{answer_id}`)
- **Complete assessment** (`POST /api/teaching/assessments/{id}/complete`)
- **Download certificate** (`GET /api/teaching/assessments/{id}/certificate`)
- **Educator routes** (require `manage_teaching_content` competency): item management, validation, sync, results, settings

## What Data is Stored Where

### Patient Demographics (FHIR System)

Basic patient information stored in the FHIR system:

- Patient names and identifiers
- Gender and date of birth
- Contact information (phone, email)
- Addresses
- Emergency contacts

### Clinical Records (OpenEHR System)

Medical documentation stored in the OpenEHR system:

- Clinical letters and correspondence
- Consultation notes
- Treatment plans and care records
- Medical history and observations

### User Accounts (Application Database)

User login and permission information:

- Usernames and email addresses
- Encrypted passwords (Argon2 hashing)
- System permissions (patient, staff, admin, superadmin)
- Roles (e.g. Clinician)
- CBAC configuration (base profession, additional/removed competencies)
- Two-factor authentication settings (TOTP)
- Organisation membership (staff and patient associations)
- External patient access grants

## Security

### How Users Log In

1. **Creating an account**: User provides username/email and password → Password is encrypted → Account created
2. **Logging in**: User enters credentials → System checks encrypted password → Creates secure session
3. **Staying logged in**: Short session tokens (15 minutes) automatically refresh for convenience
4. **Extra security**: Users can enable two-factor authentication using authenticator apps

### Access Control

- **User roles**: Users are assigned roles (patient, clinician, admin) that control their permissions
- **Function protection**: Each function checks user permissions before allowing access
- **Additional security**: Important operations require extra verification tokens

For example, only users with the clinician role can create clinical letters, and they must provide additional security verification.

### Data Security

- **Stored data**: Database encryption protects data at rest
- **Transmitted data**: HTTPS encryption protects data in transit
- **Passwords**: Strong encryption with random salt values
- **Session tokens**: Cryptographically signed tokens
- **Secrets**: Configuration stored in environment variables, never in code

## Development Setup

### What You Need

To work on the application, developers need:

- Docker for running all services together
- Python 3.13+ for backend development
- Node.js for frontend development

### Getting Started

One command starts the entire application with all services:

- Web application (accessible at <http://localhost:8080>)
- Application server with documentation (<http://localhost:8080/api/docs>)
- FHIR server for patient data
- OpenEHR server for clinical records
- Database
- Web server

### Development Services

The development environment runs these services:

- **Application server**: Main business logic (port 8000)
- **Database**: User authentication (port 5432)
- **FHIR Server**: Patient demographics (port 8081) with database (port 5433)
- **OpenEHR Server**: Clinical documents (port 8082) with database (port 5434)
- **Web Server**: Entry point for all requests (port 8080)

## Testing

Automated tests ensure the application works correctly:

- **Patient data tests**: Verify patient information is handled correctly
- **FHIR integration tests**: Ensure communication with patient data system works
- **Authentication tests**: Validate login and access control

Tests run automatically during development and before deploying updates.

## Database Changes

When the structure of stored data needs to change, the system uses migration tools that:

- **Detect changes automatically**: Compares current structure with desired structure
- **Track versions**: Maintains history of all database changes
- **Apply safely**: Updates production databases without losing data
- **Allow rollback**: Can undo changes if problems occur

This ensures databases stay consistent across development, testing, and production environments.

## Deployment

### Running in Production

The application deploys using containers. The production configuration:

- Uses optimised builds for better performance
- Runs continuously in the background
- Includes health monitoring for all services

### Configuration Requirements

Production needs several secure settings:

- **Database credentials**: Secure usernames and passwords
- **Security keys**: Secret values for session management
- **Service addresses**: URLs for FHIR and OpenEHR systems
- **HTTPS settings**: Domain name and administrator email for security certificates

These values are stored securely and never included in code.

## Monitoring

### Application Logs

All services record activity that can be used for:

- Finding and fixing problems
- Tracking system activity
- Auditing access and changes
- Analysing performance

Logs can be viewed in real-time or searched for specific events.

### Health Monitoring

The `/api/health` endpoint reports overall system status and individual service availability:

- **Application server**: Reports overall health status ("healthy" or "degraded")
- **FHIR Server**: Tests actual patient data access with `GET /Patient?_count=1`
  - 200 OK response (even with 0 patients) means FHIR is truly ready
  - Other status codes mean FHIR still initializing or has errors
  - Critical: HAPI FHIR can return metadata before ready to serve resources
- **EHRbase Server**: Verifies clinical records system is accessible
- **Auth Database**: Implicitly healthy if backend can respond

**Frontend Integration**: Frontend polls `/health` every 5 seconds during startup until FHIR becomes available. Displays "Database is initialising" message to users during FHIR startup window (typically 30-60 seconds after deployment).

**Safety-Critical**: Health check design prevents false "No patients" display during FHIR initialization. See Hazard-0019 (FHIR health check false negative) and Hazard-0046 (Backend starts before FHIR ready) for mitigation details.

Health checks can be monitored automatically to detect and alert on service failures.

## Learn More

- **[FHIR Documentation](fhir/)** - Patient demographics storage system
- **[OpenEHR Documentation](openehr/)** - Clinical data storage system
- **[Application Framework](fastapi/)** - Core application framework
- **[Web Server](caddy/)** - Web server configuration
