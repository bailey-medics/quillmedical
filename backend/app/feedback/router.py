"""User feedback routes.

Its own router rather than a part of the analytics one. Analytics ingests
machine-generated telemetry into logs; this stores what a person wrote in a
table and reads it back, so the two share little beyond the shape of the
context they capture.

**The message body is never logged.** Free text from a clinical application
will contain patient data sooner or later, not maliciously but because
somebody describing a bug pastes what they were looking at. The analytics
routes log what they receive, and copying that habit here is the easy way
to undo the whole position. See
``docs/docs/plans/2026-09-20-user-feedback-plan.md``.
"""

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.analytics.router import (
    build_breadcrumbs,
    clean_release,
    redact,
    redact_code,
)
from app.db import get_core_db
from app.deps import DEP_CURRENT_USER, get_current_user
from app.models import Feedback, User
from app.rate_limit import limiter
from app.schemas.feedback import FeedbackCreatedOut, FeedbackIn

logger = logging.getLogger(__name__)

_DEP_SESSION = Depends(get_core_db)


def _require_csrf(request: Request, db: Session = _DEP_SESSION) -> None:
    """Check the CSRF token, borrowing ``main``'s implementation.

    ``main`` imports this router, so importing ``require_csrf`` at module
    level would be a cycle. The org_units and teaching routers do the same.
    """
    from app.main import require_csrf

    require_csrf(request, get_current_user(request, db))


DEP_REQUIRE_CSRF = Depends(_require_csrf)


router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post(
    "",
    response_model=FeedbackCreatedOut,
    status_code=201,
    dependencies=[DEP_REQUIRE_CSRF],
)
@limiter.limit("5/minute")
def submit_feedback(
    request: Request,
    body: FeedbackIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> FeedbackCreatedOut:
    """Store a message from the signed-in user.

    Signed-in only, unlike the client error endpoint. Knowing who sent
    feedback is most of its value, and an open endpoint that stores free
    text is an obvious target for abuse. The sender comes from the session
    cookie, never the body.

    Five a minute, well below the error endpoints: a person typing prose
    cannot legitimately send more.

    The captured context gets the same server-side backstop the error
    reports do, since the browser's sanitising is not something this end
    can trust. The message itself is stored as typed.
    """
    feedback = Feedback(
        user_id=current_user.id,
        category=body.category,
        message=body.message,
        route=redact(body.route),
        release=clean_release(body.release),
        viewport=body.viewport,
        user_agent=redact(body.user_agent),
        breadcrumbs=build_breadcrumbs(body.breadcrumbs),
        error_name=redact(body.error_name) or None,
        error_code=redact_code(body.error_code) or None,
        status="new",
    )
    db.add(feedback)
    db.flush()

    # The id and nothing else. See the module docstring.
    logger.info("feedback received", extra={"feedback_id": feedback.id})
    return FeedbackCreatedOut(id=feedback.id)
