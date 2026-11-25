"""Tests for ``videos_to_play``: which videos still lock the assessment.

The module's videos are its ``<Video ref>`` keys, read through
``media.get_referenced_media_keys``, which these tests replace with a
fixed list so no content is needed.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from app.features.teaching import media
from app.features.teaching.models import (
    Assessment,
    ModuleVideoPlay,
    QuestionBankConfig,
)
from app.features.teaching.video_plays import record_play, videos_to_play
from app.models import OrgUnit, User

BANK = "polyps"
VIDEOS = ["video-1", "video-2", "video-3"]
PASSED = datetime(2026, 3, 5, 10, 0, tzinfo=UTC)
#: Still inside a 36 month pass from ``PASSED``.
IN_DATE = datetime(2027, 1, 1, tzinfo=UTC)
#: After a 36 month pass from ``PASSED`` has run out, on 5 March 2029.
RUN_OUT = datetime(2029, 6, 1, tzinfo=UTC)


@pytest.fixture(autouse=True)
def three_videos(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        media, "get_referenced_media_keys", lambda _module_id: list(VIDEOS)
    )


def _organisation(db: Session) -> OrgUnit:
    org = OrgUnit(name="Trust", type="organisation")
    db.add(org)
    db.flush()

    return org


def _person(db: Session) -> User:
    user = User(
        username="learner",
        email="learner@example.com",
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db.add(user)
    db.flush()

    return user


def _config(
    db: Session,
    org: OrgUnit,
    *,
    asks: bool = True,
    renewal_months: int | None = 36,
) -> QuestionBankConfig:
    config = QuestionBankConfig(
        org_unit_id=org.id,
        question_bank_id=BANK,
        version=1,
        title="Polyps",
        description="",
        type="uniform",
        config_yaml={},
        renewal_months=renewal_months,
        play_videos_before_assessment=asks,
    )
    db.add(config)
    db.flush()

    return config


def _attempt(
    db: Session, org: OrgUnit, user: User, *, passed: bool
) -> Assessment:
    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        time_limit_minutes=60,
        total_items=0,
        completed_at=PASSED,
        is_passed=passed,
    )
    db.add(assessment)
    db.flush()

    return assessment


def _play(db: Session, user: User, key: str, at: datetime) -> None:
    db.add(
        ModuleVideoPlay(
            user_id=user.id,
            question_bank_id=BANK,
            media_key=key,
            played_at=at,
        )
    )
    db.flush()


def test_a_module_that_does_not_ask_has_nothing_to_play(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    config = _config(db_session, org, asks=False)

    assert videos_to_play(db_session, user.id, config) == []


def test_a_delegate_with_no_plays_has_every_video_to_play(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    config = _config(db_session, org)

    assert videos_to_play(db_session, user.id, config) == VIDEOS


def test_each_play_takes_its_video_off_the_list(db_session: Session) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    config = _config(db_session, org)

    record_play(db_session, user.id, BANK, "video-2")

    assert videos_to_play(db_session, user.id, config) == [
        "video-1",
        "video-3",
    ]


def test_playing_every_video_unlocks_the_assessment(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    config = _config(db_session, org)

    for key in VIDEOS:
        record_play(db_session, user.id, BANK, key)

    assert videos_to_play(db_session, user.id, config) == []


def test_another_delegates_plays_do_not_count(db_session: Session) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    other = User(
        username="other",
        email="other@example.com",
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db_session.add(other)
    db_session.flush()
    config = _config(db_session, org)

    for key in VIDEOS:
        record_play(db_session, other.id, BANK, key)

    assert videos_to_play(db_session, user.id, config) == VIDEOS


def test_a_failed_attempt_changes_nothing(db_session: Session) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    config = _config(db_session, org)
    _play(db_session, user, "video-1", datetime(2026, 1, 1, tzinfo=UTC))
    _attempt(db_session, org, user, passed=False)

    assert videos_to_play(db_session, user.id, config, now=RUN_OUT) == [
        "video-2",
        "video-3",
    ]


def test_a_pass_in_date_keeps_the_assessment_open(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    config = _config(db_session, org)
    _attempt(db_session, org, user, passed=True)

    assert videos_to_play(db_session, user.id, config, now=IN_DATE) == []


def test_once_a_pass_runs_out_every_video_must_be_played_again(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    config = _config(db_session, org)

    for key in VIDEOS:
        _play(db_session, user, key, datetime(2026, 1, 1, tzinfo=UTC))

    _attempt(db_session, org, user, passed=True)

    assert videos_to_play(db_session, user.id, config, now=RUN_OUT) == VIDEOS


def test_plays_since_a_pass_ran_out_count(db_session: Session) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    config = _config(db_session, org)
    _attempt(db_session, org, user, passed=True)

    for key in VIDEOS:
        _play(db_session, user, key, datetime(2029, 4, 1, tzinfo=UTC))

    assert videos_to_play(db_session, user.id, config, now=RUN_OUT) == []


def test_a_pass_on_a_module_with_no_renewal_never_runs_out(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    config = _config(db_session, org, renewal_months=None)
    _attempt(db_session, org, user, passed=True)

    assert videos_to_play(db_session, user.id, config, now=RUN_OUT) == []


def test_a_video_added_later_must_be_played_too(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    user = _person(db_session)
    config = _config(db_session, org)

    for key in VIDEOS:
        record_play(db_session, user.id, BANK, key)

    monkeypatch.setattr(
        media,
        "get_referenced_media_keys",
        lambda _module_id: [*VIDEOS, "video-4"],
    )

    assert videos_to_play(db_session, user.id, config) == ["video-4"]
