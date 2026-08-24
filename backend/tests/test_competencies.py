"""Tests for app/cbac/competencies.py.

Covers:
- The real shared/competencies.yaml validates against CompetencyEntry
  with no errors
- get_competency_details / is_valid_competency lookups
- CompetencyEntry rejects malformed data (extra fields, missing fields)
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.cbac.competencies import (
    COMPETENCIES,
    COMPETENCY_IDS,
    CompetencyEntry,
    get_competency_details,
    is_valid_competency,
)


def test_all_real_competencies_loaded() -> None:
    assert len(COMPETENCIES) > 0
    assert len(COMPETENCIES) == len(COMPETENCY_IDS)
    assert "prescribe_non_controlled" in COMPETENCY_IDS
    assert "access_patient_records" in COMPETENCY_IDS


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
