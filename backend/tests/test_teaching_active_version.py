"""Per-organisation active version pointer.

``is_live`` gates whether a bank is open at all; ``active_version`` gates
which version an open bank serves. Sync imports versions, an admin advances
the pointer.

Nothing reads the pointer yet, so these cover the model contract rather
than serving behaviour. The migration's backfill runs only under Alembic
against Postgres, which this suite does not exercise.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.features.teaching.models import QuestionBankOrgStatus


def _status(**overrides: object) -> QuestionBankOrgStatus:
    values: dict[str, object] = {
        "organisation_id": 1,
        "question_bank_id": "a-bank",
        "is_live": False,
        "site_registration": False,
    }
    values.update(overrides)
    return QuestionBankOrgStatus(**values)


class TestDefaults:
    def test_a_new_row_has_no_active_version(
        self, db_session: Session
    ) -> None:
        """Null means nothing promoted — the bank serves nothing yet."""
        row = _status()
        db_session.add(row)
        db_session.commit()
        assert row.active_version is None

    def test_it_is_independent_of_is_live(self, db_session: Session) -> None:
        """The two gates answer different questions.

        ``is_live`` is whether the bank is open at all; ``active_version``
        is which version an open bank serves.
        """
        row = _status(is_live=True)
        db_session.add(row)
        db_session.commit()
        assert row.is_live is True
        assert row.active_version is None


class TestPointerIsPerOrganisation:
    def test_two_orgs_can_sit_on_different_versions(
        self, db_session: Session
    ) -> None:
        """The point of the feature: one org may promote before another."""
        early = _status(organisation_id=1, active_version=2)
        late = _status(organisation_id=2, active_version=5)
        db_session.add_all([early, late])
        db_session.commit()

        assert early.active_version == 2
        assert late.active_version == 5

    def test_the_same_org_tracks_banks_separately(
        self, db_session: Session
    ) -> None:
        one = _status(question_bank_id="bank-one", active_version=1)
        two = _status(question_bank_id="bank-two", active_version=7)
        db_session.add_all([one, two])
        db_session.commit()

        assert one.active_version == 1
        assert two.active_version == 7


class TestPromotionAndRollback:
    def test_the_pointer_can_move_forward(self, db_session: Session) -> None:
        row = _status(is_live=True, active_version=1)
        db_session.add(row)
        db_session.commit()

        row.active_version = 2
        db_session.commit()
        db_session.refresh(row)
        assert row.active_version == 2

    def test_the_pointer_can_move_back(self, db_session: Session) -> None:
        """Rollback is the same operation pointing at an earlier version.

        There is no way to undo a bad revision today; this is what makes
        one possible.
        """
        row = _status(is_live=True, active_version=4)
        db_session.add(row)
        db_session.commit()

        row.active_version = 3
        db_session.commit()
        db_session.refresh(row)
        assert row.active_version == 3
