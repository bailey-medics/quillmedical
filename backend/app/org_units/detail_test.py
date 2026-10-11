"""What one org unit's own page shows, and to whom."""

import pytest
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.cbac.positions import set_clinical_lead
from app.models import (
    OrgUnit,
    OrgUnitFeature,
    User,
    org_unit_patient_member,
)
from app.org_units.detail import names_of, org_unit_detail
from app.org_units.errors import OrgUnitNotFound
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import hold
from tests.places import administers

#: An id no org unit has.
NOWHERE = 999_999


def _person(
    db: Session,
    username: str,
    profession: str,
    full_name: str | None = None,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        full_name=full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def _org_unit(
    db: Session, name: str, type_: str, parent: OrgUnit | None = None
) -> OrgUnit:
    unit = OrgUnit(
        name=name,
        type=type_,
        parent_id=parent.id if parent is not None else None,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)

    return unit


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """An organisation carrying two features and two patients."""
    unit = _org_unit(db_session, "Severn Trust", "organisation")
    for feature_key in ("teaching", "messaging"):
        db_session.add(
            OrgUnitFeature(org_unit_id=unit.id, feature_key=feature_key)
        )
    for patient_id in ("patient-b", "patient-a"):
        db_session.execute(
            insert(org_unit_patient_member).values(
                org_unit_id=unit.id, patient_id=patient_id
            )
        )
    db_session.commit()

    return unit


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """Somebody else's tree."""
    return _org_unit(db_session, "Wye Trust", "organisation")


@pytest.fixture
def manager(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_users`` and administers the trust."""
    user = _person(db_session, "manager", "system_administrator")
    administers(db_session, user.id, trust.id)

    return user


@pytest.fixture
def teaching_admin(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching`` and belongs to the trust."""
    user = _person(db_session, "coordinator", "teaching_admin")
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    db_session.commit()

    return user


# --- names ------------------------------------------------------------------


def test_no_ids_need_no_names(db_session: Session) -> None:
    assert names_of(db_session, set()) == {}


def test_a_name_is_the_full_name_or_failing_that_the_username(
    db_session: Session,
) -> None:
    named = _person(db_session, "ada", "consultant", full_name="Ada Byron")
    unnamed = _person(db_session, "grace", "consultant")

    assert names_of(db_session, {named.id, unnamed.id}) == {
        named.id: "Ada Byron",
        unnamed.id: "grace",
    }


# --- one org unit -----------------------------------------------------------


def test_an_org_unit_outside_their_reach_is_not_found(
    db_session: Session, manager: User, other_trust: OrgUnit
) -> None:
    with pytest.raises(OrgUnitNotFound):
        org_unit_detail(db_session, manager, other_trust.id)

    with pytest.raises(OrgUnitNotFound):
        org_unit_detail(db_session, manager, NOWHERE)


def test_an_administrator_sees_features_and_patients_in_order(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    detail = org_unit_detail(db_session, manager, trust.id)

    assert detail.unit is trust
    assert detail.parent is None
    assert detail.features == ["messaging", "teaching"]
    assert detail.patient_ids == ["patient-a", "patient-b"]


def test_a_scoped_manager_is_shown_neither_features_nor_patients(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    """Left out here, so that no page can show them by mistake."""
    detail = org_unit_detail(db_session, teaching_admin, trust.id)

    assert detail.unit is trust
    assert detail.features == []
    assert detail.patient_ids == []


def test_managing_patient_membership_shows_the_patients_and_no_features(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    hold(teaching_admin, "manage_patient_membership")
    db_session.commit()

    detail = org_unit_detail(db_session, teaching_admin, trust.id)

    assert detail.features == []
    assert detail.patient_ids == ["patient-a", "patient-b"]


def test_the_children_come_by_name_with_who_leads_each(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    ward_b = _org_unit(db_session, "Ward B", "site", trust)
    ward_a = _org_unit(db_session, "Ward A", "site", trust)
    lead = _person(db_session, "ada", "consultant", full_name="Ada Byron")
    add_org_unit_member(db_session, ward_b.id, lead.id, "staff")
    set_clinical_lead(db_session, ward_b, lead)
    db_session.commit()

    detail = org_unit_detail(db_session, manager, trust.id)

    assert detail.children == [ward_a, ward_b]
    # A child whose post is vacant is absent.
    assert detail.child_leads == {ward_b.id: lead.id}
    assert detail.lead_names == {lead.id: "Ada Byron"}
    assert detail.clinical_lead_id is None


def test_an_org_unit_with_nothing_inside_has_no_children_and_no_leads(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    detail = org_unit_detail(db_session, manager, trust.id)

    assert detail.children == []
    assert detail.child_leads == {}
    assert detail.lead_names == {}


def test_a_site_comes_with_its_parent_and_its_own_lead(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    ward = _org_unit(db_session, "Ward A", "site", trust)
    lead = _person(db_session, "ada", "consultant")
    add_org_unit_member(db_session, ward.id, lead.id, "staff")
    set_clinical_lead(db_session, ward, lead)
    db_session.commit()

    detail = org_unit_detail(db_session, manager, ward.id)

    assert detail.unit is ward
    assert detail.parent is trust
    assert detail.clinical_lead_id == lead.id
    # Nothing is inherited: the trust's features and patients are its own.
    assert detail.features == []
    assert detail.patient_ids == []
