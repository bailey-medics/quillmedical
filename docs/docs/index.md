# Quill Medical

Quill Medical is a secure web platform that connects patients with their healthcare providers. It enables:

- **Secure messaging** between patients and clinics
- **Clinical letter** creation and delivery
- **Transparent pricing** for clinical time and consultations
- **Safe storage** of medical correspondence

The platform is designed for clinical reliability, security, and compliance with healthcare standards.

---

## Tech Stack

### Frontend

- **React 19** – Modern UI framework for building interactive interfaces
- **TypeScript** – Type-safe JavaScript for reliable code
- **Mantine UI** – comprehensive component library for React applications
- **Tabler Icons** – Beautiful open-source icon set via [@tabler/icons-react](https://tabler.io/icons)
- **React Router** – Client-side routing and navigation
- **Vite** – Fast build tool and development server
- **Vitest** – Unit testing framework
- **Storybook** – Component development and documentation

### Backend

- **FastAPI** – Modern Python web framework
- **SQLAlchemy** – Database ORM and query builder
- **PostgreSQL** – Relational database
- **Alembic** – Database migration tool

### Healthcare Standards

- **FHIR R4** – Patient demographics and healthcare data exchange
- **OpenEHR** – Clinical document modeling and storage

---

## How It Works

Quill Medical is built from several connected components:

- **Web application** – What patients and staff see and use in their browsers
- **Web server** – Handles secure connections and routes traffic
- **Application server** – Processes requests and manages business logic
- **Databases** – Store patient information, clinical letters, and user accounts
- **Healthcare standards** – Uses FHIR for patient demographics and OpenEHR for clinical documents

---

## Code Quality

The codebase uses automated tools to maintain consistent formatting and catch common errors:

- Code formatters ensure consistent style
- Linters check for potential issues
- Spell checkers catch typos in documentation
- Pre-commit checks run automatically before code is saved

---

## Security & Authentication

### User Authentication

- Users log in with username and password
- Passwords are encrypted and never stored in plain text
- Sessions last 15 minutes, then automatically refresh
- Optional two-factor authentication for extra security

### Data Protection

- All connections use HTTPS encryption
- Protection against common web attacks
- Secure session management with automatic expiry
- User permissions control who can access what data

### Permission-Based Access Control

Quill Medical uses a defence-in-depth security architecture:

- **Backend validation** – All permissions checked server-side (source of truth)
- **Frontend protection** – Hides inaccessible features for better user experience
- **Tiered security** – Different user types receive appropriate error responses
- **Permission hierarchy** – Patient → Staff → Admin → Superadmin
- **Fail-safe defaults** – Access denied unless explicitly granted

This approach ensures:

- Patients cannot access administrative features
- Staff can only access assigned patients
- Admins have appropriate oversight capabilities
- All access attempts are logged for compliance

### Database Management

- Changes to database structure are tracked and versioned
- Updates can be applied safely without data loss

---

## Documentation

- **Python** - Google style

---

## Getting Started

### For Developers

#### Required Software

- Docker Desktop – runs the application in containers
- Node.js 24 – for frontend development
- Python 3.13+ – for backend development
- Yarn – JavaScript package manager
- Just – command runner for common tasks

#### Setup Steps

1. Download the code from the repository
2. Create configuration files with secure passwords
3. Build and start all services
4. Initialise the development environment

#### Access Points

- Main application: <http://localhost>
- API documentation: <http://localhost/api/health>
- Version control: <http://localhost:3001>

## Environment Variables

- Only ASCII characters for the gitea token in the `.env` file.

## Pre-commit CI

This repository uses `pre-commit` to run formatters, linters and checks. A GitHub Actions workflow (`.github/workflows/pre-commit.yml`) runs `pre-commit run --all-files` on pushes and pull requests.

To run the checks locally:

```bash
# install pre-commit (use your python environment / poetry if needed)
python -m pip install --upgrade pip
pip install pre-commit

# install hooks (optional, to run automatically on commit)
pre-commit install

# run all checks across the repository
pre-commit run --all-files
```
