# Backend Architecture

## Overview

The Quill Medical backend is a modern, standards-based healthcare application built with Python and FastAPI. It integrates multiple healthcare data standards and technologies to provide a robust, interoperable platform for managing patient data and clinical information.

## Technology Stack

### Core Framework

**[FastAPI](fastapi/)** - Modern Python web framework

- High-performance async API framework
- Automatic API documentation (Swagger UI, ReDoc)
- Type-safe request/response handling with Pydantic
- Built-in security utilities and dependency injection

### Healthcare Data Standards

**[FHIR](fhir/)** (Fast Healthcare Interoperability Resources)

- **Purpose**: Patient demographics and administrative data
- **Implementation**: HAPI FHIR server with PostgreSQL
- **Scope**: Patient registry, identity management, demographics
- **Standard**: HL7 FHIR R4

**[OpenEHR](openehr/)**

- **Purpose**: Clinical documents and detailed health records
- **Implementation**: EHRbase server with PostgreSQL
- **Scope**: Letters, clinical notes, observations, longitudinal records
- **Standard**: ISO 13606, openEHR specifications

### Infrastructure

**[Caddy](caddy/)** Web Server

- Reverse proxy for all services
- Automatic HTTPS with Let's Encrypt
- Static file serving for frontend
- Request routing and load balancing

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
    │    ┌────────┘                  │
    │    │    ┌──────────────────────┘
    ↓    ↓    ↓
