"""The inbox route: one answer to "what is waiting on me?".

A count from each feature for the envelope in the top ribbon, and the
lines behind the counts for the inbox page: what is waiting, and what was
lately dealt with. Never what anybody wrote, which stays on each
feature's own page. See
``docs/docs/plans/2026-10-04-waiting-on-me-inbox-plan.md``.
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.deps import DEP_CURRENT_USER
from app.inbox.sources import SOURCES
from app.models import User
from app.schemas.inbox import (
    InboxItemOut,
    InboxItemsOut,
    InboxOut,
    InboxSourceOut,
)

logger = logging.getLogger(__name__)

_DEP_SESSION = Depends(get_core_db)

router = APIRouter(prefix="/inbox", tags=["inbox"])


@router.get("", response_model=InboxOut)
def get_inbox(
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> InboxOut:
    """What is waiting on the caller, a source at a time.

    Any signed-in user. Each source decides for itself whether the
    caller has anything, so nothing here needs a competency: somebody
    with nothing waiting gets an empty list.

    A source that fails is left out and logged, not allowed to take the
    rest down with it. The envelope is on every page, and one feature's
    fault must not blank the count for all the others.

    Each source runs inside a savepoint, which is what makes that true
    on Postgres. There, one failed statement leaves the whole
    transaction refusing every statement after it, so catching the
    error is not enough: the sources that follow would fail too, and
    the count would read nought. Rolling back to the savepoint undoes
    only the failed source. SQLite, which the unit tests run on, does
    not behave this way, so it could not show the fault.
    """
    items: list[InboxSourceOut] = []

    for key, source in SOURCES.items():
        try:
            with db.begin_nested():
                count = source.count(db, current_user)
        except Exception:
            # Broad on purpose: whatever one source did, the others
            # still answer.
            logger.exception("inbox source failed", extra={"source": key})
            continue
        if count > 0:
            items.append(InboxSourceOut(source=key, count=count))

    return InboxOut(items=items, total=sum(item.count for item in items))


@router.get("/items", response_model=InboxItemsOut)
def get_inbox_items(
    done: bool = False,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> InboxItemsOut:
    """The lines of the caller's inbox, newest first.

    Without ``done``, what is waiting on them. With it, what was lately
    dealt with, so that something done can be found again. Each source
    gives at most ``MAX_ITEMS`` of either: the inbox is for what is in
    hand, and each feature's own page lists everything.

    Any signed-in user, and each source decides what the caller may see.
    A source that fails is left out and logged, as in the counts.
    """
    items: list[InboxItemOut] = []

    for key, source in SOURCES.items():
        try:
            # In a savepoint, for the reason given in `get_inbox`.
            with db.begin_nested():
                lines = source.lines(db, current_user, done)
        except Exception:
            logger.exception("inbox source failed", extra={"source": key})
            continue
        items.extend(
            InboxItemOut(
                source=key,
                id=line.id,
                ref=line.ref,
                title=line.title,
                detail=line.detail,
                status=line.status,
                created_at=line.created_at,
                done=line.done,
            )
            for line in lines
        )
    items.sort(key=lambda item: (item.created_at, item.id), reverse=True)

    return InboxItemsOut(items=items)
