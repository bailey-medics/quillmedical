"""The sources of the inbox: what each feature says is waiting on somebody.

**Nothing is copied into an inbox table.** Each source reads its own
feature's rows, so the inbox cannot drift from the things it lists. A
table of copies would need keeping in step with every feature that
writes to it, and would be wrong the first time one forgot.

**Something is waiting until it is dealt with**, and each source says what
that means. Opening an item never clears it: a message read between two
patients and then forgotten is the failure this is here to prevent.

**A line never carries what somebody wrote.** It says who and what kind,
and the words stay on the feature's own page, behind that page's access
checks. Feedback may hold patient data, and so will a message.

A new source is a :class:`InboxSource` here and its key in ``SOURCES``,
and its address in the frontend's ``lib/inbox``. See
``docs/docs/plans/2026-10-04-waiting-on-me-inbox-plan.md``.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, selectinload

from app.features.passport import definitions, service
from app.features.passport.models import Passport, PassportSignOffRequest
from app.feedback.labels import (
    CATEGORY_LABELS,
    SENDER_STATUS_LABELS,
    STATUS_LABELS,
)
from app.feedback.replies import reply_is_unseen
from app.models import Feedback, User
from app.passport_storage import get_passport_store

logger = logging.getLogger(__name__)

#: The most lines one source gives of either kind. The inbox is for what
#: is in hand and what was lately done, not an archive: each feature's
#: own page lists everything.
MAX_ITEMS = 50


@dataclass(frozen=True)
class InboxLine:
    """One thing that is, or was, waiting on somebody.

    Attributes:
        id: The row's id within its own feature.
        title: Who or what it is, in words: "Feedback from sam.patel".
            Never anything the person wrote.
        detail: What kind it is, in words, or None.
        status: Where it has got to, in words, or None.
        created_at: When it arrived.
        done: Whether it has been dealt with.
        ref: The feature's own name for it, where its page is addressed
            by a name and not by ``id``.
    """

    id: int
    title: str
    detail: str | None
    status: str | None
    created_at: datetime
    done: bool
    ref: str | None = None


@dataclass(frozen=True)
class InboxSource:
    """One feature's answer to "what is waiting on this person?".

    Attributes:
        count: How many things are waiting on them.
        lines: Those things, newest first, or with ``done`` the ones
            lately dealt with. At most ``MAX_ITEMS``.
    """

    count: Callable[[Session, User], int]
    lines: Callable[[Session, User, bool], list[InboxLine]]


def _feedback_new_count(db: Session, user: User) -> int:
    """Feedback nobody has picked up yet, for an operator.

    Feedback comes from every organisation, so reading it is operating
    the deployment: an operator sees the count and nobody else does. An
    item stops waiting when it is acknowledged, resolved or marked won't
    fix, never merely by being opened.
    """
    if user.platform_role != "superadmin":
        return 0
    return int(
        db.scalar(
            select(func.count())
            .select_from(Feedback)
            .where(Feedback.status == "new")
        )
        or 0
    )


def _feedback_lines(db: Session, user: User, done: bool) -> list[InboxLine]:
    """Feedback waiting on an operator, or lately dealt with.

    The line names the sender and the category. The message is not in
    it: that is read on the feedback's own page.
    """
    if user.platform_role != "superadmin":
        return []
    rows = db.scalars(
        select(Feedback)
        .options(selectinload(Feedback.user))
        .where(Feedback.status != "new" if done else Feedback.status == "new")
        .order_by(Feedback.created_at.desc(), Feedback.id.desc())
        .limit(MAX_ITEMS)
    )
    return [
        InboxLine(
            id=row.id,
            title=(
                f"Feedback from {row.user.username}"
                if row.user
                else "Feedback from a deleted user"
            ),
            detail=CATEGORY_LABELS.get(row.category or ""),
            status=STATUS_LABELS.get(row.status),
            created_at=row.created_at,
            done=row.status != "new",
        )
        for row in rows
    ]


def _feedback_reply_count(db: Session, user: User) -> int:
    """Replies to the caller's own feedback that they have not seen.

    A reply waits from when an operator writes or changes it until the
    sender next opens their feedback page. Reading is the whole of
    dealing with it: there is nothing for them to do but know.
    """
    return int(
        db.scalar(
            select(func.count())
            .select_from(Feedback)
            .where(Feedback.user_id == user.id, reply_is_unseen())
        )
        or 0
    )


def _feedback_reply_lines(
    db: Session, user: User, done: bool
) -> list[InboxLine]:
    """Replies to the caller's own feedback: unseen, or already read.

    The line says there is a reply and where the feedback has got to.
    Neither the reply nor what they wrote is in it.
    """
    replied = Feedback.operator_comment.is_not(None)
    rows = db.scalars(
        select(Feedback)
        .where(
            Feedback.user_id == user.id,
            (replied & ~reply_is_unseen()) if done else reply_is_unseen(),
        )
        .order_by(Feedback.operator_comment_at.desc(), Feedback.id.desc())
        .limit(MAX_ITEMS)
    )
    return [
        InboxLine(
            id=row.id,
            title="Reply to your feedback",
            detail=CATEGORY_LABELS.get(row.category or ""),
            status=SENDER_STATUS_LABELS.get(row.status),
            created_at=row.operator_comment_at or row.created_at,
            done=done,
        )
        for row in rows
    ]


#: Where a sign-off request has got to, as its assessor reads it.
_REQUEST_STATUS_LABELS: dict[str, str] = {
    "open": "Waiting",
    "signed_off": "Signed off",
    "declined": "Declined",
    "withdrawn": "Withdrawn",
}


def _competency_name(competency_id: str) -> str | None:
    """A passport competency's name, or None for one since retired."""
    try:
        return definitions.competency_ref(competency_id).name
    except definitions.UnknownCompetencyError:
        return None


