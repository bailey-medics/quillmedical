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

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.feedback.labels import CATEGORY_LABELS, STATUS_LABELS
from app.models import Feedback, User

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
    """

    id: int
    title: str
    detail: str | None
    status: str | None
    created_at: datetime
    done: bool


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


#: Every source, in the order the inbox counts them. The key is what the
#: API returns and what the frontend keys its addresses on, so it is part
#: of the API: renaming one is a breaking change.
SOURCES: dict[str, InboxSource] = {
    "feedback_new": InboxSource(
        count=_feedback_new_count, lines=_feedback_lines
    ),
}
