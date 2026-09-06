"""Analytics ingest routes.

Kept in its own module rather than in ``main`` deliberately. ``main`` is the
one genuinely hot file in this repository, and the teaching feature already
set the precedent of a router living beside its own code; a single
``include_router`` line is a far smaller merge surface than a block of routes.

Currently one endpoint: browser error reports. The browser sanitises before
sending — see ``frontend/src/lib/error-reporting/sanitise.ts`` — but this
endpoint is public and unauthenticated, so nothing arriving here is trusted.
Reports are length-bounded by the schema, redacted again below, and only then
logged.
"""

import logging
import re
from collections.abc import Sequence
from typing import Final

from fastapi import APIRouter, Request, Response

from app.deps import DEP_OPTIONAL_USER
from app.models import User
from app.rate_limit import limiter
from app.schemas.analytics import (
    ApiCrumb,
    AuthCrumb,
    ClientErrorIn,
    RouteCrumb,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])

#: Reported to Error Reporting as the service, so browser errors group
#: separately from backend ones rather than mixing in a single list.
SERVICE_NAME: Final = "quill-frontend"

#: Marks a log entry as an error event for Cloud Error Reporting, which is
#: what makes it group reports rather than treat them as loose log lines.
ERROR_EVENT_TYPE: Final = (
    "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1"
    ".ReportedErrorEvent"
)

#: A second pass over what the browser already sanitised.
#:
#: Not redundant: this endpoint takes unauthenticated input from anywhere, so
#: without it a public route writes arbitrary text into logs that must never
#: hold patient data. Deliberately the high-risk shapes only — this is a
#: backstop, not a reimplementation of the client sanitiser.
_REDACTIONS: Final[tuple[tuple[re.Pattern[str], str], ...]] = (
    (re.compile(r"\bhttps?://[^\s\"'`)<>\]]+", re.I), "[url]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[redacted]"),
    (
        re.compile(
            r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
            r"[0-9a-f]{4}-[0-9a-f]{12}\b",
            re.I,
        ),
        "[redacted]",
    ),
    (re.compile(r"\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b"), "[redacted]"),
    (re.compile(r"\b\d{4}-\d{2}-\d{2}\b"), "[redacted]"),
    (re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b", re.I), "[redacted]"),
)


#: A run of digits inside an otherwise valid error code. The schema has already
#: rejected separators, so a date or an NHS number can only arrive here with
#: them stripped — `CODE_19740302` — which the word-boundary patterns miss.
#: Real codes carry a digit or two at most: `PRESCRIBE_SCHEDULE_2_DENIED`.
_CODE_DIGIT_RUN: Final[re.Pattern[str]] = re.compile(r"\d{3,}")


def redact(text: str) -> str:
    """Apply the backstop redactions to a single field."""
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def redact_code(code: str) -> str:
    """Redact an error code, which is an identifier rather than prose."""
    return _CODE_DIGIT_RUN.sub("[redacted]", redact(code))


def build_breadcrumbs(
    crumbs: Sequence[RouteCrumb | ApiCrumb | AuthCrumb],
) -> list[dict[str, object]]:
    """Render breadcrumbs for the log entry.

    The schema has already restricted these to three known shapes with no
    free-text fields, so the only value worth a second pass is the route
    pattern — the one field a caller supplies as a string.
    """
    out: list[dict[str, object]] = []
    for crumb in crumbs:
        entry: dict[str, object] = dict(crumb.model_dump())
        pattern = entry.get("pattern")
        if isinstance(pattern, str):
            entry["pattern"] = redact(pattern)
        out.append(entry)
    return out


def build_context(
    report: ClientErrorIn, user: User | None
) -> dict[str, object]:
    """Build the Error Reporting ``context`` block.

    ``context.user`` is Error Reporting's own field for whoever hit the
    problem, which makes it filterable in the console without a custom query.
    It is prefixed, so a signed-in identifier can never be confused with an
    anonymous session: a support call resolves ``user:`` through the database,
    while ``session:`` groups a cascade on a public page into one visit and
    resolves to nobody.
    """
    context: dict[str, object] = {}

    if user is not None:
        context["user"] = f"user:{user.id}"
    elif report.session_id:
        context["user"] = f"session:{report.session_id}"

    http: dict[str, object] = {}
    route = redact(report.route)
    if route:
        http["url"] = route
    user_agent = redact(report.user_agent)
    if user_agent:
        http["userAgent"] = user_agent
    if report.status is not None:
        http["responseStatusCode"] = report.status
    if http:
        context["httpRequest"] = http

    return context


def build_error_message(report: ClientErrorIn) -> str:
    """Compose the text Error Reporting parses and groups on.

    Shaped like a JavaScript stack trace, because that is what Error
    Reporting knows how to parse: a ``Name: message`` header followed by
    frames. The React component stack is appended after it, since it says
    which part of the interface failed in a way the frames do not.
    """
    header = redact(report.name)
    error_code = redact_code(report.error_code)
    if error_code:
        header = f"{header} ({error_code})"
    message = redact(report.message)
    if message:
        header = f"{header}: {message}"

    parts = [header]

    stack = redact(report.stack)
    if stack:
        parts.append(stack)

    component_stack = redact(report.component_stack)
    if component_stack:
        parts.append(f"React component stack:{component_stack}")

    return "\n".join(parts)


# 204 with no body, so there is no JSON schema to diff. `Response` is one of
# the response classes the check accepts for this marker.
# api-schema-check: allow-opaque-permanent
@router.post("/client-errors", status_code=204)
@limiter.limit("30/minute")
def report_client_error(
    request: Request,
    report: ClientErrorIn,
    user: User | None = DEP_OPTIONAL_USER,
) -> Response:
    """Record a sanitised browser error report.

    Deliberately unauthenticated: the errors most worth knowing about include
    those on the login and registration pages, where there is no session yet.
    Rate-limited per client address so a loop in one browser cannot flood the
    logs.

    The user is read from the session cookie rather than from the body. The
    endpoint is open to anyone, so an identifier supplied by the caller would
    let one attribute an error to any user it chose, and a log that can be
    poisoned is worse than one with a gap in it. A caller that is not signed
    in is recorded against its session identifier alone.

    Returns 204 rather than a body — the browser has nothing to do with the
    answer, and a report failing must never surface to a user who is already
    looking at a broken page.
    """
    logger.error(
        build_error_message(report),
        extra={
            "@type": ERROR_EVENT_TYPE,
            "serviceContext": {
                "service": SERVICE_NAME,
                "version": redact(report.release) or "unknown",
            },
            "context": build_context(report, user),
            "error_source": report.source,
            "error_code": redact_code(report.error_code),
            "viewport": report.viewport,
            "breadcrumbs": build_breadcrumbs(report.breadcrumbs),
        },
    )
    return Response(status_code=204)
