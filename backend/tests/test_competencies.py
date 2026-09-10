"""Tests for app/cbac/competencies.py.

Covers:
- The real shared/competency-definitions/ directory validates against
  CompetencyEntry with no errors
- Every file in the directory is merged into one catalogue, and ids are
  unique across the whole directory rather than within a file
- get_competency_details / is_valid_competency lookups
- CompetencyEntry rejects malformed data (extra fields, missing fields)
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.cbac.competencies import (
    COMPETENCIES,
    COMPETENCY_DEFINITIONS_DIR,
    COMPETENCY_IDS,
    CompetencyEntry,
    _load_competencies,
    get_competency_details,
    is_valid_competency,
)


def test_all_real_competencies_loaded() -> None:
    assert len(COMPETENCIES) > 0
    assert len(COMPETENCIES) == len(COMPETENCY_IDS)
    assert "prescribe_non_controlled" in COMPETENCY_IDS
    assert "access_patient_records" in COMPETENCY_IDS


def test_every_definition_file_is_merged() -> None:
    """Ids from both kinds of definition file reach one catalogue.

    The split is for the reader; the code sees one flat catalogue. A
    clinical id and a feature-admin id are both present, so a file that
    stopped being read would fail here rather than silently shrinking
    what anyone may do.
    """
    assert "certify_death" in COMPETENCY_IDS  # clinical.yaml
    assert "manage_teaching_content" in COMPETENCY_IDS  # feature-admin.yaml


def test_real_directory_holds_more_than_one_file() -> None:
    """Guards the merge itself, not just the loader's ability to merge."""
    files = sorted(COMPETENCY_DEFINITIONS_DIR.glob("*.yaml"))
    assert len(files) > 1, (
        "Expected the catalogue to be split across files; found "
        f"{[f.name for f in files]}"
    )


def test_ids_are_unique_across_the_whole_directory() -> None:
    assert len(set(COMPETENCY_IDS)) == len(COMPETENCY_IDS)


def test_load_merges_files_in_filename_order(tmp_path: Path) -> None:
    (tmp_path / "b_second.yaml").write_text(
        'competencies:\n  - id: second\n    display_name: "Second"\n'
    )
    (tmp_path / "a_first.yaml").write_text(
        'competencies:\n  - id: first\n    display_name: "First"\n'
    )

    loaded = _load_competencies(tmp_path)

    # Sorted by filename, so the merged order is the same everywhere
    # rather than whatever order the filesystem happens to return.
    assert [c.id for c in loaded] == ["first", "second"]


def test_load_rejects_an_id_defined_in_two_files(tmp_path: Path) -> None:
    """A duplicate id must fail loudly, naming both files.

    Ids are referenced from stored records, so if one were defined twice
    which definition applied would depend on filename order.
    """
    (tmp_path / "clinical.yaml").write_text(
        'competencies:\n  - id: shared_id\n    display_name: "One"\n'
    )
    (tmp_path / "feature-admin.yaml").write_text(
        'competencies:\n  - id: shared_id\n    display_name: "Two"\n'
    )

    with pytest.raises(ValueError, match="Duplicate competency id"):
        _load_competencies(tmp_path)


def test_load_rejects_an_empty_directory(tmp_path: Path) -> None:
    """No files means a bad path or a missing mount, not an empty set.

    Returning nothing would leave every user holding no competencies,
    which fails open in the sense that matters: nobody could be refused
    for a reason anyone could see.
    """
    with pytest.raises(FileNotFoundError, match="No competency definitions"):
        _load_competencies(tmp_path)


def test_get_competency_details_known_id() -> None:
    details = get_competency_details("prescribe_controlled_schedule_2")
    assert details is not None
    assert details.id == "prescribe_controlled_schedule_2"
    assert details.display_name == "Prescribe Schedule 2 Controlled Drugs"


def test_get_competency_details_unknown_id() -> None:
    assert get_competency_details("does-not-exist") is None


def test_is_valid_competency() -> None:
    assert is_valid_competency("prescribe_non_controlled") is True
    assert is_valid_competency("does-not-exist") is False


def test_competency_entry_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        CompetencyEntry(
            id="x",
            display_name="X",
            risk_level="low",  # type: ignore[call-arg]
        )


def test_competency_entry_rejects_missing_display_name() -> None:
    with pytest.raises(ValidationError):
        CompetencyEntry(id="x")  # type: ignore[call-arg]