def _record_id(request: PassportSignOffRequest) -> str | None:
    """The sign-off record's own id, which its page is addressed by.

    The request row holds the record's folder name, and that is unique
    only within one passport: two holders asking about the same
    competency on the same day have the same name. The record's own id
    is unique across all of them, and it is inside the record, so the
    record is read for it, as the passport's own list of requests does.

    None when the record cannot be read. The line is still listed, with
    nowhere to go: one broken request must not hide the rest, and the
    assessor should still see they were asked.
    """
    try:
        record = service.read_sign_off(
            get_passport_store(), request.passport_id, request.signoff_id
        )
    except Exception:
        # Broad on purpose: a missing record and a store that cannot be
        # reached end the same way for a line in a list.
        logger.warning(
            "Sign-off request %s names a record that could not be read",
            request.id,
        )
        return None
    return record.id


def _asked_of(user: User) -> ColumnElement[bool] | None:
    """The sign-off requests that name *user* as assessor, or None.

    The same question the passport's own queue asks: a holder types an
    address, so a request names its assessor by email, whatever the case.
    None for somebody with no address, or who may not assess, since the
    passport's routes would refuse them and a count leading to a refusal
    is worse than no count.
    """
    if not user.email:
        return None
    if "assess_clinician_passport" not in user.get_final_competencies():
        return None
    return (
        func.lower(PassportSignOffRequest.assessor_email)
        == user.email.strip().lower()
    )


def _sign_off_count(db: Session, user: User) -> int:
    """Sign-off requests waiting on the caller as an assessor.

    A request waits until it is signed off or declined, or its holder
    withdraws it.
    """
    asked = _asked_of(user)
    if asked is None:
        return 0
    return int(
        db.scalar(
            select(func.count())
            .select_from(PassportSignOffRequest)
            .where(asked, PassportSignOffRequest.status == "open")
        )
        or 0
    )


def _sign_off_lines(db: Session, user: User, done: bool) -> list[InboxLine]:
    """Sign-off requests asked of the caller: open, or already answered.

    The line names the clinician who asked and the competency they
    asked about, as the catalogue names it. The evidence is read on the
    sign-off page, which ``ref`` addresses by the record's own id. Only
    an open request has one: once it is answered there is no page for
    the assessor to open, and no record is read.
    """
    asked = _asked_of(user)
    if asked is None:
        return []
    is_open = PassportSignOffRequest.status == "open"
    when = (
        func.coalesce(
            PassportSignOffRequest.resolved_at,
            PassportSignOffRequest.created_at,
        )
        if done
        else PassportSignOffRequest.created_at
    )
    rows = db.execute(
        # The holder's name alone, not the user: loading a user brings
        # their competencies with it, which a list of lines has no use
        # for.
        select(PassportSignOffRequest, User.full_name, User.username)
        .join(Passport, Passport.id == PassportSignOffRequest.passport_id)
        .join(User, User.id == Passport.user_id)
        .where(asked, ~is_open if done else is_open)
        .order_by(when.desc(), PassportSignOffRequest.id.desc())
        .limit(MAX_ITEMS)
    ).all()
    return [
        InboxLine(
            id=request.id,
            title=f"Sign-off request from {full_name or username}",
            detail=_competency_name(request.competency_id),
            status=_REQUEST_STATUS_LABELS.get(request.status),
            ref=None if done else _record_id(request),
            created_at=(
                (request.resolved_at or request.created_at)
                if done
                else request.created_at
            ),
            done=request.status != "open",
        )
        for request, full_name, username in rows
    ]


#: Every source, in the order the inbox counts them. The key is what the
#: API returns and what the frontend keys its addresses on, so it is part
#: of the API: renaming one is a breaking change.
SOURCES: dict[str, InboxSource] = {
    "feedback_new": InboxSource(
        count=_feedback_new_count, lines=_feedback_lines
    ),
    "feedback_reply": InboxSource(
        count=_feedback_reply_count, lines=_feedback_reply_lines
    ),
    "passport_sign_off": InboxSource(
        count=_sign_off_count, lines=_sign_off_lines
    ),
}
