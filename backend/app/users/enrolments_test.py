"""Who may settle somebody's teaching enrolments, and where."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from app.features.teaching.access import (
    MODULES_COMPETENCY,
    RESULTS_COMPETENCY,
    BelongsNowhere,
    may_enter_module,
)
from app.features.teaching.enrolment import is_enrolled
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from app.users import enrolments
from app.users.enrolments import settle_teaching_enrolments
from app.users.errors import (
    EnrolledBelongingNowhere,
    EnrolmentEndPassed,
    EnrolmentNotAllowed,
    EnrolmentOutsideTheirOrganisations,
    ModuleNotServed,
    SelfEnrolment,
    UserAdminError,
)
from tests.competencies import hold

FIRST = "first-module"
SECOND = "second-module"


def _person(
    db: Session,
    username: str,
    profession: str,
    *places: OrgUnit,
    platform_role: str = "standard",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
    )
    db.add(user)
    db.flush()

    for place in places:
        add_org_unit_member(db, place.id, user.id, "staff")

    db.commit()
    db.refresh(user)

    return user


def _organisation(db: Session, name: str) -> OrgUnit:
    """An organisation with teaching switched on."""
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()
    db.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db.commit()
    db.refresh(org)

    return org


def _serve(db: Session, org: OrgUnit, module_id: str, synced_by: int) -> None:
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=module_id,
            version=1,
            title=module_id.replace("-", " ").title(),
            description="A module.",
            type="uniform",
            config_yaml={},
            synced_by=synced_by,
        )
    )
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=module_id,
            is_live=True,
            active_version=1,
        )
    )
    db.commit()


def _on(db: Session, person: User, org: OrgUnit, module_id: str) -> bool:
    return is_enrolled(
        db, person.id, org_unit_id=org.id, question_bank_id=module_id
    )


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _organisation(db_session, "Severn Trust")


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """An organisation the coordinator does not belong to."""
    return _organisation(db_session, "Wye Trust")


@pytest.fixture
def coordinator(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching`` and belongs to the trust."""
    user = _person(db_session, "coordinator", "teaching_admin", trust)
    _serve(db_session, trust, FIRST, user.id)
    _serve(db_session, trust, SECOND, user.id)

    return user


@pytest.fixture
def operator(db_session: Session) -> User:
    """Belongs nowhere and holds nothing from teaching."""
    return _person(
        db_session,
        "operator",
        "superadmin_profession",
        platform_role="superadmin",
    )


@pytest.fixture
def consultant(db_session: Session, trust: OrgUnit) -> User:
    """The person enrolled, holding nothing from teaching."""
    return _person(db_session, "consultant", "consultant", trust)


def _past() -> datetime:
    return datetime.now(UTC) - timedelta(days=1)


def _future() -> datetime:
    return datetime.now(UTC) + timedelta(days=30)


# --- who may send enrolments at all -----------------------------------------


def test_somebody_who_does_not_run_teaching_is_refused(
    db_session: Session, trust: OrgUnit, coordinator: User, consultant: User
) -> None:
    manager = _person(db_session, "manager", "system_administrator", trust)

    with pytest.raises(EnrolmentNotAllowed) as refusal:
        settle_teaching_enrolments(
            db_session, manager, consultant, {trust.id: {FIRST: None}}
        )

    assert isinstance(refusal.value, UserAdminError)
    assert refusal.value.status_code == 403
    assert refusal.value.message == "Not allowed"
    assert not _on(db_session, consultant, trust, FIRST)


def test_they_are_refused_even_when_no_organisation_is_named(
    db_session: Session, trust: OrgUnit, consultant: User
) -> None:
    manager = _person(db_session, "manager", "system_administrator", trust)

    with pytest.raises(EnrolmentNotAllowed):
        settle_teaching_enrolments(db_session, manager, consultant, {})


def test_an_operator_may_settle_them_holding_nothing_from_teaching(
    db_session: Session,
    trust: OrgUnit,
    coordinator: User,
    operator: User,
    consultant: User,
) -> None:
    """No limit on their reach either: they belong nowhere."""
    settle_teaching_enrolments(
        db_session, operator, consultant, {trust.id: {FIRST: None}}
    )

    assert _on(db_session, consultant, trust, FIRST)


# --- where they may be settled ----------------------------------------------


def test_an_organisation_the_person_does_not_belong_to_is_refused(
    db_session: Session,
    coordinator: User,
    consultant: User,
    other_trust: OrgUnit,
) -> None:
    with pytest.raises(EnrolmentOutsideTheirOrganisations) as refusal:
        settle_teaching_enrolments(
            db_session, coordinator, consultant, {other_trust.id: {}}
        )

    assert refusal.value.status_code == 422
    assert refusal.value.message == (
        "Enrolment can be set only at an organisation they belong to."
    )


