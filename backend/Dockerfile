# backend/Dockerfile

# ---------- Base layer (deps + app) ----------
FROM python:3.12-slim AS base

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

# ---------- Dev target (hot-reload) ----------
FROM base AS dev
# Caddy will forward X-Forwarded-*; trust them so URLs and client IPs are correct
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--proxy-headers", "--forwarded-allow-ips", "*"]

# ---------- Prod target (no reload, optional migrations) ----------
FROM base AS prod
# Optional entrypoint to run Alembic before serving
COPY --chown=appuser:appuser docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