┌──────────────────┐
│                  │
│   PostgreSQL     │
│  (Shared DB)     │
│                  │
└──────────────────┘
```

## Data Flow

### Patient Demographics

1. **Create Patient**: Client → FastAPI → FHIR Server → PostgreSQL
2. **Read Demographics**: Client → FastAPI → FHIR Server → Return Patient resource
3. **Update Demographics**: Client → FastAPI → FHIR Server → Update Patient resource

The FastAPI backend communicates with the FHIR server to manage patient information including names, dates of birth, gender, addresses, and contact details.

### Clinical Letters

1. **Create Letter**: Client → FastAPI → EHRbase → PostgreSQL
2. **Read Letter**: Client → FastAPI → EHRbase → Return Composition
3. **List Letters**: Client → FastAPI → EHRbase (AQL query) → Return list

The FastAPI backend communicates with the EHRbase server to create, retrieve, and manage clinical letters and other health records for patients.

## API Structure

All API endpoints are prefixed with `/api`:

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with credentials
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout (invalidate refresh token)
- `GET /api/auth/me` - Get current user profile

### Patient Management

- `GET /api/patients` - List all patients from FHIR
- `POST /api/patients` - Verify patient exists
- `PUT /api/patients/{id}/demographics` - Update demographics (FHIR)
- `GET /api/patients/{id}/demographics` - Get demographics (FHIR)

### Clinical Letters

- `POST /api/patients/{id}/letters` - Create letter (OpenEHR)
- `GET /api/patients/{id}/letters` - List all letters (OpenEHR)
- `GET /api/patients/{id}/letters/{uid}` - Get specific letter (OpenEHR)

### FHIR Operations

- `POST /api/fhir/patients` - Create FHIR Patient directly
- `GET /api/fhir/patients/{id}` - Read FHIR Patient directly

### Push Notifications

- `POST /api/push/register` - Register for push notifications
- `POST /api/push/send` - Send push notification

## Data Storage

### FHIR Patient Data

Patient demographic and administrative information is stored in the FHIR server, including:

- Patient names and identifiers
- Gender and date of birth
- Contact information (phone, email)
- Addresses
- Emergency contacts

### OpenEHR Clinical Records

Clinical documents and health records are stored in EHRbase, including:

- Clinical letters and correspondence
- Consultation notes
- Treatment plans and care records
- Medical history and observations

### User Authentication

User accounts and authentication data are stored in PostgreSQL, including:

- Usernames and email addresses
- Securely hashed passwords
- User roles (patient, clinician, admin)
- Two-factor authentication settings

## Security

### Authentication Flow

1. **User Registration**: Username/email + password → bcrypt hash → PostgreSQL
2. **Login**: Credentials → Verify hash → Generate JWT tokens
3. **Access Token**: Short-lived (15 minutes), included in Authorization header
4. **Refresh Token**: Long-lived (7 days), HttpOnly cookie, used to get new access token
5. **TOTP 2FA**: Optional two-factor authentication using authenticator apps

### Authorization

- **Role-Based Access**: Users are assigned roles (patient, clinician, admin) that determine what actions they can perform
- **Endpoint Protection**: Each API endpoint checks user permissions before allowing access
- **CSRF Protection**: Additional security tokens are required for operations that modify data

For example, only users with the clinician role can create clinical letters, and they must provide a valid CSRF token.

### Data Security

- **At Rest**: PostgreSQL encrypted storage
- **In Transit**: TLS/HTTPS via Caddy
- **Passwords**: Bcrypt hashing with salt
- **Tokens**: JWT with RS256 signatures
- **Secrets**: Environment variables, never committed

## Development Setup

### Prerequisites

The development environment requires:

- Docker & Docker Compose for containerisation
- Python 3.13+ with Poetry package manager
- Node.js for frontend development

### Quick Start

Developers can start the entire application stack with a single command. This launches all services including:

- Frontend application (accessible at <http://localhost:8080>)
- Backend API with interactive documentation (<http://localhost:8080/api/docs>)
- FHIR server for patient data
- EHRbase for clinical records
- PostgreSQL database
- Caddy web server

### Development Services

The development environment runs these services:

- **Backend**: FastAPI application (port 8000)
- **Database**: PostgreSQL for user authentication (port 5432)
- **FHIR Server**: HAPI FHIR (port 8081) with dedicated database (port 5433)
- **EHRbase**: OpenEHR server (port 8082) with dedicated database (port 5434)
- **Web Server**: Caddy reverse proxy (port 8080)

## Testing

The backend includes automated tests to ensure reliability:

- **Patient endpoint tests**: Verify patient data operations
- **FHIR integration tests**: Ensure correct communication with the FHIR server
- **Authentication tests**: Validate security and access control

Tests can be run locally during development or automatically via continuous integration.

## Database Migrations

Database schema changes are managed using Alembic, which provides:

- **Automatic migration generation**: Detects changes to database models
- **Version control**: Tracks all database schema changes
- **Safe upgrades**: Apply changes to production databases without data loss
- **Rollback capability**: Revert changes if issues occur

This ensures the database structure stays in sync across development, testing, and production environments.

## Deployment

### Production Setup

The application can be deployed to production using Docker containers. The production configuration:

- Uses optimised Docker images for performance
- Runs all services in detached mode for continuous operation
- Includes health checks for monitoring

### Configuration

Production deployment requires several environment variables:

- **Database connection**: Credentials for PostgreSQL
- **Security keys**: Secrets for JWT token generation
- **Service URLs**: Endpoints for FHIR and EHRbase servers
- **HTTPS settings**: Domain name and administrator email for SSL certificates

These values should be stored securely and never committed to version control.

## Monitoring

### Application Logs

All services generate logs that can be used for:

- Troubleshooting issues
- Monitoring system activity
- Auditing access and changes
- Performance analysis

Logs can be viewed in real-time or searched for specific events and errors.

### Health Checks

Each service provides health check endpoints to verify it's running correctly:

- **Backend API**: Reports overall application health
- **FHIR Server**: Confirms patient data system is operational
- **EHRbase**: Verifies clinical records system is accessible

These checks can be monitored automatically to detect and alert on any service failures.

## Next Steps

- **[FHIR Documentation](fhir/)** - Learn about patient demographics storage
- **[OpenEHR Documentation](openehr/)** - Learn about clinical data storage
- **[FastAPI Documentation](fastapi/)** - Learn about the API framework
- **[Caddy Documentation](caddy/)** - Learn about the web server configuration
