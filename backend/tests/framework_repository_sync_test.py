"""The framework sync reads the two testing repositories on GitHub, for real.

Every other sync test clones a repository made on the test's own disk.
This one clones ``bailey-medics/quill-medical-framework-testing`` and
``bailey-medics/quill-medical-2-framework-testing`` over HTTPS, with no
credential, as App production's sync does, so it is the one test that a
change to how GitHub serves a clone would turn red.

Each testing repository holds one made-up framework, merged by reviewed
pull requests: ``quill_test`` at versions 1 to 4 in the first, and
``quill_2_test`` at version 1 in the second. Neither is on a
``FRAMEWORK_REPOSITORIES`` list, so App production never stores them: the
test names them itself. Two repositories let it check, over real clones,
that one repository cannot publish the other's framework.

Marked ``integration`` and ``network``, so ``just ub`` and the unit tests
in CI never run it. The "Framework repository sync" job in ``ci.yml``
runs it with ``pytest -m network``.
"""

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.passport.models import (
    PassportFrameworkCompetency,
    PassportFrameworkLevel,
    PassportFrameworkScope,
    PassportFrameworkVersion,
)
from app.features.passport.sync import sync_from_repositories

pytestmark = [pytest.mark.integration, pytest.mark.network]

FIRST = "bailey-medics/quill-medical-framework-testing"
SECOND = "bailey-medics/quill-medical-2-framework-testing"

#: Each testing repository with the framework it publishes.
REPOSITORIES = {FIRST: ["quill_test"], SECOND: ["quill_2_test"]}

#: The day version 4 of quill_test retired what it retired.
RETIRED_ON = date(2026, 11, 12)


def _versions(db: Session, framework_id: str) -> list[int]:
    """Each version stored for one framework, oldest first."""
    rows = db.scalars(
        select(PassportFrameworkVersion.version)
        .where(PassportFrameworkVersion.framework_id == framework_id)
        .order_by(PassportFrameworkVersion.version)
    )

    return list(rows)


def _competency(
    db: Session, competency_id: str, version: int
) -> PassportFrameworkCompetency:
    """One competency as one version of quill_test holds it."""
    return db.scalars(
        select(PassportFrameworkCompetency)
        .join(
            PassportFrameworkVersion,
            PassportFrameworkCompetency.version_row_id
            == PassportFrameworkVersion.id,
        )
        .where(
            PassportFrameworkCompetency.competency_id == competency_id,
            PassportFrameworkVersion.framework_id == "quill_test",
            PassportFrameworkVersion.version == version,
        )
    ).one()


def _competency_ids(db: Session, version: int) -> set[str]:
    """The competencies one version of quill_test holds."""
    rows = db.scalars(
        select(PassportFrameworkCompetency.competency_id)
        .join(
            PassportFrameworkVersion,
            PassportFrameworkCompetency.version_row_id
            == PassportFrameworkVersion.id,
        )
        .where(
            PassportFrameworkVersion.framework_id == "quill_test",
            PassportFrameworkVersion.version == version,
        )
    )

    return set(rows)


def _scope(
    db: Session, competency_id: str, scope_id: str, version: int
) -> PassportFrameworkScope:
    """One scope of one competency, as one version of quill_test holds it."""
    row = _competency(db, competency_id, version)

    return db.scalars(
        select(PassportFrameworkScope).where(
            PassportFrameworkScope.competency_row_id == row.id,
            PassportFrameworkScope.scope_id == scope_id,
        )
    ).one()


def _level(
    db: Session, competency_id: str, level_id: str, version: int
) -> PassportFrameworkLevel:
    """One level of one competency, as one version of quill_test holds it."""
    row = _competency(db, competency_id, version)

    return db.scalars(
        select(PassportFrameworkLevel).where(
            PassportFrameworkLevel.competency_row_id == row.id,
            PassportFrameworkLevel.level_id == level_id,
        )
    ).one()


def test_both_testing_repositories_sync_every_version_they_hold(
    db_session: Session,
) -> None:
    result = sync_from_repositories(db_session, REPOSITORIES)

    assert result.succeeded, result.error
    assert _versions(db_session, "quill_test") == [1, 2, 3, 4]
    assert _versions(db_session, "quill_2_test") == [1]


def test_each_quill_test_version_holds_what_its_commit_set(
    db_session: Session,
) -> None:
    """Version 2 added a competency, and version 3 three more."""
    result = sync_from_repositories(db_session, REPOSITORIES)
    first_two = {
        "quill_test_take_a_history",
        "quill_test_examine_the_chest",
        "quill_test_explain_a_result",
    }
    added_at_3 = {
        "quill_test_give_a_course",
        "quill_test_refer_to_a_team",
        "quill_test_use_the_old_system",
    }

    assert result.succeeded, result.error
    assert _competency_ids(db_session, 1) == first_two
    assert _competency_ids(db_session, 2) == first_two | {
        "quill_test_hand_over_a_patient"
    }
    assert _competency_ids(db_session, 3) == (
        first_two | {"quill_test_hand_over_a_patient"} | added_at_3
    )
    assert _competency_ids(db_session, 4) == _competency_ids(db_session, 3)


def test_what_version_4_retired_was_live_at_version_3(
    db_session: Session,
) -> None:
    """A level, a scope and a competency, each kept, and marked retired."""
    result = sync_from_repositories(db_session, REPOSITORIES)
    refer = "quill_test_refer_to_a_team"
    level = "with_direct_supervision"

    assert result.succeeded, result.error

    assert (
        _competency(db_session, "quill_test_use_the_old_system", 3).retired_on
        is None
    )
    assert (
        _competency(db_session, "quill_test_use_the_old_system", 4).retired_on
        == RETIRED_ON
    )

    assert _level(db_session, refer, level, 3).retired_on is None
    assert _level(db_session, refer, level, 4).retired_in_version == 4

    assert _scope(db_session, refer, "liver", 3).retired_on is None
    assert _scope(db_session, refer, "liver", 4).retired_in_version == 4


def test_one_testing_repository_cannot_publish_the_others_framework(
    db_session: Session,
) -> None:
    """Each repository listed as publishing the other's framework."""
    result = sync_from_repositories(
        db_session, {FIRST: ["quill_2_test"], SECOND: ["quill_test"]}
    )

    assert not result.succeeded
    assert "may publish only" in (result.error or "")
    assert _versions(db_session, "quill_test") == []
    assert _versions(db_session, "quill_2_test") == []
