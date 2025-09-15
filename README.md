# Quill Medical

Quill Medical is a full-stack digital health platform designed for clinical-grade reliability.  
It provides a secure and scalable foundation for healthcare applications, combining a modern web stack  
with strong attention to interoperability, security, and compliance. Quill Medical provides paid for
communication between patients and clinics and also letter generation and storage.

---

## Architecture

Quill Medical is delivered as a modular, containerised system using **Docker Compose**:

- **Caddy** – reverse proxy with TLS termination and security headers.
- **Frontend** – Vite, React, TypeScript, and Mantine UI, single page application (SPA), progressive web app (PWA) + Yarn Berry
- **Backend** – FastAPI + Python 3.12 + poetry
- **Database** – Alembic + PostgreSQL

---

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 20+](https://nodejs.org/) (optional, to run the frontend locally)
- [Python 3.12+](https://www.python.org/) (optional, to run the backend locally)

### Setup

1. Clone this repository

Create a .env file in the project root:

```text
POSTGRES_PASSWORD=change_me_now
```

Build and start the stack:

```bash
docker compose up --build
```

Access the services:

Frontend: http://localhost

Backend API: http://localhost/api/health

Gitea: http://localhost:3001

## Environment Variables

- Only ASCII characters for the gitea token in the `.env` file.