def test_an_org_unit_beneath_their_organisation_is_not_an_organisation(
    db_session: Session, trust: OrgUnit, coordinator: User, consultant: User
) -> None:
    """Enrolment is set at the organisation, never at a site inside it."""
    ward = OrgUnit(name="Ward 4", type="site", parent_id=trust.id)
    db_session.add(ward)
    db_session.flush()
    add_org_unit_member(db_session, ward.id, consultant.id, "staff")
    db_session.commit()

    with pytest.raises(EnrolmentOutsideTheirOrganisations):
        settle_teaching_enrolments(
            db_session, coordinator, consultant, {ward.id: {FIRST: None}}
        )


def test_an_organisation_the_caller_does_not_reach_is_refused(
    db_session: Session,
    coordinator: User,
    consultant: User,
    other_trust: OrgUnit,
) -> None:
    """The person belongs there; the caller does not."""
    add_org_unit_member(db_session, other_trust.id, consultant.id, "staff")
    db_session.commit()

    with pytest.raises(EnrolmentNotAllowed) as refusal:
        settle_teaching_enrolments(
            db_session, coordinator, consultant, {other_trust.id: {}}
        )

    assert refusal.value.status_code == 403
    assert refusal.value.message == "Not allowed"


# --- when an enrolment ends -------------------------------------------------


def test_an_end_date_already_passed_is_refused(
    db_session: Session, trust: OrgUnit, coordinator: User, consultant: User
) -> None:
    with pytest.raises(EnrolmentEndPassed) as refusal:
        settle_teaching_enrolments(
            db_session,
            coordinator,
            consultant,
            {trust.id: {FIRST: None, SECOND: _past()}},
        )

    assert refusal.value.status_code == 422
    assert refusal.value.message == (
        "An enrolment's end date has already passed."
    )
    assert not _on(db_session, consultant, trust, FIRST)


def test_an_end_date_with_no_time_zone_is_read_as_utc(
    db_session: Session, trust: OrgUnit, coordinator: User, consultant: User
) -> None:
    with pytest.raises(EnrolmentEndPassed):
        settle_teaching_enrolments(
            db_session,
            coordinator,
            consultant,
            {trust.id: {FIRST: _past().replace(tzinfo=None)}},
        )

    settle_teaching_enrolments(
        db_session,
        coordinator,
        consultant,
        {trust.id: {FIRST: _future().replace(tzinfo=None)}},
    )

    assert _on(db_session, consultant, trust, FIRST)


# --- enrolling yourself -----------------------------------------------------


@pytest.fixture
def lone_coordinator(db_session: Session, trust: OrgUnit) -> User:
    """Runs teaching and holds neither learner competency."""
    user = _person(db_session, "lone", "system_administrator", trust)
    hold(user, "manage_teaching")
    db_session.commit()
    _serve(db_session, trust, FIRST, user.id)

    return user


def test_nobody_gives_themselves_a_competency_by_enrolling(
    db_session: Session, trust: OrgUnit, lone_coordinator: User
) -> None:
    with pytest.raises(SelfEnrolment) as refusal:
        settle_teaching_enrolments(
            db_session,
            lone_coordinator,
            lone_coordinator,
            {trust.id: {FIRST: None}},
        )

    assert refusal.value.status_code == 403
    assert refusal.value.message == (
        "Somebody else must enrol you in teaching."
    )
    assert MODULES_COMPETENCY not in lone_coordinator.get_final_competencies()


def test_naming_no_module_for_yourself_gives_nothing_and_is_allowed(
    db_session: Session, trust: OrgUnit, lone_coordinator: User
) -> None:
    settle_teaching_enrolments(
        db_session, lone_coordinator, lone_coordinator, {trust.id: {}}
    )

    held = set(lone_coordinator.get_final_competencies())

    assert RESULTS_COMPETENCY not in held


def test_somebody_holding_both_competencies_may_enrol_themselves(
    db_session: Session, trust: OrgUnit, coordinator: User
) -> None:
    settle_teaching_enrolments(
        db_session, coordinator, coordinator, {trust.id: {FIRST: None}}
    )

    assert _on(db_session, coordinator, trust, FIRST)


def test_an_operator_may_enrol_themselves(
    db_session: Session, trust: OrgUnit, coordinator: User, operator: User
) -> None:
    add_org_unit_member(db_session, trust.id, operator.id, "staff")
    db_session.commit()

    settle_teaching_enrolments(
        db_session, operator, operator, {trust.id: {FIRST: None}}
    )

    assert _on(db_session, operator, trust, FIRST)


# --- what the organisation serves -------------------------------------------


def test_a_module_the_organisation_does_not_serve_is_refused(
    db_session: Session, trust: OrgUnit, coordinator: User, consultant: User
) -> None:
    with pytest.raises(ModuleNotServed) as refusal:
        settle_teaching_enrolments(
            db_session,
            coordinator,
            consultant,
            {trust.id: {"no-such-module": None}},
        )

    assert refusal.value.status_code == 422
    assert refusal.value.message == (
        "A module was named that the organisation does not serve."
    )


