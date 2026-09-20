"""Tests for app/org_units/types.py.

Covers:
- The real shared/org-unit-types.yaml loads and validates
- Every type the site routes accept today is a known org_unit type, so
  the merge cannot strand an existing row on an unknown type
- requires_parent produces the two-level shape the application has
- Only the top of a tree carries features
- Capability lookups refuse an unknown type rather than answering False
- Malformed definitions are refused at load
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from app.org_units.types import (
    ORG_UNIT_TYPE_IDS,
    ORG_UNIT_TYPES,
    ORGANISATION_TYPE,
    ROOT_TYPE_IDS,
    OrgUnitTypeEntry,
    _load_org_unit_types,
    get_org_unit_type,
    type_can_have_members,
    type_can_hold_competencies,
    type_can_hold_features,
    type_can_hold_positions,
    type_requires_parent,
    validate_org_unit_type,
)

CAPABILITY_LOOKUPS = (
    type_requires_parent,
    type_can_hold_features,
    type_can_hold_positions,
    type_can_hold_competencies,
    type_can_have_members,
)


def test_real_definitions_load() -> None:
    assert len(ORG_UNIT_TYPES) > 0
    assert len(ORG_UNIT_TYPES) == len(ORG_UNIT_TYPE_IDS)
    assert ORGANISATION_TYPE in ORG_UNIT_TYPE_IDS
    assert "site" in ORG_UNIT_TYPE_IDS


def test_ids_are_unique() -> None:
    assert len(set(ORG_UNIT_TYPE_IDS)) == len(ORG_UNIT_TYPE_IDS)


def test_every_type_is_described() -> None:
    for entry in ORG_UNIT_TYPES:
        assert entry.display_name.strip()
        assert entry.description.strip()


#: What the retired sites surface accepted as a type.
#:
#: A historical fact rather than configuration, so it is written here
#: rather than imported: the list it came from went with the routes that
#: validated against it.
TYPES_A_SITE_COULD_ALREADY_HOLD = {
    "hospital",
    "building",
    "ward",
    "room",
    "clinic",
    "department",
    "virtual",
}


def test_existing_site_vocabulary_is_covered() -> None:
    """Every type a site may already hold has to remain a valid type.

    A site type missing from this file would be a row the merge cannot
    carry across, found at migration time rather than now.
    """
    assert TYPES_A_SITE_COULD_ALREADY_HOLD <= set(ORG_UNIT_TYPE_IDS)


def test_the_roots_are_the_kinds_of_organisation() -> None:
    """The two-level shape comes from the flags, not a rule about roots.

    There is more than one kind of organisation — a practice and a
    teaching establishment are both tops of trees — so what makes
    something a root is the flag rather than one name.
    """
    assert ORGANISATION_TYPE in ROOT_TYPE_IDS
    for type_id in ORG_UNIT_TYPE_IDS:
        assert type_requires_parent(type_id) is (type_id not in ROOT_TYPE_IDS)


def test_every_kind_of_organisation_is_named() -> None:
    """The kinds an organisation could be are all here.

    They lived in a column on the organisations table, which is going.
    One missing would be an organisation that cannot be created once the
    screens read this file.
    """
    assert ROOT_TYPE_IDS == {
        "organisation",
        "hospital_team",
        "gp_practice",
        "private_clinic",
        "teaching_establishment",
    }


def test_only_the_top_of_a_tree_holds_features() -> None:
    for type_id in ORG_UNIT_TYPE_IDS:
        assert type_can_hold_features(type_id) is (type_id in ROOT_TYPE_IDS)


def test_a_site_names_a_clinical_lead() -> None:
    """Teaching resolves its clinical lead at a site, so a site holds posts."""
    assert type_can_hold_positions("site") is True
    assert type_can_hold_competencies("site") is True
    assert type_can_have_members("site") is True


def test_a_room_is_only_an_address() -> None:
    assert type_can_hold_positions("room") is False
    assert type_can_hold_competencies("room") is False
    assert type_can_have_members("room") is False
    assert type_can_hold_features("room") is False


def test_get_org_unit_type_known_id() -> None:
    entry = get_org_unit_type("ward")
    assert entry is not None
    assert entry.id == "ward"


def test_get_org_unit_type_unknown_id() -> None:
    assert get_org_unit_type("does-not-exist") is None


def test_validate_returns_a_known_type_unchanged() -> None:
    assert validate_org_unit_type("ward") == "ward"


def test_validate_names_the_known_types_when_it_refuses() -> None:
    with pytest.raises(ValueError) as exc_info:
        validate_org_unit_type("trust")
    message = str(exc_info.value)
    assert "trust" in message
    assert "organisation" in message
    assert "site" in message


@pytest.mark.parametrize("lookup", CAPABILITY_LOOKUPS)
def test_capability_lookups_refuse_an_unknown_type(
    lookup: object,
) -> None:
    """An unknown place is unknown, not a place that may hold nothing.

    Answering False would read as a settled decision and refuse
    legitimate work without saying why.
    """
    with pytest.raises(ValueError):
        lookup("does-not-exist")  # type: ignore[operator]


def test_entry_refuses_an_unexpected_field() -> None:
    with pytest.raises(ValidationError):
        OrgUnitTypeEntry(
            id="ward",
            display_name="Ward",
            description="A ward.",
            requires_parent=True,
            can_hold_features=False,
            can_hold_positions=True,
            can_hold_competencies=True,
            can_have_members=True,
            can_hold_beds=True,  # type: ignore[call-arg]
        )


def test_entry_refuses_a_missing_flag() -> None:
    with pytest.raises(ValidationError):
        OrgUnitTypeEntry(  # type: ignore[call-arg]
            id="ward",
            display_name="Ward",
            description="A ward.",
            requires_parent=True,
        )


def _write(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "org-unit-types.yaml"
    path.write_text(body)
    return path


def test_load_refuses_an_empty_file(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        _load_org_unit_types(_write(tmp_path, "org_unit_types: []\n"))


def test_load_refuses_a_duplicate_id(tmp_path: Path) -> None:
    entry = {
        "id": "ward",
        "display_name": "Ward",
        "description": "A ward.",
        "requires_parent": True,
        "can_hold_features": False,
        "can_hold_positions": True,
        "can_hold_competencies": True,
        "can_have_members": True,
    }
    body = yaml.safe_dump({"org_unit_types": [entry, dict(entry)]})
    with pytest.raises(ValueError) as exc_info:
        _load_org_unit_types(_write(tmp_path, body))
    assert "ward" in str(exc_info.value)
