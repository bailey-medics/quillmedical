"""Recording whether somebody is sent news and updates."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.marketing.preferences import (
    MARKETING_WORDING_VERSION,
    set_marketing_preference,
)
from app.models import MarketingPreferenceChange, User


def _changes(db_session, user):
    return list(
        db_session.execute(
            select(MarketingPreferenceChange)
            .where(MarketingPreferenceChange.user_id == user.id)
            .order_by(MarketingPreferenceChange.id)
        )
        .scalars()
        .all()
    )


class TestANewAccount:
    def test_is_not_sent_marketing_until_somebody_says_so(self, test_user):
        """The default is off: only registration switches it on."""
        assert test_user.marketing_emails is False
        assert test_user.marketing_synced_at is None


class TestAChange:
    def test_writes_one_row_and_flips_the_answer(self, db_session, test_user):
        changed = set_marketing_preference(
            db_session,
            test_user,
            wants=True,
            source="registration",
            wording_version=MARKETING_WORDING_VERSION,
        )
        db_session.commit()

        assert changed is True
        assert test_user.marketing_emails is True
        [row] = _changes(db_session, test_user)
        assert row.wants_marketing is True
        assert row.source == "registration"
        assert row.wording_version == MARKETING_WORDING_VERSION
        assert row.created_at is not None

    def test_clears_the_sync_mark(self, db_session, test_user):
        """Resend now holds the old answer, so it has to be told again."""
        test_user.marketing_synced_at = datetime.now(UTC)
        db_session.commit()

        set_marketing_preference(
            db_session, test_user, wants=True, source="settings"
        )
        db_session.commit()

        assert test_user.marketing_synced_at is None

    def test_each_change_is_its_own_row(self, db_session, test_user):
        set_marketing_preference(
            db_session, test_user, wants=True, source="registration"
        )
        set_marketing_preference(
            db_session, test_user, wants=False, source="resend"
        )
        db_session.commit()

        rows = _changes(db_session, test_user)
        assert [(r.wants_marketing, r.source) for r in rows] == [
            (True, "registration"),
            (False, "resend"),
        ]
        assert rows[1].wording_version is None
        assert test_user.marketing_emails is False


class TestAnUnchangedAnswer:
    def test_writes_nothing(self, db_session, test_user):
        synced = datetime.now(UTC)
        test_user.marketing_synced_at = synced
        db_session.commit()

        changed = set_marketing_preference(
            db_session, test_user, wants=False, source="settings"
        )
        db_session.commit()

        assert changed is False
        assert _changes(db_session, test_user) == []
        assert test_user.marketing_synced_at is not None

    def test_a_repeat_keeps_the_first_row(self, db_session, test_user):
        set_marketing_preference(
            db_session, test_user, wants=True, source="registration"
        )
        set_marketing_preference(
            db_session, test_user, wants=True, source="settings"
        )
        db_session.commit()

        [row] = _changes(db_session, test_user)
        assert row.source == "registration"


class TestAnUnknownSource:
    def test_is_refused_before_anything_is_written(
        self, db_session, test_user
    ):
        with pytest.raises(ValueError, match="Unknown marketing preference"):
            set_marketing_preference(
                db_session, test_user, wants=True, source="guesswork"
            )

        assert test_user.marketing_emails is False
        assert _changes(db_session, test_user) == []

    def test_is_refused_on_the_row_itself(self, test_user):
        with pytest.raises(ValueError, match="Unknown marketing preference"):
            MarketingPreferenceChange(
                user_id=test_user.id, wants_marketing=True, source="guesswork"
            )


class TestDeletingTheUser:
    def test_deletes_their_rows(self, db_session):
        user = User(
            username="leaver",
            email="leaver@example.com",
            password_hash="x",
        )
        db_session.add(user)
        db_session.commit()
        set_marketing_preference(
            db_session, user, wants=True, source="registration"
        )
        db_session.commit()
        user_id = user.id

        db_session.delete(user)
        db_session.commit()

        assert (
            db_session.execute(
                select(MarketingPreferenceChange).where(
                    MarketingPreferenceChange.user_id == user_id
                )
            ).first()
            is None
        )
