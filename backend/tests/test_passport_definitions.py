"""Tests for app/features/passport/definitions.py.

Exercised against the real catalogue rather than a fixture, because the
point of this module is that the passport and CBAC share one vocabulary.
A fixture would pass while the shared files said something else.

The competencies named below are chosen for what they demonstrate:
``prescribe_sact`` has the UK SACT Board's four levels, and
``perform_cannulation`` deliberately has no scale — it is signed off or
it is not. If either changes in ``shared/competency-definitions/`` these tests
should be updated to name others with the same shape, not loosened.
"""

from __future__ import annotations

import pytest

from app.features.passport import definitions
from app.features.passport.definitions import (
    UnknownCompetencyError,
    UnknownLevelError,
)

LEVELLED = "prescribe_sact"
NO_SCALE = "perform_cannulation"


class TestCompetencyRef:
    def test_returns_the_id_and_its_display_name(self) -> None:
        ref = definitions.competency_ref(LEVELLED)

        assert ref.id == LEVELLED
        assert ref.name

    def test_refuses_an_unknown_competency_by_name(self) -> None:
        with pytest.raises(UnknownCompetencyError, match="made_up_thing"):
            definitions.competency_ref("made_up_thing")

    def test_the_refusal_says_where_competencies_are_defined(self) -> None:
        """A caller seeing this should know where to look."""
        with pytest.raises(
            UnknownCompetencyError, match="competency-definitions"
        ):
            definitions.competency_ref("made_up_thing")


class TestLevels:
    def test_a_levelled_competency_reports_its_scale(self) -> None:
        assert definitions.has_levels(LEVELLED) is True
        assert len(definitions.levels(LEVELLED)) >= 2

    def test_a_competency_without_a_scale_has_no_levels(self) -> None:
        """Cannulation is signed off or it is not."""
        assert definitions.has_levels(NO_SCALE) is False
        assert definitions.levels(NO_SCALE) == []

    def test_levels_keep_the_order_the_definition_lists(self) -> None:
        """Order is the scale, so nothing here may sort them."""
        from app.cbac.competencies import get_competency_details

        entry = get_competency_details(LEVELLED)
        assert entry is not None and entry.levels is not None

        assert [lvl.id for lvl in definitions.levels(LEVELLED)] == [
            lvl.id for lvl in entry.levels
        ]

    def test_every_level_carries_its_wording(self) -> None:
        """The words are what make a sign-off readable years later."""
        for level in definitions.levels(LEVELLED):
            assert level.name
            assert level.name != level.id


class TestLevelRef:
    def test_returns_the_id_and_wording_to_store(self) -> None:
        first = definitions.levels(LEVELLED)[0]

        ref = definitions.level_ref(LEVELLED, first.id)

        assert ref.id == first.id
        assert ref.name == first.name

    def test_refuses_a_level_the_competency_does_not_declare(self) -> None:
        with pytest.raises(UnknownLevelError, match="no level"):
            definitions.level_ref(LEVELLED, "made_up_level")

    def test_the_refusal_names_the_available_levels(self) -> None:
        """A wrong level nearly always means a stale scale."""
        first = definitions.levels(LEVELLED)[0]

        with pytest.raises(UnknownLevelError, match=first.id):
            definitions.level_ref(LEVELLED, "made_up_level")

    def test_refuses_any_level_where_there_is_no_scale(self) -> None:
        with pytest.raises(UnknownLevelError, match="declares no levels"):
            definitions.level_ref(NO_SCALE, "unsupervised")

    def test_refuses_an_unknown_competency(self) -> None:
        with pytest.raises(UnknownCompetencyError):
            definitions.level_ref("made_up_thing", "any")


class TestLevelOrder:
    def test_counts_from_zero_in_declared_order(self) -> None:
        declared = definitions.levels(LEVELLED)

        for position, level in enumerate(declared):
            assert definitions.level_order(LEVELLED, level.id) == position

    def test_a_later_level_orders_above_an_earlier_one(self) -> None:
        """This is what tells a progression from a reassessment."""
        declared = definitions.levels(LEVELLED)

        first = definitions.level_order(LEVELLED, declared[0].id)
        last = definitions.level_order(LEVELLED, declared[-1].id)

        assert last > first

    def test_refuses_an_unknown_level(self) -> None:
        with pytest.raises(UnknownLevelError):
            definitions.level_order(LEVELLED, "made_up_level")


class TestExpiry:
    def test_returns_none_where_nothing_expires(self) -> None:
        """Most competencies do not expire, and that is not a gap."""
        assert definitions.expires_after_months(NO_SCALE) is None

    def test_refuses_an_unknown_competency(self) -> None:
        with pytest.raises(UnknownCompetencyError):
            definitions.expires_after_months("made_up_thing")


class TestSharedVocabulary:
    """The passport adds no second registry, and this proves it."""

    def test_the_passport_reads_the_same_catalogue_as_cbac(self) -> None:
        from app.cbac.competencies import COMPETENCY_IDS

        assert LEVELLED in COMPETENCY_IDS
        assert NO_SCALE in COMPETENCY_IDS

    def test_every_catalogue_competency_can_be_referenced(self) -> None:
        """Nothing in the shared catalogue is unusable by the passport.

        A competency that could not be signed off would be a silent hole:
        the picker would offer it and the write would fail.
        """
        from app.cbac.competencies import COMPETENCY_IDS

        for competency_id in COMPETENCY_IDS:
            ref = definitions.competency_ref(competency_id)
            assert ref.id == competency_id
            assert ref.name

    def test_every_declared_level_resolves(self) -> None:
        from app.cbac.competencies import COMPETENCIES

        for entry in COMPETENCIES:
            for level in entry.levels or []:
                resolved = definitions.level_ref(entry.id, level.id)
                assert resolved.name == level.name
