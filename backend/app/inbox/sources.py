"""The sources of the inbox: what each feature says is waiting on somebody.

**Nothing is copied into an inbox table.** Each source is a function that
counts its own feature's rows, so the count cannot drift from the thing it
counts. A table of copies would need keeping in step with every feature
that writes to it, and would be wrong the first time one forgot.

**Something is waiting until it is dealt with**, and each source says what
that means. Opening an item never clears it: a message read between two
patients and then forgotten is the failure this is here to prevent. See
``docs/docs/plans/2026-10-04-waiting-on-me-inbox-plan.md``.

A new source is a function here and its key in ``SOURCES``, and its label
and address in the frontend's ``lib/inbox``.
"""

from collections.abc import Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Feedback, User

#: Counts what is waiting on one person from one feature.
Source = Callable[[Session, User], int]


def feedback_new(db: Session, user: User) -> int:
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


#: Every source, in the order the inbox lists them. The key is what the
#: API returns and what the frontend keys its label and address on, so it
#: is part of the API: renaming one is a breaking change.
SOURCES: dict[str, Source] = {
    "feedback_new": feedback_new,
}
