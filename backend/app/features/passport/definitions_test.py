"""Tests for app/features/passport/definitions.py.

Exercised against the real frameworks, stored in the tables as a deploy
stores them, rather than a fixture, because a fixture would pass while
the shared files said something else. The one exception is a retired
competency: no real framework has one yet, so those tests build a small
catalogue by hand.

The competencies named below are chosen for what they demonstrate:
``uk_sact_board_2023_prescribe_sact`` has the UK SACT Board's four levels, and
``clinical_perform_cannulation`` deliberately has no scale - it is signed off or
it is not. If either changes in ``shared/competency-definitions/`` these tests
should be updated to name others with the same shape, not loosened.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.cbac.competencies import CompetencyEntry, Framework
from app.features.passport import definitions
from app.features.passport.catalogue import StoredCatalogue, stored_catalogue
from app.features.passport.definitions import (
    NotAssessableError,
    UnknownCompetencyError,
    UnknownLevelError,
)

LEVELLED = "uk_sact_board_2023_prescribe_sact"
# Signed off one tumour site at a time.
SCOPED = "uk_sact_board_2023_prescribe_sact"
NO_SCALE = "clinical_perform_cannulation"


@pytest.fixture
def catalogue(stored_frameworks: Session) -> StoredCatalogue:
    """The real frameworks, read back from the tables."""
    return stored_catalogue(stored_frameworks)


def _with_a_retired_competency() -> StoredCatalogue:
    """A framework of one retired competency, built by hand."""
    retired = CompetencyEntry(
        id="sheet_refer",
        display_name="Refer a patient",
        assessable=True,
        framework_id="sheet",
        retired_on=date(2026, 11, 1),
        retired_in_version=2,
    )

    return StoredCatalogue(
        frameworks={
            "sheet": Framework(
                id="sheet",
                name="A sheet",
                publisher="A trust",
                version=2,
                description="",
            )
        },
        competencies={"sheet": [retired]},
        entries={"sheet_refer": retired},
    )


class TestCompetencyRef:
    def test_returns_the_id_and_its_display_name(
        self, catalogue: StoredCatalogue
    ) -> None:
        ref = definitions.competency_ref(catalogue, LEVELLED)

        assert ref.id == LEVELLED
        assert ref.name

    def test_refuses_an_unknown_competency_by_name(
        self, catalogue: StoredCatalogue
    ) -> None:
        with pytest.raises(UnknownCompetencyError, match="made_up_thing"):
            definitions.competency_ref(catalogue, "made_up_thing")

    def test_the_refusal_says_no_framework_defines_it(
        self, catalogue: StoredCatalogue
    ) -> None:
        """A caller seeing this should know where to look: the frameworks
        Quill holds, which are read from the tables, not from files."""
        with pytest.raises(
            UnknownCompetencyError, match="No framework Quill holds"
        ):
            definitions.competency_ref(catalogue, "made_up_thing")


class TestAssessableRef:
    """What a record being written now may name.

    ``manage_users`` is the permission chosen to demonstrate the refusal
    because it is the one nobody could mistake for a skill.
    """

    def test_returns_the_id_and_name_of_an_assessable_competency(
        self, catalogue: StoredCatalogue
    ) -> None:
        ref = definitions.assessable_ref(catalogue, NO_SCALE)

        assert ref.id == NO_SCALE
        assert ref.name

    def test_a_software_permission_is_unknown_to_the_passport(
        self, catalogue: StoredCatalogue
    ) -> None:
        """The stored frameworks hold framework competencies only.

        Before the passport read the tables, a permission was known and
        refused as not assessable. Now it is in no framework, so it is
        not known at all, and the route answers 404 rather than 400.
        """
        with pytest.raises(UnknownCompetencyError, match="manage_users"):
            definitions.assessable_ref(catalogue, "manage_users")

    def test_refuses_a_retired_competency(self) -> None:
        with pytest.raises(NotAssessableError):
            definitions.assessable_ref(
                _with_a_retired_competency(), "sheet_refer"
            )

    def test_an_unknown_id_is_unknown_rather_than_not_assessable(
        self, catalogue: StoredCatalogue
    ) -> None:
        """Two refusals, so a route can answer 404 for one and 400 for
        the other."""
        with pytest.raises(UnknownCompetencyError):
            definitions.assessable_ref(catalogue, "made_up_thing")

    def test_a_retired_competency_stays_readable(self) -> None:
        """Only new writes are refused. An old record naming it still
        resolves its name."""
        assert definitions.competency_ref(
            _with_a_retired_competency(), "sheet_refer"
        ).name


class TestLevels:
    def test_a_levelled_competency_reports_its_scale(
        self, catalogue: StoredCatalogue
    ) -> None:
        assert definitions.has_levels(catalogue, LEVELLED) is True
        assert len(definitions.levels(catalogue, LEVELLED)) >= 2

    def test_a_competency_without_a_scale_has_no_levels(
        self, catalogue: StoredCatalogue
    ) -> None:
        """Cannulation is signed off or it is not."""
        assert definitions.has_levels(catalogue, NO_SCALE) is False
        assert definitions.levels(catalogue, NO_SCALE) == []

    def test_levels_keep_the_order_the_definition_lists(
        self, catalogue: StoredCatalogue
    ) -> None:
        """Order is the scale, so nothing here may sort them."""
        from app.cbac.competencies import get_competency_details

        entry = get_competency_details(LEVELLED)
        assert entry is not None and entry.levels is not None

        assert [lvl.id for lvl in definitions.levels(catalogue, LEVELLED)] == [
            lvl.id for lvl in entry.levels
        ]

    def test_every_level_carries_its_wording(
        self, catalogue: StoredCatalogue
    ) -> None:
        """The words are what make a sign-off readable years later."""
        for level in definitions.levels(catalogue, LEVELLED):
            assert level.name
            assert level.name != level.id


class TestScopes:
    def test_a_scoped_competency_reports_its_scopes(
        self, catalogue: StoredCatalogue
    ) -> None:
        assert definitions.has_scopes(catalogue, SCOPED) is True
        assert "other" in [
            scope.id for scope in definitions.scopes(catalogue, SCOPED)
        ]

    def test_a_competency_assessed_as_a_whole_has_none(
        self, catalogue: StoredCatalogue
    ) -> None:
        assert definitions.has_scopes(catalogue, NO_SCALE) is False
        assert definitions.scopes(catalogue, NO_SCALE) == []

    def test_a_scope_ref_carries_both_halves(
        self, catalogue: StoredCatalogue
    ) -> None:
        ref = definitions.scope_ref(catalogue, SCOPED, "lung")

        assert ref.id == "lung"
        assert ref.name == "Lung"

    def test_an_undeclared_scope_is_refused_naming_the_real_ones(
        self, catalogue: StoredCatalogue
    ) -> None:
        with pytest.raises(definitions.UnknownScopeError, match="other"):
            definitions.scope_ref(catalogue, SCOPED, "left_elbow")

    def test_a_scope_on_a_competency_with_none_is_refused(
        self, catalogue: StoredCatalogue
    ) -> None:
        with pytest.raises(
            definitions.UnknownScopeError, match="declares no scopes"
        ):
            definitions.scope_ref(catalogue, NO_SCALE, "lung")

    def test_an_unknown_competency_is_refused(
        self, catalogue: StoredCatalogue
    ) -> None:
        with pytest.raises(UnknownCompetencyError):
            definitions.has_scopes(catalogue, "not_a_competency")


class TestLevelRef:
    def test_returns_the_id_and_wording_to_store(
        self, catalogue: StoredCatalogue
    ) -> None:
        first = definitions.levels(catalogue, LEVELLED)[0]

        ref = definitions.level_ref(catalogue, LEVELLED, first.id)

        assert ref.id == first.id
        assert ref.name == first.name

    def test_refuses_a_level_the_competency_does_not_declare(
        self, catalogue: StoredCatalogue
    ) -> None:
        with pytest.raises(UnknownLevelError, match="no level"):
            definitions.level_ref(catalogue, LEVELLED, "made_up_level")

    def test_the_refusal_names_the_available_levels(
        self, catalogue: StoredCatalogue
    ) -> None:
        """A wrong level nearly always means a stale scale."""
        first = definitions.levels(catalogue, LEVELLED)[0]

        with pytest.raises(UnknownLevelError, match=first.id):
            definitions.level_ref(catalogue, LEVELLED, "made_up_level")

    def test_refuses_any_level_where_there_is_no_scale(
        self, catalogue: StoredCatalogue
    ) -> None:
        with pytest.raises(UnknownLevelError, match="declares no levels"):
            definitions.level_ref(catalogue, NO_SCALE, "unsupervised")

    def test_refuses_an_unknown_competency(
        self, catalogue: StoredCatalogue
    ) -> None:
        with pytest.raises(UnknownCompetencyError):
            definitions.level_ref(catalogue, "made_up_thing", "any")


class TestLevelOrder:
    def test_counts_from_zero_in_declared_order(
        self, catalogue: StoredCatalogue
    ) -> None:
        declared = definitions.levels(catalogue, LEVELLED)

        for position, level in enumerate(declared):
            assert (
                definitions.level_order(catalogue, LEVELLED, level.id)
                == position
            )

    def test_a_later_level_orders_above_an_earlier_one(
        self, catalogue: StoredCatalogue
    ) -> None:
        """This is what tells a progression from a reassessment."""
        declared = definitions.levels(catalogue, LEVELLED)

        first = definitions.level_order(catalogue, LEVELLED, declared[0].id)
        last = definitions.level_order(catalogue, LEVELLED, declared[-1].id)

        assert last > first

    def test_refuses_an_unknown_level(
        self, catalogue: StoredCatalogue
    ) -> None:
        with pytest.raises(UnknownLevelError):
            definitions.level_order(catalogue, LEVELLED, "made_up_level")


class TestExpiry:
    def test_returns_none_where_nothing_expires(
        self, catalogue: StoredCatalogue
    ) -> None:
        """Most competencies do not expire, and that is not a gap."""
        assert definitions.expires_after_months(catalogue, NO_SCALE) is None

    def test_refuses_an_unknown_competency(
        self, catalogue: StoredCatalogue
    ) -> None:
        with pytest.raises(UnknownCompetencyError):
            definitions.expires_after_months(catalogue, "made_up_thing")


class TestTheStoredFrameworks:
    """The passport reads every framework competency the files define."""

    def test_every_framework_competency_can_be_referenced(
        self, catalogue: StoredCatalogue
    ) -> None:
        """A competency the picker offers but the write cannot find would
        be a silent hole."""
        from app.cbac.competencies import COMPETENCIES

        in_frameworks = [c for c in COMPETENCIES if c.framework_id]

        assert in_frameworks
        for entry in in_frameworks:
            ref = definitions.competency_ref(catalogue, entry.id)
            assert ref.id == entry.id
            assert ref.name == entry.display_name

    def test_every_declared_level_resolves(
        self, catalogue: StoredCatalogue
    ) -> None:
        for entries in catalogue.competencies.values():
            for entry in entries:
                for level in entry.levels or []:
                    resolved = definitions.level_ref(
                        catalogue, entry.id, level.id
                    )
                    assert resolved.name == level.name

    def test_every_active_framework_competency_can_be_written(
        self, catalogue: StoredCatalogue
    ) -> None:
        active = [
            entry.id
            for entries in catalogue.competencies.values()
            for entry in entries
            if entry.retired_on is None
        ]

        assert active
        for competency_id in active:
            assert definitions.assessable_ref(catalogue, competency_id).id == (
                competency_id
            )


def test_a_frameworks_version_is_read_for_a_competency(
    catalogue: StoredCatalogue,
) -> None:
    """Every real framework is at version 1, Gloucestershire's included."""
    assert definitions.framework_version(catalogue, NO_SCALE) == 1
    assert (
        definitions.framework_version(
            catalogue, "ghnft_radiotherapy_record_refer_palliative"
        )
        == 1
    )


def test_a_permission_has_no_framework_version(
    catalogue: StoredCatalogue,
) -> None:
    """Nothing is signed off against a permission, which no framework holds."""
    with pytest.raises(UnknownCompetencyError, match="perform_cannulation"):
        definitions.framework_version(catalogue, "perform_cannulation")
