"""The framework sync reads the testing repository on GitHub, for real.

Every other sync test clones a repository made on the test's own disk.
This one clones ``bailey-medics/quill-medical-framework-testing`` over
HTTPS, with no credential, as App production's sync does, so it is the
one test that a change to how GitHub serves a clone would turn red.

The testing repository holds the four fixtures at version 1 and
``quill_test`` at versions 1 to 4, each merged by a reviewed pull
request. It is on no ``FRAMEWORK_REPOSITORIES`` list, so App production
never stores it: the test names it itself.

Marked ``integration`` and ``network``, so ``just ub`` and the unit tests
in CI never run it. The "Framework repository sync" job in ``ci.yml``
runs it with ``pytest -m network``. See Phase 15 of
``docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md``.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.passport.models import (
    PassportFrameworkCompetency,
    PassportFrameworkScope,
    PassportFrameworkVersion,
)
from app.features.passport.sync import sync_from_repositories

pytestmark = [pytest.mark.integration, pytest.mark.network]

TESTING_REPOSITORY = "bailey-medics/quill-medical-framework-testing"

FIXTURES = [
    "clinical",
    "ghnft_radiotherapy_record",
    "ruh_sact_passport",
    "uk_sact_board_2023",
]


def _versions(db: Session, framework_id: str) -> list[int]:
    """Each version stored for one framework, oldest first."""
    rows = db.scalars(
        select(PassportFrameworkVersion.version)
        .where(PassportFrameworkVersion.framework_id == framework_id)
        .order_by(PassportFrameworkVersion.version)
    )

    return list(rows)


def _competency_ids(db: Session, framework_id: str, version: int) -> set[str]:
    """The competencies one version of a framework holds."""
    rows = db.scalars(
        select(PassportFrameworkCompetency.competency_id)
        .join(
            PassportFrameworkVersion,
            PassportFrameworkCompetency.version_row_id
            == PassportFrameworkVersion.id,
        )
        .where(
            PassportFrameworkVersion.framework_id == framework_id,
            PassportFrameworkVersion.version == version,
        )
    )

    return set(rows)


def _scope_ids(db: Session, competency_id: str, version: int) -> set[str]:
    """The scopes one competency has in one version of quill_test."""
    rows = db.scalars(
        select(PassportFrameworkScope.scope_id)
        .join(
            PassportFrameworkCompetency,
            PassportFrameworkScope.competency_row_id
            == PassportFrameworkCompetency.id,
        )
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
    )

    return set(rows)


def test_the_testing_repository_syncs_every_version_it_holds(
    db_session: Session,
) -> None:
    result = sync_from_repositories(
        db_session, {TESTING_REPOSITORY: ["quill_test", *FIXTURES]}
    )

    assert result.succeeded, result.error
    assert _versions(db_session, "quill_test") == [1, 2, 3, 4]
    for framework_id in FIXTURES:
        assert _versions(db_session, framework_id) == [1]


def test_each_quill_test_version_holds_what_its_commit_set(
    db_session: Session,
) -> None:
    """Version 2 added a competency and a scope, and version 1 has neither."""
    result = sync_from_repositories(
        db_session, {TESTING_REPOSITORY: ["quill_test", *FIXTURES]}
    )

    assert result.succeeded, result.error

    assert _competency_ids(db_session, "quill_test", 1) == {
        "quill_test_take_a_history",
        "quill_test_examine_the_chest",
        "quill_test_explain_a_result",
    }
    assert _competency_ids(db_session, "quill_test", 2) == {
        "quill_test_take_a_history",
        "quill_test_examine_the_chest",
        "quill_test_explain_a_result",
        "quill_test_hand_over_a_patient",
    }

    assert _scope_ids(db_session, "quill_test_take_a_history", 1) == {
        "adult",
        "child",
        "other",
    }
    assert _scope_ids(db_session, "quill_test_take_a_history", 2) == {
        "adult",
        "child",
        "older_adult",
        "other",
    }
