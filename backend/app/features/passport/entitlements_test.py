"""Until when somebody may write to their passport."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.features.passport.entitlements import passport_write_ends_on
from app.models import User, UserCompetency

NOW = datetime.now(UTC)


def _grant(
    db: Session,
    user: User,
    *,
    ends_on: datetime | None,
    source: str = "individual",
    competency_id: str = "passport_write",
) -> None:
    db.add(
        UserCompetency(
            user_id=user.id,
            competency_id=competency_id,
            starts_on=NOW - timedelta(days=30),
            ends_on=ends_on,
            source=source,
        )
    )
    db.flush()


def _same_moment(found: datetime | None, expected: datetime) -> bool:
    """SQLite hands back a naive value where Postgres hands back an aware one."""
    assert found is not None
    if found.tzinfo is None:
        found = found.replace(tzinfo=UTC)

    return found == expected


def test_nobody_with_no_grant_has_an_end(
    db_session: Session, test_user: User
) -> None:
    assert passport_write_ends_on(db_session, test_user.id) is None


def test_a_term_that_is_running_ends_when_it_says(
    db_session: Session, test_user: User
) -> None:
    ends = NOW + timedelta(days=90)
    _grant(db_session, test_user, ends_on=ends)

    assert _same_moment(passport_write_ends_on(db_session, test_user.id), ends)


def test_the_furthest_off_of_several_terms_is_the_answer(
    db_session: Session, test_user: User
) -> None:
    sooner = NOW + timedelta(days=10)
    later = NOW + timedelta(days=200)
    _grant(db_session, test_user, ends_on=sooner)
    _grant(db_session, test_user, ends_on=later)

    assert _same_moment(
        passport_write_ends_on(db_session, test_user.id), later
    )


def test_a_grant_with_no_end_means_it_never_runs_out(
    db_session: Session, test_user: User
) -> None:
    """Whatever else they hold: losing a dated term must not end this one."""
    _grant(db_session, test_user, ends_on=NOW + timedelta(days=10))
    _grant(db_session, test_user, ends_on=None, source="organisation")

    assert passport_write_ends_on(db_session, test_user.id) is None


def test_a_term_that_has_run_out_is_not_counted(
    db_session: Session, test_user: User
) -> None:
    _grant(db_session, test_user, ends_on=NOW - timedelta(days=1))

    assert passport_write_ends_on(db_session, test_user.id) is None


def test_a_lapsed_term_does_not_hide_a_running_one(
    db_session: Session, test_user: User
) -> None:
    running = NOW + timedelta(days=30)
    _grant(db_session, test_user, ends_on=NOW - timedelta(days=1))
    _grant(db_session, test_user, ends_on=running)

    assert _same_moment(
        passport_write_ends_on(db_session, test_user.id), running
    )


def test_another_competency_does_not_count(
    db_session: Session, test_user: User
) -> None:
    _grant(
        db_session,
        test_user,
        ends_on=NOW + timedelta(days=30),
        competency_id="manage_passport",
        source="admin",
    )

    assert passport_write_ends_on(db_session, test_user.id) is None


def test_another_persons_grant_does_not_count(
    db_session: Session, test_user: User
) -> None:
    other = User(
        username="other",
        email="other@example.com",
        password_hash="x",
        is_active=True,
        email_verified=True,
    )
    db_session.add(other)
    db_session.flush()
    _grant(db_session, other, ends_on=NOW + timedelta(days=30))

    assert passport_write_ends_on(db_session, test_user.id) is None
