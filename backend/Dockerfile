# backend/Dockerfile

# ---------- Base layer (deps + app) ----------
# Pin by digest for reproducible builds. To update, run:
#   docker pull python:3.13-slim && docker inspect --format='{{index .RepoDigests 0}}' python:3.13-slim
FROM python:3.13-slim@sha256:8bc60ca09afaa8ea0d6d1220bde073bacfedd66a4bf8129cbdc8ef0e16c8a952 AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VERSION=2.1.3

WORKDIR /app

# (Optional) OS deps if you ever have to compile wheels; keep minimal.
# Most of our deps ship many linux wheels, so you can usually skip build-essential.
# RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*

# Install Poetry (pinned)
RUN pip install --no-cache-dir "poetry==$POETRY_VERSION"

# Install Python deps into the system site-packages (no venv = simpler image)
COPY pyproject.toml poetry.lock* ./
RUN poetry config virtualenvs.create false \
 && poetry install --no-interaction --no-ansi

# Copy sources (keeps your paths)
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

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
# Copy the scripts directory into the dev image and set ownership to the unprivileged user.
COPY --chown=appuser:appuser scripts ./scripts
# Caddy will forward X-Forwarded-*; trust them so URLs and client IPs are correct
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--proxy-headers", "--forwarded-allow-ips", "*"]

# ---------- Prod target (no reload, optional migrations) ----------
FROM base AS prod
# Optional entrypoint to run Alembic before serving
COPY --chown=appuser:appuser docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
