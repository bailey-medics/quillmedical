"""Tests for app/features/passport/specialties.py.

The loader refuses a bad list at startup; these tests name each rule, so a
CI failure says which one broke rather than only that the app would not
start. Each rule gets a fixture directory breaking it, and one test loads the
real ``shared/passport-specialties/``.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.features.passport import specialties
from app.features.passport.specialties import (
    SPECIALTIES_DIR,
    Specialty,
    get_specialty,
    load_specialties,
)

ASSESSABLE = "perform_cannulation"
OTHER_ASSESSABLE = "perform_venepuncture"


def _write(directory: Path, filename: str, body: str) -> None:
    (directory / filename).write_text(body)


def _specialty(
    specialty_id: str, *competency_ids: str, display_name: str = "A thing"
) -> str:
    lines = [
        f"id: {specialty_id}",
        f'display_name: "{display_name}"',
        "common_competencies:",
        *(f"  - {competency_id}" for competency_id in competency_ids),
    ]
    return "\n".join(lines) + "\n"


class TestTheRealFolder:
    def test_loads(self) -> None:
        loaded = load_specialties(SPECIALTIES_DIR)

        assert [s.id for s in loaded] == [
            "general_medicine",
            "general_surgery",
            "oncology",
        ]

    def test_oncology_leads_with_sact(self) -> None:
        oncology = get_specialty("oncology")

        assert oncology is not None
        assert oncology.display_name == "Oncology"
        assert oncology.common_competencies[0] == "prescribe_sact"

    def test_an_unknown_specialty_is_none_rather_than_an_error(self) -> None:
        """A profile naming a specialty since removed must stay readable."""
        assert get_specialty("cardiology") is None

    def test_the_ids_match_the_loaded_specialties(self) -> None:
        assert specialties.SPECIALTY_IDS == tuple(
            s.id for s in specialties.SPECIALTIES
        )


class TestAValidFolder:
    def test_loads_in_filename_order(self, tmp_path: Path) -> None:
        _write(tmp_path, "b.yaml", _specialty("b", ASSESSABLE))
        _write(tmp_path, "a.yaml", _specialty("a", OTHER_ASSESSABLE))

        loaded = load_specialties(tmp_path)

        assert [s.id for s in loaded] == ["a", "b"]

    def test_keeps_the_order_the_file_lists(self, tmp_path: Path) -> None:
        _write(
            tmp_path, "a.yaml", _specialty("a", OTHER_ASSESSABLE, ASSESSABLE)
        )

        (loaded,) = load_specialties(tmp_path)

        assert loaded.common_competencies == (OTHER_ASSESSABLE, ASSESSABLE)

    def test_an_empty_list_is_allowed(self, tmp_path: Path) -> None:
        """A new specialty can be added before anybody has chosen its
        competencies; it then orders nothing."""
        _write(
            tmp_path,
            "a.yaml",
            "id: a\ndisplay_name: A\ncommon_competencies: []\n",
        )

        (loaded,) = load_specialties(tmp_path)

        assert loaded.common_competencies == ()


class TestEachRule:
    def test_an_empty_folder_is_refused(self, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError):
            load_specialties(tmp_path)

    def test_an_unknown_competency_is_refused(self, tmp_path: Path) -> None:
        _write(tmp_path, "a.yaml", _specialty("a", "made_up_thing"))

        with pytest.raises(ValueError, match="made_up_thing.*not in"):
            load_specialties(tmp_path)

    def test_a_competency_not_marked_assessable_is_refused(
        self, tmp_path: Path
    ) -> None:
        _write(tmp_path, "a.yaml", _specialty("a", "manage_users"))

        with pytest.raises(ValueError, match="manage_users.*assessable"):
            load_specialties(tmp_path)

    def test_a_retired_competency_is_refused(self, tmp_path: Path) -> None:
        _write(
            tmp_path, "a.yaml", _specialty("a", "access_clinician_passport")
        )

        with pytest.raises(ValueError, match="retired"):
            load_specialties(tmp_path)

    def test_a_competency_listed_twice_is_refused(
        self, tmp_path: Path
    ) -> None:
        _write(tmp_path, "a.yaml", _specialty("a", ASSESSABLE, ASSESSABLE))

        with pytest.raises(ValueError, match="twice"):
            load_specialties(tmp_path)

    def test_a_filename_that_does_not_match_the_id_is_refused(
        self, tmp_path: Path
    ) -> None:
        _write(tmp_path, "oncology.yaml", _specialty("cardiology", ASSESSABLE))

        with pytest.raises(ValueError, match="must be cardiology.yaml"):
            load_specialties(tmp_path)

    def test_an_id_in_two_files_is_refused(self, tmp_path: Path) -> None:
        _write(tmp_path, "a.yaml", _specialty("a", ASSESSABLE))
        _write(tmp_path, "b.yaml", _specialty("a", ASSESSABLE))

        with pytest.raises(ValueError, match="in both a.yaml and b.yaml"):
            load_specialties(tmp_path)

    def test_an_unexpected_field_is_refused(self, tmp_path: Path) -> None:
        """A ``required:`` key would be the first step towards a
        syllabus, so the model has no room for one."""
        _write(
            tmp_path,
            "a.yaml",
            _specialty("a", ASSESSABLE) + "required: true\n",
        )

        with pytest.raises(ValidationError):
            load_specialties(tmp_path)

    def test_every_problem_is_named_at_once(self, tmp_path: Path) -> None:
        """One run shows everything to fix, not the first thing."""
        _write(tmp_path, "a.yaml", _specialty("a", "made_up_thing"))
        _write(tmp_path, "b.yaml", _specialty("b", "manage_users"))

        with pytest.raises(ValueError) as refused:
            load_specialties(tmp_path)

        assert "made_up_thing" in str(refused.value)
        assert "manage_users" in str(refused.value)


class TestTheModel:
    def test_is_immutable(self) -> None:
        specialty = Specialty(
            id="a", display_name="A", common_competencies=(ASSESSABLE,)
        )

        with pytest.raises(ValidationError):
            specialty.id = "b"  # type: ignore[misc]
