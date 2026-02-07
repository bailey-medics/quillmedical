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

### User Authentication

- Register a new account
- Log in with credentials
- Refresh your session
- Log out securely
- View your profile

### Patient Management

- View list of all patients
- Create new patient record
- Update patient demographics
- View patient demographics

### Clinical Letters

- Create a new clinical letter
- View all letters for a patient
- Retrieve a specific letter

### Push Notifications

- Register device for notifications
- Send notifications to users

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
- Encrypted passwords
- User roles (patient, clinician, admin)
- Two-factor authentication settings

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

Each service reports its status to verify it's working correctly:

- **Application server**: Reports overall health
- **FHIR Server**: Confirms patient data system is operational
- **OpenEHR Server**: Verifies clinical records system is accessible

These checks can be monitored automatically to detect and alert on service failures.

## Learn More

- **[FHIR Documentation](fhir/)** - Patient demographics storage system
- **[OpenEHR Documentation](openehr/)** - Clinical data storage system
- **[Application Framework](fastapi/)** - Core application framework
- **[Web Server](caddy/)** - Web server configuration
