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

**Nor is it emailed.** The notice an operator gets says who sent feedback
and links to it, and leaves the words in Quill, for the same reason. See
``docs/docs/plans/2026-10-04-waiting-on-me-inbox-plan.md``.
"""

import logging

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
)
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.analytics.router import (
    build_breadcrumbs,
    clean_release,
    redact,
    redact_code,
)
from app.config import settings
from app.db import get_core_db
from app.deps import (
    DEP_CURRENT_USER,
    DEP_REQUIRE_OPERATOR,
    get_current_user,
)
from app.email.render import render_email, send_args
from app.email_send import send_email
from app.models import Feedback, User
from app.rate_limit import limiter
from app.schemas.feedback import (
    FeedbackCreatedOut,
    FeedbackIn,
    FeedbackItemOut,
    FeedbackListOut,
    FeedbackStatus,
    FeedbackUpdateIn,
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

#: What each category reads as in the notice to an operator. The same
#: words the sender chose from, in ``sendFeedback.ts``.
_CATEGORY_LABELS: dict[str, str] = {
    "broken": "Something is broken",
    "inaccurate": "Something is wrong or inaccurate",
    "suggestion": "Suggestion",
    "other": "Something else",
}


def _notify_operator(
    *, to: str, feedback_id: int, sender: str, category: str | None, route: str
) -> None:
    """Email the configured address that feedback has arrived.

    Run as a background task, after the response has gone. It takes what
    it needs by value, never the row and never the message: the notice
    says who and what kind and links to the feedback, and the words stay
    in Quill.

    A failure is logged and swallowed. The feedback is already stored,
    and a mail service being down must not look, to anybody, like the
    feedback having been lost.
    """
    try:
        rendered = render_email(
            "feedback_received.html.j2",
            "quill",
            {
                "sender": sender,
                "category": _CATEGORY_LABELS.get(category or ""),
                "route": route,
                "url": f"{settings.FRONTEND_URL}/admin/feedback/{feedback_id}",
            },
        )
        send_email(to=to, **send_args(rendered))
    except Exception:
        # Broad on purpose: whatever went wrong, there is nobody left to
        # tell but the log. The id only, as everywhere in this module.
        logger.exception(
            "feedback notice not sent", extra={"feedback_id": feedback_id}
        )


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
    background_tasks: BackgroundTasks,
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

    Where ``FEEDBACK_NOTIFY_EMAIL`` is set, that address is told once the
    response has gone, with a link and without the message.
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

    notify = settings.FEEDBACK_NOTIFY_EMAIL.strip()
    if notify:
        background_tasks.add_task(
            _notify_operator,
            to=notify,
            feedback_id=feedback.id,
            sender=current_user.username,
            category=feedback.category,
            route=feedback.route,
        )
    return FeedbackCreatedOut(id=feedback.id)


def _item(feedback: Feedback) -> FeedbackItemOut:
    """Render one row for an operator."""
    return FeedbackItemOut.model_validate(
        {
            "id": feedback.id,
            "status": feedback.status,
            "comment": feedback.operator_comment,
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
    and ``manage_users`` – which is scoped to a place – is the wrong
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
    """The caller's own feedback, newest first, with where each has got to
    and what an operator wrote back.

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
                    "comment": row.operator_comment,
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
def update_feedback(
    feedback_id: int,
    body: FeedbackUpdateIn,
    operator: User = DEP_REQUIRE_OPERATOR,
    db: Session = _DEP_SESSION,
) -> FeedbackItemOut:
    """Answer a piece of feedback: a status, a comment or both.
    Operator-only.

    Only what the body names changes, so saving a comment leaves the
    status alone and the other way round. What somebody sent is their
    record of it, and is never edited.

    The comment is shown to the sender on their own feedback page. It is
    not logged, for the reason the message is not: an operator answering
    a report will quote it. The log says only that one was written.
    """
    feedback = _require_feedback(db, feedback_id)
    changed = body.model_fields_set
    if body.status is not None:
        feedback.status = body.status
    if "comment" in changed:
        feedback.operator_comment = body.comment
    db.flush()
    logger.info(
        "feedback updated",
        extra={
            "feedback_id": feedback.id,
            "status": feedback.status,
            "comment_changed": "comment" in changed,
            "changed_by": operator.id,
        },
    )
    return _item(feedback)
