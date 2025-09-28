# Quill Medical

Quill Medical is a full-stack digital health platform designed for clinical-grade reliability.
It provides a secure and scalable foundation for healthcare applications, combining a modern web stack
with strong attention to interoperability, security, and compliance. Quill Medical provides paid for
communication between patients and clinics and also letter generation and storage.

---

## Architecture

Quill Medical is delivered as a modular, containerised system using :

- **Docker Compose**
- **Caddy** – reverse proxy with TLS termination and security headers.
- **Frontend** – Vite, React, TypeScript, and Mantine UI, single page application (SPA), progressive web app (PWA), Yarn Berry + Storybook
- **Backend** – FastAPI + Python 3.12 + poetry
- **Database** – Alembic + PostgreSQL

---

## Formatting and Linting

- **Python**: `ruff`, `black`
- **TypeScript**: `prettier`, `eslint`
- **Git hooks**: `pre-commit` to run formatters and linters on commit
- **Spell checking**: `streetsidesoftware.code-spell-checker` for common typos in code and text files. For any new words, please chose "Add words to CSpell Configuration" so they are added to `cspell.config.json`.

---

## Security & Authentication

- **Authentication**: FastAPI with **JWT (JSON Web Tokens)**

  - **Access tokens**: short-lived (≈15 minutes), stored in secure `HttpOnly` cookies.
  - **Refresh tokens**: long-lived (≈7 days), also in cookies for automatic renewal.

- **CSRF protection**: Each session issues an `XSRF-TOKEN` cookie. Clients must send it back as an `X-CSRF-Token` header for all state-changing requests.

- **Cookie settings**:

  - `HttpOnly`, `Secure`, and `SameSite` flags applied (depending on environment).
  - Optional `COOKIE_DOMAIN` ensures cookies are scoped correctly in prod.

- **Password storage**: Strong hashing using **argon2** via `passlib`.

- **Database migrations**: Managed with **Alembic**, autogenerating schema changes from `app.models`.

---

## Documentation

- **Python** - Google style

---

## Getting Started

### Prerequisites

What you need:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 24](https://nodejs.org/)
- [Python 3.14+](https://www.python.org/)
- [Yarn Berry (v2+)](https://yarnpkg.com/getting-started/install)
- [Semgrep](https://semgrep.dev/docs/getting-started/)

- Complete env files in root and backend directories.

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

Make sure you have Just installed. Then run:

```bash
just initialise
```

Access the services:

Frontend: <http://localhost>

Backend API: <http://localhost/api/health>

Gitea: <http://localhost:3001>

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
