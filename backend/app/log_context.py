"""Request-scoped logging context via contextvars.

Provides automatic enrichment of all log records with request_id and
user_id fields. The middleware sets request_id at the start of each
request; the auth dependency sets user_id once the user is resolved.

Cloud Logging (via Cloud Run) parses these as structured JSON fields,
enabling filtering by request_id or user_id in Logs Explorer.
"""

import logging
from contextvars import ContextVar

# Context variables — set per-request, automatically reset between requests
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)


class RequestContextFilter(logging.Filter):
    """Inject request_id and user_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.user_id = user_id_var.get()
        return True
