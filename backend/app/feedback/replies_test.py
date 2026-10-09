"""Which feedback has a reply its sender has not opened yet."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.feedback.replies import reply_is_unseen
from app.models import Feedback

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
EARLIER = NOW - timedelta(hours=1)
LATER = NOW + timedelta(hours=1)


def _feedback(
    db: Session,
    *,
    comment: str | None,
    commented_at: datetime | None = None,
    seen_at: datetime | None = None,
) -> int:
    row = Feedback(
        user_id=None,
        category="broken",
        message="Something",
        route="/teaching",
        release="abc1234",
        viewport="390x844",
        user_agent="Mozilla/5.0",
        breadcrumbs=[],
        status="new",
        operator_comment=comment,
        operator_comment_at=commented_at,
        comment_seen_at=seen_at,
    )
    db.add(row)
    db.flush()

    return row.id


def _unseen(db: Session) -> set[int]:
    return set(db.scalars(select(Feedback.id).where(reply_is_unseen())).all())


def test_feedback_with_no_comment_has_nothing_to_see(
    db_session: Session,
) -> None:
    _feedback(db_session, comment=None)

    assert _unseen(db_session) == set()


def test_a_comment_never_opened_is_unseen(db_session: Session) -> None:
    row = _feedback(db_session, comment="Fixed", commented_at=NOW)

    assert _unseen(db_session) == {row}


def test_a_comment_opened_since_it_was_written_is_seen(
    db_session: Session,
) -> None:
    _feedback(db_session, comment="Fixed", commented_at=NOW, seen_at=LATER)

    assert _unseen(db_session) == set()


def test_a_comment_changed_since_it_was_opened_is_unseen_again(
    db_session: Session,
) -> None:
    """Opening the page once must not hide a reply written afterwards."""
    row = _feedback(
        db_session, comment="Fixed, again", commented_at=NOW, seen_at=EARLIER
    )

    assert _unseen(db_session) == {row}


def test_a_comment_with_no_time_on_it_counts_as_seen_once_opened(
    db_session: Session,
) -> None:
    """With no time to compare, having opened the page is all there is."""
    _feedback(db_session, comment="Fixed", commented_at=None, seen_at=NOW)

    assert _unseen(db_session) == set()


@pytest.mark.parametrize("seen_at", [None, EARLIER])
def test_only_the_unseen_rows_come_back(
    db_session: Session, seen_at: datetime | None
) -> None:
    _feedback(db_session, comment=None)
    _feedback(db_session, comment="Read", commented_at=EARLIER, seen_at=LATER)
    waiting = _feedback(
        db_session, comment="New", commented_at=NOW, seen_at=seen_at
    )

    assert _unseen(db_session) == {waiting}
