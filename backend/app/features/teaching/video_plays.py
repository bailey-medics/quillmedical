"""Which learning videos a delegate must still play before the assessment.

A module whose ``module.yaml`` sets ``playVideosBeforeAssessment`` keeps
its assessment locked until the delegate has pressed play on every
``<Video ref>`` in its learning section. Each press is a
``ModuleVideoPlay`` row; nothing records the unlock itself, which is
worked out here from the plays and the delegate's latest pass each time
it is asked.

The unlock lasts until the pass runs out, ``renewalMonths`` after
passing, the same date the renewal reminder uses. After that only plays
made since it ran out count, so the delegate presses play on each video
again before renewing. A failed attempt is never looked at.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching import media
from app.features.teaching.models import (
    Assessment,
    ModuleVideoPlay,
    QuestionBankConfig,
)
from app.features.teaching.reminders import add_months


def _aware(value: datetime) -> datetime:
    """*value* with a timezone, reading a naive one as UTC.

    SQLite hands a timezone-aware column back without its timezone.
    """
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def record_play(
    db: Session, user_id: int, question_bank_id: str, media_key: str
) -> ModuleVideoPlay:
    """Record one press of play. The row is flushed, not committed.

    The caller has checked that the module asks for plays and that the
    video is one of its own.
    """
    play = ModuleVideoPlay(
        user_id=user_id,
        question_bank_id=question_bank_id,
        media_key=media_key,
    )

    db.add(play)
    db.flush()

    return play


def _latest_pass(
    db: Session, user_id: int, question_bank_id: str
) -> datetime | None:
    """When the delegate last passed this module, at any organisation."""
    passed_at = db.scalar(
        select(Assessment.completed_at)
        .where(
            Assessment.user_id == user_id,
            Assessment.question_bank_id == question_bank_id,
            Assessment.is_passed.is_(True),
            Assessment.completed_at.is_not(None),
        )
        .order_by(Assessment.completed_at.desc())
        .limit(1)
    )

    return _aware(passed_at) if passed_at is not None else None


def videos_to_play(
    db: Session,
    user_id: int,
    config: QuestionBankConfig,
    *,
    now: datetime | None = None,
) -> list[str]:
    """The videos the delegate must still play, in the order taught.

    Empty when the assessment is open to them: the module does not ask
    for plays, their latest pass is still in date, or every video has a
    play since the cut-off. The cut-off is the moment their latest pass
    ran out, or the beginning of time if they never passed.

    The videos are the module's ``<Video ref>`` keys as they are now, so
    a video added later must be played too.

    Args:
        db: Core database session.
        user_id: The delegate.
        config: The version of the module their organisation serves.
        now: The time to judge at; the current time when left out.

    Returns:
        The ``media_key`` of each video still to play.
    """
    if not config.play_videos_before_assessment:
        return []

    moment = now or datetime.now(UTC)
    bank_id = config.question_bank_id
    passed_at = _latest_pass(db, user_id, bank_id)
    cut_off: datetime | None = None

    if passed_at is not None:
        if config.renewal_months is None:
            return []

        runs_out = add_months(passed_at, config.renewal_months)

        if moment < runs_out:
            return []

        cut_off = runs_out

    query = select(ModuleVideoPlay.media_key).where(
        ModuleVideoPlay.user_id == user_id,
        ModuleVideoPlay.question_bank_id == bank_id,
    )

    if cut_off is not None:
        query = query.where(ModuleVideoPlay.played_at > cut_off)

    played = set(db.scalars(query))

    return [
        key
        for key in media.get_referenced_media_keys(bank_id)
        if key not in played
    ]
