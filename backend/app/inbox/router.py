"""The inbox route: one answer to "what is waiting on me?".

A count from each feature, never the items themselves and never any of
their text. The envelope in the top ribbon draws the total, and each
feature's own page lists what is behind its count. See
``docs/docs/plans/2026-10-04-waiting-on-me-inbox-plan.md``.
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.deps import DEP_CURRENT_USER
from app.inbox.sources import SOURCES
from app.models import User
from app.schemas.inbox import InboxOut, InboxSourceOut

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
    """
    items: list[InboxSourceOut] = []
    for key, count_for in SOURCES.items():
        try:
            count = count_for(db, current_user)
        except Exception:
            # Broad on purpose: whatever one source did, the others
            # still answer.
            logger.exception("inbox source failed", extra={"source": key})
            continue
        if count > 0:
            items.append(InboxSourceOut(source=key, count=count))
    return InboxOut(items=items, total=sum(item.count for item in items))