def test_belonging_nowhere_under_the_organisation_is_refused(
    db_session: Session,
    trust: OrgUnit,
    coordinator: User,
    consultant: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The check before it already asks that they belong there.

    So the writer cannot be brought to say this through the function,
    and it is made to here, to show its refusal is passed on in words
    written for the caller.
    """

    def _belongs_nowhere(*args: object, **kwargs: object) -> None:
        raise BelongsNowhere()

    monkeypatch.setattr(enrolments, "settle_enrolments", _belongs_nowhere)

    with pytest.raises(EnrolledBelongingNowhere) as refusal:
        settle_teaching_enrolments(
            db_session, coordinator, consultant, {trust.id: {FIRST: None}}
        )

    assert refusal.value.status_code == 422
    assert refusal.value.message == (
        "They must belong to an org unit under the organisation before "
        "they can be enrolled."
    )


# --- settling ---------------------------------------------------------------


def test_naming_a_module_enrols_them_and_lets_them_in(
    db_session: Session, trust: OrgUnit, coordinator: User, consultant: User
) -> None:
    settle_teaching_enrolments(
        db_session, coordinator, consultant, {trust.id: {FIRST: _future()}}
    )

    assert may_enter_module(
        db_session, consultant, org_unit_id=trust.id, question_bank_id=FIRST
    )
    assert not _on(db_session, consultant, trust, SECOND)


def test_the_list_is_the_whole_answer_for_an_organisation(
    db_session: Session, trust: OrgUnit, coordinator: User, consultant: User
) -> None:
    settle_teaching_enrolments(
        db_session,
        coordinator,
        consultant,
        {trust.id: {FIRST: None, SECOND: None}},
    )

    settle_teaching_enrolments(
        db_session, coordinator, consultant, {trust.id: {SECOND: None}}
    )

    assert not _on(db_session, consultant, trust, FIRST)
    assert _on(db_session, consultant, trust, SECOND)


def test_no_modules_for_an_organisation_ends_what_they_are_on_there(
    db_session: Session, trust: OrgUnit, coordinator: User, consultant: User
) -> None:
    settle_teaching_enrolments(
        db_session, coordinator, consultant, {trust.id: {FIRST: None}}
    )

    settle_teaching_enrolments(
        db_session, coordinator, consultant, {trust.id: {}}
    )

    assert not _on(db_session, consultant, trust, FIRST)


def test_naming_no_organisation_touches_nothing(
    db_session: Session, trust: OrgUnit, coordinator: User, consultant: User
) -> None:
    settle_teaching_enrolments(
        db_session, coordinator, consultant, {trust.id: {FIRST: None}}
    )

    settle_teaching_enrolments(db_session, coordinator, consultant, {})

    assert _on(db_session, consultant, trust, FIRST)


# --- which is reported, and what is written, when something is wrong --------


def test_every_organisation_is_checked_before_any_is_written(
    db_session: Session,
    trust: OrgUnit,
    coordinator: User,
    consultant: User,
    other_trust: OrgUnit,
) -> None:
    with pytest.raises(EnrolmentOutsideTheirOrganisations):
        settle_teaching_enrolments(
            db_session,
            coordinator,
            consultant,
            {trust.id: {FIRST: None}, other_trust.id: {}},
        )

    assert not _on(db_session, consultant, trust, FIRST)


def test_where_the_person_belongs_is_reported_before_the_callers_reach(
    db_session: Session,
    coordinator: User,
    consultant: User,
    other_trust: OrgUnit,
) -> None:
    """Neither belongs there, and the answer is about the person."""
    with pytest.raises(EnrolmentOutsideTheirOrganisations):
        settle_teaching_enrolments(
            db_session,
            coordinator,
            consultant,
            {other_trust.id: {FIRST: _past()}},
        )


def test_the_callers_reach_is_reported_before_the_end_date(
    db_session: Session,
    coordinator: User,
    consultant: User,
    other_trust: OrgUnit,
) -> None:
    add_org_unit_member(db_session, other_trust.id, consultant.id, "staff")
    db_session.commit()

    with pytest.raises(EnrolmentNotAllowed):
        settle_teaching_enrolments(
            db_session,
            coordinator,
            consultant,
            {other_trust.id: {FIRST: _past()}},
        )


def test_the_end_date_is_reported_before_enrolling_yourself(
    db_session: Session, trust: OrgUnit, lone_coordinator: User
) -> None:
    with pytest.raises(EnrolmentEndPassed):
        settle_teaching_enrolments(
            db_session,
            lone_coordinator,
            lone_coordinator,
            {trust.id: {FIRST: _past()}},
        )


def test_enrolling_yourself_is_reported_before_a_module_not_served(
    db_session: Session, trust: OrgUnit, lone_coordinator: User
) -> None:
    with pytest.raises(SelfEnrolment):
        settle_teaching_enrolments(
            db_session,
            lone_coordinator,
            lone_coordinator,
            {trust.id: {"no-such-module": None}},
        )
