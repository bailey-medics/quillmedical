# backend/Dockerfile

# Build context: repository root (required so prod stage can access shared/)
# CI: context: .        dockerfile: ./backend/Dockerfile
# Dev: context: .        dockerfile: ./backend/Dockerfile  target: dev

# ---------- Base layer (deps + app) ----------
# Pin by digest for reproducible builds. To update, run:
#   docker pull python:3.13-slim && docker inspect --format='{{index .RepoDigests 0}}' python:3.13-slim
FROM python:3.13-slim@sha256:9d2e5553305c7c7b0097999bb17187c69b921ccd6bc9d40e4bb5ebe652c00285 AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# (Optional) OS deps if you ever have to compile wheels; keep minimal.
# Most of our deps ship many linux wheels, so you can usually skip build-essential.
# RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*

# Poetry's version comes from .poetry-version so this image and CI install
# the same one. Copied separately from the rest so a dependency change does
# not invalidate this layer.
COPY .poetry-version ./

# Install Poetry (pinned) and remove pre-installed charset-normalizer to avoid
# attrs/pip conflict when Poetry manages system site-packages.
RUN pip install --no-cache-dir "poetry==$(cat .poetry-version)" \
 && pip uninstall -y charset-normalizer 2>/dev/null || true

# Install Python deps into the system site-packages (no venv = simpler image)
COPY backend/pyproject.toml backend/poetry.lock* ./
# TODO: use `--only main` here — the dev group isn't marked optional, so this
# currently installs dev deps (mypy, pytest, etc.) into the production image.
# PyPI reads occasionally time out mid-download; Poetry's default 15s request
# timeout makes that likely on a cold build. Raise it, keep Poetry's artifact
# cache on a BuildKit cache mount so a retry resumes rather than restarting,
# and retry the install a few times before failing the build.
ENV POETRY_REQUESTS_TIMEOUT=60
RUN --mount=type=cache,target=/root/.cache/pypoetry \
    poetry config virtualenvs.create false \
 && for attempt in 1 2 3; do \
        poetry install --no-interaction --no-ansi && exit 0; \
        echo "poetry install failed (attempt $attempt of 3); retrying..." >&2; \
        sleep 5; \
    done; \
    exit 1

# Copy sources (keeps your paths)
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./

# Shared YAML config (CBAC competencies, base professions)
COPY shared/ /shared/

# API compatibility decision files (Compat-Generation header source)
COPY api-compatibility/ /api-compatibility/

# Create an unprivileged user and fix ownership
RUN useradd --uid 10001 --create-home appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Health check for container orchestration (Cloud Run, Docker Compose)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]

# ---------- Dev target (hot-reload) ----------
FROM base AS dev
# Dev-only utilities (do not copy these into the `prod` stage)
# git: the teaching content version-lock tests build real repositories and shell
# out to git. CI runs pytest on the runner where git already exists; without it
# here, `just ub` could not run them at all. Dev stage only — never in `prod`.
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*
USER appuser
# Copy the scripts directory into the dev image and set ownership to the unprivileged user.
COPY --chown=appuser:appuser backend/scripts ./scripts
# Caddy will forward X-Forwarded-*; trust them so URLs and client IPs are correct
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--proxy-headers", "--forwarded-allow-ips", "*"]

# ---------- Prod target (no reload) ----------
FROM base AS prod

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]

# ---------- Admin target (Cloud Run Job for admin tasks) ----------
FROM base AS admin
COPY --chown=appuser:appuser backend/scripts/admin_cli.py ./scripts/admin_cli.py
CMD ["python", "scripts/admin_cli.py"]
