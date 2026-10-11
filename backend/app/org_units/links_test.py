"""Relationships between org units that are not ownership."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, OrgUnitLink, User
from app.org_units.errors import (
    LinkedToItself,
    LinkTargetNotFound,
    OrgUnitNotFound,
    UnknownRelation,
)
from app.org_units.links import add_link
from app.security import hash_password
from tests.places import administers

#: An id no org unit has.
NOWHERE = 999_999


def _org_unit(db: Session, name: str) -> OrgUnit:
    unit = OrgUnit(name=name, type="organisation")
    db.add(unit)
    db.commit()
    db.refresh(unit)

    return unit


def _links(db: Session) -> list[OrgUnitLink]:
    return list(db.scalars(select(OrgUnitLink)).all())


@pytest.fixture
def school(db_session: Session) -> OrgUnit:
    return _org_unit(db_session, "Severn Medical School")


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """Somebody else's tree, which the school teaches at."""
    return _org_unit(db_session, "Wye Trust")


@pytest.fixture
def manager(db_session: Session, school: OrgUnit) -> User:
    """Holds ``manage_users`` and administers the school alone."""
    user = User(
        username="manager",
        email="manager@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="system_administrator",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    administers(db_session, user.id, school.id)

    return user


def test_a_link_from_an_org_unit_outside_their_reach_is_not_found(
    db_session: Session, manager: User, school: OrgUnit, trust: OrgUnit
) -> None:
    with pytest.raises(OrgUnitNotFound):
        add_link(
            db_session,
            manager,
            trust.id,
            target_id=school.id,
            relation="teaches_at",
        )

    with pytest.raises(OrgUnitNotFound):
        add_link(
            db_session,
            manager,
            NOWHERE,
            target_id=school.id,
            relation="teaches_at",
        )

    assert _links(db_session) == []


def test_an_org_unit_is_not_linked_to_itself(
    db_session: Session, manager: User, school: OrgUnit
) -> None:
    with pytest.raises(LinkedToItself):
        add_link(
            db_session,
            manager,
            school.id,
            target_id=school.id,
            relation="teaches_at",
        )


def test_a_link_to_an_id_no_org_unit_has_is_refused(
    db_session: Session, manager: User, school: OrgUnit
) -> None:
    with pytest.raises(LinkTargetNotFound):
        add_link(
            db_session,
            manager,
            school.id,
            target_id=NOWHERE,
            relation="teaches_at",
        )


def test_a_relation_outside_the_vocabulary_is_refused(
    db_session: Session, manager: User, school: OrgUnit, trust: OrgUnit
) -> None:
    with pytest.raises(UnknownRelation):
        add_link(
            db_session,
            manager,
            school.id,
            target_id=trust.id,
            relation="admires",
        )

    assert _links(db_session) == []


def test_a_link_is_written_to_an_org_unit_they_do_not_administer(
    db_session: Session, manager: User, school: OrgUnit, trust: OrgUnit
) -> None:
    """Only the end the link is from is checked for ownership."""
    add_link(
        db_session,
        manager,
        school.id,
        target_id=trust.id,
        relation="teaches_at",
    )

    (link,) = _links(db_session)
    assert link.source_id == school.id
    assert link.target_id == trust.id
    assert link.relation == "teaches_at"
    assert link.created_by == manager.id


def test_the_same_link_asked_for_twice_is_written_once(
    db_session: Session, manager: User, school: OrgUnit, trust: OrgUnit
) -> None:
    for _ in range(2):
        add_link(
            db_session,
            manager,
            school.id,
            target_id=trust.id,
            relation="teaches_at",
        )

    assert len(_links(db_session)) == 1


def test_a_second_relation_between_the_same_two_is_its_own_link(
    db_session: Session, manager: User, school: OrgUnit, trust: OrgUnit
) -> None:
    add_link(
        db_session,
        manager,
        school.id,
        target_id=trust.id,
        relation="teaches_at",
    )
    add_link(
        db_session, manager, school.id, target_id=trust.id, relation="hosts"
    )

    assert {link.relation for link in _links(db_session)} == {
        "teaches_at",
        "hosts",
    }
