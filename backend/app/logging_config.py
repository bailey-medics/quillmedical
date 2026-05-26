"""Structured JSON logging configuration.

Configures the Python logging subsystem to emit JSON-formatted logs in
production. Cloud Run forwards stdout/stderr to Cloud Logging, which
parses JSON natively (severity, message, timestamp, custom fields).

In development mode, standard human-readable formatting is used instead.
"""

import logging
import sys

from pythonjsonlogger.json import JsonFormatter

from app.config import settings
from app.log_context import RequestContextFilter

_DEV_MODE = settings.BACKEND_ENV.lower().startswith("dev")


def setup_logging() -> None:
    """Initialise root logger with the appropriate formatter."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Remove any existing handlers (e.g. uvicorn defaults)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if _DEV_MODE:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-8s %(name)s "
                "[%(request_id)s] — %(message)s",
                datefmt="%H:%M:%S",
                defaults={"request_id": "-"},
            )
        )
    else:
        handler.setFormatter(
            JsonFormatter(
                fmt=(
                    "%(asctime)s %(levelname)s %(name)s %(message)s "
                    "%(request_id)s %(user_id)s"
                ),
                rename_fields={
                    "asctime": "timestamp",
                    "levelname": "severity",
                },
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )

    handler.addFilter(RequestContextFilter())
    root.addHandler(handler)

    # Quieten noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
