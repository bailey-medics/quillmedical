"""Tell Resend about everybody it has not yet been told about.

A sync is tried when somebody verifies their address or changes their
preference. If Resend was down at that moment, ``marketing_synced_at`` is
left empty, and this goes back over those people.

Run with ``just marketing-sync`` against the dev stack, or as the
``marketing-sync`` admin action in production.
"""

from __future__ import annotations

import logging
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.marketing.resend_contacts import (
    MarketingSyncError,
    is_configured,
    sync_contact,
)
from app.models import User

logger = logging.getLogger(__name__)


def unsynced_users(db: Session) -> list[User]:
    """Everybody Resend should know about and does not.

    Verified and active only. An unverified address has not been shown to
    belong to the person who typed it, and a closed account is taken off
    the list, not put on it.

    Args:
        db: Database session.

    Returns:
        The users, oldest account first.
    """
    return list(
        db.execute(
            select(User)
            .where(
                User.email_verified.is_(True),
                User.is_active.is_(True),
                User.marketing_synced_at.is_(None),
            )
            .order_by(User.id)
        )
        # ``User.roles`` is joined in, so the rows have to be made unique.
        .unique()
        .scalars()
        .all()
    )


def sync_unsynced(db: Session) -> tuple[int, int]:
    """Sync every unsynced user, carrying on past a failure.

    Each success is committed on its own, so a failure half way through
    does not lose the ones before it.

    Args:
        db: Database session.

    Returns:
        How many were synced, and how many failed.
    """
    synced = 0
    failed = 0
    for user in unsynced_users(db):
        try:
            sync_contact(user)
        except MarketingSyncError as exc:
            failed += 1
            logger.warning(
                "Marketing sync failed for user %s: %s", user.id, exc
            )
            continue
        db.commit()
        synced += 1
    return synced, failed


def main() -> int:
    """Run the retry against the core database.

    Returns:
        The exit status: 0 when nothing failed.
    """
    from app.db.core_db import CoreSessionLocal

    if not is_configured():
        print(
            "Resend contact settings are not configured "
            "(RESEND_CONTACTS_API_KEY, RESEND_NEWSLETTER_SEGMENT_ID, "
            "RESEND_NEWSLETTER_TOPIC_ID). Nothing to do."
        )
        return 1

    db = CoreSessionLocal()
    try:
        synced, failed = sync_unsynced(db)
    finally:
        db.close()

    print(f"Synced {synced}, failed {failed}.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
