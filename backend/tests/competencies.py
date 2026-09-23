"""Test helpers for giving somebody competencies beyond their profession.

What somebody holds beyond their base profession is a current
``user_competency`` row, not an entry in the ``additional_competencies``
JSON column. The column is still written by the routes, and read by
nothing, so a test that sets it and expects a competency to follow is
describing storage that has been retired.

Kept out of ``conftest.py`` for the reason ``tests/places.py`` is:
importing from there would give mypy the same file under two module names.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models import User, UserCompetency

#: How long a test's ``passport_write`` lasts: the year onboarding gives.
PASSPORT_TERM = timedelta(days=365)


def hold(user: User, *competency_ids: str) -> None:
    """Give *user* each competency, as a current grant row.

    ``passport_write`` is dated, a year from now, because it is sold and
    every real grant of it carries a term. Anything else is undated, as an
    administrator's grant is. The caller commits.
    """
    now = datetime.now(UTC)
    for competency_id in competency_ids:
        termed = competency_id == "passport_write"
        user.competency_grants.append(
            UserCompetency(
                competency_id=competency_id,
                granted=True,
                starts_on=now,
                ends_on=now + PASSPORT_TERM if termed else None,
                source="organisation" if termed else "admin",
            )
        )


def withhold(user: User, *competency_ids: str) -> None:
    """Take each competency away from *user*, as a current removal row.

    What ``removed_competencies`` used to say: their profession grants it
    and they do not hold it. The caller commits.
    """
    for competency_id in competency_ids:
        user.competency_grants.append(
            UserCompetency(
                competency_id=competency_id,
                granted=False,
                source="admin",
            )
        )


def lapse(user: User, competency_id: str) -> None:
    """End every current grant of *competency_id*, as if it ran out.

    Both ends move back, a year and a day ago to a day ago, because a row
    must not end before it starts. The caller commits.
    """
    now = datetime.now(UTC)
    for row in user.competency_grants:
        if (
            row.competency_id == competency_id
            and row.granted
            and row.is_current(now)
        ):
            row.starts_on = now - PASSPORT_TERM - timedelta(days=1)
            row.ends_on = now - timedelta(days=1)


def clear(user: User) -> None:
    """End every current grant and removal *user* has, now.

    For a test that used to empty ``additional_competencies``: nothing
    beyond their profession is held afterwards. The caller commits.
    """
    now = datetime.now(UTC)
    for row in user.competency_grants:
        if row.is_current(now):
            row.ends_on = now
