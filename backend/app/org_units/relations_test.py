"""The vocabulary of links between org units, and what each one confers."""

import pytest
from sqlalchemy import String

from app.models import OrgUnitLink
from app.org_units.relations import (
    ORG_UNIT_RELATION_IDS,
    ORG_UNIT_RELATIONS,
    OrgUnitRelation,
    get_org_unit_relation,
    relation_grants_reach,
    validate_org_unit_relation,
)

#: Values that look like a relation and are not one. Each is a slip
#: somebody could make: the wrong case, the name shown to a person, a stray
#: space, a word for ownership, and nothing at all.
NOT_RELATIONS = ["Hosts", "Teaches at", " hosts", "hosts ", "owns", ""]


def _column_length() -> int:
    column_type = OrgUnitLink.__table__.c.relation.type
    assert isinstance(column_type, String)

    length = column_type.length
    assert isinstance(length, int)

    return length


def test_no_two_relations_share_an_id() -> None:
    """A second entry with the same id would silently replace the first."""
    assert len(set(ORG_UNIT_RELATION_IDS)) == len(ORG_UNIT_RELATIONS)


def test_no_two_relations_are_shown_under_the_same_name() -> None:
    names = [relation.display_name for relation in ORG_UNIT_RELATIONS]

    assert len(set(names)) == len(names)


def test_the_list_of_ids_follows_the_definitions_in_order() -> None:
    assert ORG_UNIT_RELATION_IDS == tuple(
        relation.id for relation in ORG_UNIT_RELATIONS
    )


@pytest.mark.parametrize("relation_id", ORG_UNIT_RELATION_IDS)
def test_every_id_fits_the_column_it_is_stored_in(relation_id: str) -> None:
    assert 0 < len(relation_id) <= _column_length()


@pytest.mark.parametrize("relation", ORG_UNIT_RELATIONS)
def test_looking_a_relation_up_by_id_gives_its_own_definition(
    relation: OrgUnitRelation,
) -> None:
    assert get_org_unit_relation(relation.id) is relation


@pytest.mark.parametrize("value", NOT_RELATIONS)
def test_looking_up_something_that_is_not_a_relation_gives_none(
    value: str,
) -> None:
    """Ids are matched exactly: not by case, by display name or trimmed."""
    assert get_org_unit_relation(value) is None


@pytest.mark.parametrize("relation_id", ORG_UNIT_RELATION_IDS)
def test_a_known_relation_is_handed_back_unchanged(relation_id: str) -> None:
    assert validate_org_unit_relation(relation_id) == relation_id


@pytest.mark.parametrize("value", NOT_RELATIONS)
def test_something_that_is_not_a_relation_is_refused(value: str) -> None:
    with pytest.raises(ValueError, match="Unknown org_unit relation"):
        validate_org_unit_relation(value)


def test_the_refusal_names_what_was_given_and_every_known_relation() -> None:
    """Whoever reads the error needs the value and what to use instead."""
    with pytest.raises(ValueError) as refusal:
        validate_org_unit_relation("owns")

    message = str(refusal.value)

    assert "Unknown org_unit relation: owns." in message
    for relation_id in ORG_UNIT_RELATION_IDS:
        assert relation_id in message


@pytest.mark.parametrize("relation", ORG_UNIT_RELATIONS)
def test_reach_is_read_from_the_relations_own_definition(
    relation: OrgUnitRelation,
) -> None:
    assert relation_grants_reach(relation.id) is relation.grants_reach


@pytest.mark.parametrize("value", NOT_RELATIONS)
def test_reach_of_something_that_is_not_a_relation_raises_not_false(
    value: str,
) -> None:
    """Nothing is known about it, which is not knowing it grants nothing."""
    with pytest.raises(ValueError, match="Unknown org_unit relation"):
        relation_grants_reach(value)
