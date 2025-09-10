FROM python:3.12-slim

WORKDIR /app

# System deps for psycopg / uvicorn performance
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN pip install poetry

# Copy dependency files
COPY pyproject.toml poetry.lock* ./

# Install dependencies
RUN poetry install --no-root

# Copy app sources
COPY app ./app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
# CMD ["poetry", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# TODO: need to change --reload to something else for production