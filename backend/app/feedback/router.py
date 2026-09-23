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

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.analytics.router import (
    build_breadcrumbs,
    clean_release,
    redact,
    redact_code,
)
from app.db import get_core_db
from app.deps import (
    DEP_CURRENT_USER,
    DEP_REQUIRE_OPERATOR,
    get_current_user,
)
from app.models import Feedback, User
from app.rate_limit import limiter
from app.schemas.feedback import (
    FeedbackCreatedOut,
    FeedbackIn,
    FeedbackItemOut,
    FeedbackListOut,
    FeedbackStatus,
    FeedbackStatusIn,
    MyFeedbackItemOut,
    MyFeedbackListOut,
)

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


def _item(feedback: Feedback) -> FeedbackItemOut:
    """Render one row for an operator."""
    return FeedbackItemOut.model_validate(
        {
            "id": feedback.id,
            "status": feedback.status,
            "category": feedback.category,
            "message": feedback.message,
            "sender": feedback.user.username if feedback.user else None,
            "route": feedback.route,
            "release": feedback.release,
            "viewport": feedback.viewport,
            "user_agent": feedback.user_agent,
            "breadcrumbs": feedback.breadcrumbs,
            "error_name": feedback.error_name,
            "error_code": feedback.error_code,
            "created_at": feedback.created_at,
        }
    )


@router.get(
    "",
    response_model=FeedbackListOut,
    dependencies=[DEP_REQUIRE_OPERATOR],
)
def list_feedback(
    status: FeedbackStatus | None = None,
    db: Session = _DEP_SESSION,
) -> FeedbackListOut:
    """Every piece of feedback, newest first, optionally of one status.

    Operator-only. Feedback comes from every organisation, so reading it
    is operating the deployment rather than administering any one place,
    and ``manage_users`` — which is scoped to a place — is the wrong
    question.

    Not paginated. Volumes are low, and the useful view is "everything
    still ``new``", which the status filter already narrows to.
    """
    query = (
        select(Feedback)
        .options(selectinload(Feedback.user))
        .order_by(Feedback.created_at.desc(), Feedback.id.desc())
    )
    if status is not None:
        query = query.where(Feedback.status == status)
    return FeedbackListOut(items=[_item(f) for f in db.scalars(query)])


# Declared before `/{feedback_id}`, so "mine" is matched here rather than
# parsed as an id and refused with a 422.
@router.get("/mine", response_model=MyFeedbackListOut)
def list_my_feedback(
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> MyFeedbackListOut:
    """The caller's own feedback, newest first, with where each has got to.

    This is what closes the loop for the sender: somebody who reported a
    broken case can see it was fixed, and so has a reason to report the
    next one. Any signed-in user, and only ever their own rows.
    """
    rows = db.scalars(
        select(Feedback)
        .where(Feedback.user_id == current_user.id)
        .order_by(Feedback.created_at.desc(), Feedback.id.desc())
    )
    return MyFeedbackListOut(
        items=[
            MyFeedbackItemOut.model_validate(
                {
                    "id": row.id,
                    "status": row.status,
                    "category": row.category,
                    "message": row.message,
                    "created_at": row.created_at,
                }
            )
            for row in rows
        ]
    )


def _require_feedback(db: Session, feedback_id: int) -> Feedback:
    """Return the feedback, or refuse with a 404."""
    feedback = db.get(Feedback, feedback_id)
    if feedback is None:
        raise HTTPException(404, "Feedback not found")
    return feedback


@router.get(
    "/{feedback_id}",
    response_model=FeedbackItemOut,
    dependencies=[DEP_REQUIRE_OPERATOR],
)
def get_feedback(
    feedback_id: int,
    db: Session = _DEP_SESSION,
) -> FeedbackItemOut:
    """One piece of feedback in full. Operator-only."""
    return _item(_require_feedback(db, feedback_id))


@router.patch(
    "/{feedback_id}",
    response_model=FeedbackItemOut,
    dependencies=[DEP_REQUIRE_CSRF],
)
def update_feedback_status(
    feedback_id: int,
    body: FeedbackStatusIn,
    operator: User = DEP_REQUIRE_OPERATOR,
    db: Session = _DEP_SESSION,
) -> FeedbackItemOut:
    """Move a piece of feedback to another status. Operator-only.

    The status is the only thing that changes: what somebody sent is
    their record of it, and is never edited.
    """
    feedback = _require_feedback(db, feedback_id)
    feedback.status = body.status
    db.flush()
    logger.info(
        "feedback status changed",
        extra={
            "feedback_id": feedback.id,
            "status": feedback.status,
            "changed_by": operator.id,
        },
    )
    return _item(feedback)
