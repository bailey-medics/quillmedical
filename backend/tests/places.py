"""Test helpers for authorising somebody at a place.

Who administers a place is a ``practising_competency`` row carrying
``manage_users``, not a membership. A test that puts somebody at a place
and expects them to administer it is describing the older model, where
membership of a trust carried the whole tree beneath it.

Kept out of ``conftest.py`` because importing from there would give mypy
the same file under two module names and stop it checking anything
further.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PractisingCompetency

ADMINISTERS = "manage_users"


def administers(db: Session, user_id: int, org_unit_id: int) -> None:
    """Authorise *user_id* to administer *org_unit_id*.

    Deliberately not folded into ``add_org_unit_member``: production must
    go on treating the two as separate decisions, because being at a
    place and being authorised to administer it are what this model
    exists to tell apart. Only a test setting up an administrator wants
    both at once.

    **Nothing is inherited**, so a test acting on a ward needs a row at
    the ward, not only at the trust above it.

    Asking twice is a no-op rather than an integrity error, so a fixture
    and a test that both ask for it are both satisfied.
    """
    existing = db.scalar(
        select(PractisingCompetency.id).where(
            PractisingCompetency.user_id == user_id,
            PractisingCompetency.org_unit_id == org_unit_id,
            PractisingCompetency.competency == ADMINISTERS,
        )
    )
    if existing is not None:
        return

    db.add(
        PractisingCompetency(
            user_id=user_id,
            org_unit_id=org_unit_id,
            competency=ADMINISTERS,
        )
    )
    db.commit()
