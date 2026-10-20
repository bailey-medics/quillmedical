"""Request-scoped logging context via contextvars.

Provides automatic enrichment of all log records with request_id and
user_id fields. The middleware sets request_id at the start of each
request; the auth dependency sets user_id once the user is resolved.

Cloud Logging (via Cloud Run) parses these as structured JSON fields,
enabling filtering by request_id or user_id in Logs Explorer.
"""

import logging
from collections.abc import Mapping
from contextvars import ContextVar
from functools import cache
from typing import Any

from fastapi import FastAPI

from app.utils.route_list import served_routes

# Context variables - set per-request, automatically reset between requests
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)


class RequestContextFilter(logging.Filter):
    """Inject request_id and user_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.user_id = user_id_var.get()

        return True


UNMATCHED_ROUTE = "unmatched"


@cache
def _full_templates(app: FastAPI) -> dict[int, str]:
    """Map each route the app serves to its template from the root.

    An included router's route holds its path relative to the router's
    prefix, `/users/{user_id}/deactivate` rather than
    `/api/users/{user_id}/deactivate`, so the full template comes from
    `served_routes`, which knows where each router was included. Worked
    out once per app: the routes do not change once it is serving.
    """
    return {id(served.route): served.path for served in served_routes(app)}


def route_template(scope: Mapping[str, Any]) -> str:
    """Name the route a request matched by its template, not its path.

    The template is `/api/users/{user_id}/deactivate` where the path is
    `/api/users/123/deactivate`. Alerts quote it, so an alert says which
    route failed without carrying anybody's id to Slack or PagerDuty.
    FastAPI puts the matched route on the scope; a request that matched
    nothing, a 404, has none.
    """
    route = scope.get("route")
    path = getattr(route, "path", None)

    if not isinstance(path, str):
        return UNMATCHED_ROUTE

    app = scope.get("app")

    if isinstance(app, FastAPI):
        return _full_templates(app).get(id(route), path)

    return path
