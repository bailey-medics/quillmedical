"""The migration that deletes the procedure permissions' rows.

Migration ``f2e9632b4716`` deletes every ``user_competency`` and
``practising_competency`` row naming one of the five procedure
permissions, and refuses to run while a position requires one. Its
``upgrade()`` is run here against the unit tests' database, on rows
written with plain SQL, because the models refuse an id the catalogue
no longer holds. See Phase 13 of
docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.
"""

from __future__ import annotations

import importlib.util
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType

import pytest
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.cbac.competencies import COMPETENCIES
from app.models import OrgUnit, User

MIGRATION = next(
    (Path(__file__).parent.parent / "alembic" / "versions").glob(
        "*-f2e9632b4716_*.py"
    )
)

NOW = datetime(2026, 11, 4, 17, 0, tzinfo=UTC)

#: A permission that stays, so a row naming it must survive.
KEPT = "prescribe_non_controlled"


def _migration() -> ModuleType:
    """The migration module, loaded from its file."""
    spec = importlib.util.spec_from_file_location("f2e9632b4716", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    return module


def _upgrade(db: Session) -> None:
    """Run the migration's upgrade on the session's own connection."""
    context = MigrationContext.configure(db.connection())

    with Operations.context(context):
        _migration().upgrade()


def _place(db: Session) -> OrgUnit:
    """Somewhere to practise, since a practised competency names a place."""
    place = OrgUnit(name="Test Trust", type="hospital_team")
    db.add(place)
    db.flush()

    return place


def _grant(db: Session, user: User, competency: str) -> None:
    """A held competency and somewhere it is practised, by plain SQL."""
    place = _place(db)

    db.execute(
        text(
            "INSERT INTO user_competency "
            "(user_id, competency_id, source, created_at) "
            "VALUES (:user, :competency, 'profession', :now)"
        ),
        {"user": user.id, "competency": competency, "now": NOW},
    )
    db.execute(
        text(
            "INSERT INTO practising_competency "
            "(user_id, org_unit_id, competency, authorised_at) "
            "VALUES (:user, :place, :competency, :now)"
        ),
        {
            "user": user.id,
            "place": place.id,
            "competency": competency,
            "now": NOW,
        },
    )


def _held(db: Session, table: str, column: str) -> set[str]:
    rows = db.execute(text(f"SELECT {column} FROM {table}"))  # noqa: S608

    return {row[0] for row in rows}


def test_the_five_are_no_longer_permissions() -> None:
    migration = _migration()

    for competency in migration.PROCEDURE_PERMISSIONS:
        assert competency not in COMPETENCIES


def test_every_row_naming_one_of_the_five_goes(
    db_session: Session, test_user: User
) -> None:
    db_session.execute(text("DELETE FROM practising_competency"))
    db_session.execute(text("DELETE FROM user_competency"))
    _grant(db_session, test_user, "perform_cannulation")
    _grant(db_session, test_user, "perform_chest_drain")
    _grant(db_session, test_user, KEPT)

    _upgrade(db_session)

    assert _held(db_session, "user_competency", "competency_id") == {KEPT}
    assert _held(db_session, "practising_competency", "competency") == {KEPT}


def test_a_position_requiring_one_stops_it(
    db_session: Session, test_user: User
) -> None:
    """Somebody chose that requirement, so a person decides what replaces it."""
    _grant(db_session, test_user, "perform_cannulation")
    place = _place(db_session)
    db_session.execute(
        text(
            "INSERT INTO position "
            "(org_unit_id, kind, title, requires_competency) "
            "VALUES (:place, 'lead', 'Procedures lead', 'perform_cannulation')"
        ),
        {"place": place.id},
    )

    with pytest.raises(RuntimeError, match="1 position"):
        _upgrade(db_session)

    assert "perform_cannulation" in _held(
        db_session, "user_competency", "competency_id"
    )
