"""A sync records what performed it, not only who.

The CI path had no user and passed ``0``, which violated the ``users``
foreign key, so every pipeline sync failed. It failed invisibly, because
the endpoint returned 200 with the error in the body — the same gap that
`/api/ci/teaching/sync` returning 422 now closes.

Passing null instead fixes the constraint but loses the attribution, so
``synced_by_actor`` says a null means the deploy pipeline rather than an
unrecorded person.
"""

from __future__ import annotations

from app.features.teaching.models import (
    SYNC_ACTOR_DEPLOY_BOT,
    SYNC_ACTOR_USER,
)
from app.features.teaching.sync import _actor_for


class TestActorIsDerived:
    def test_a_user_id_means_a_person(self) -> None:
        assert _actor_for(7) == SYNC_ACTOR_USER

    def test_no_user_id_means_the_deploy_bot(self) -> None:
        assert _actor_for(None) == SYNC_ACTOR_DEPLOY_BOT

    def test_it_is_derived_rather_than_passed(self) -> None:
        """Two parameters that must agree are two that eventually do not.

        The actor is computed from ``user_id`` at every write site, so a
        row cannot claim a person synced it while carrying no user.
        """
        import inspect

        from app.features.teaching.sync import sync_question_bank

        params = inspect.signature(sync_question_bank).parameters
        assert "actor" not in params
        assert str(params["user_id"].annotation) in {
            "int | None",
            "Optional[int]",
        }


class TestTheConstantsAreDistinct:
    def test_they_do_not_collide(self) -> None:
        assert SYNC_ACTOR_USER != SYNC_ACTOR_DEPLOY_BOT

    def test_they_fit_the_column(self) -> None:
        """The column is String(16); a longer value would be truncated or
        rejected depending on the backend."""
        assert len(SYNC_ACTOR_USER) <= 16
        assert len(SYNC_ACTOR_DEPLOY_BOT) <= 16


class TestTheModelDefault:
    def test_a_row_written_without_an_actor_reads_as_a_user(self) -> None:
        """Matches the migration's server default, so existing rows — all
        synced through the admin UI — keep the right attribution."""
        from app.features.teaching.models import QuestionBankConfig

        column = QuestionBankConfig.__table__.c.synced_by_actor
        assert column.server_default is not None
        assert SYNC_ACTOR_USER in str(column.server_default.arg)
        assert not column.nullable
