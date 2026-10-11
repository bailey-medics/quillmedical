"""Saving somebody's page: what is checked first, and what is written."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.enrolment import is_enrolled
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import (
    OrgUnit,
    OrgUnitFeature,
    PractisingCompetency,
    User,
    UserCompetency,
    org_unit_member,
)
from app.organisations import add_org_unit_member
from app.security import hash_password, verify_password
from app.users.errors import (
    AccountOutOfScope,
    EnrolmentNotAllowed,
    PasswordTooShort,
    PlaceNotFound,
    PlatformRoleNotAllowed,
    PractisingWhereNotAMember,
    ProfessionOutOfScope,
    SelfGranting,
    SuperadminRoleNotAllowed,
)
from app.users.update import (
    AccountChanges,
    acts_on_whole_account,
    changes_platform_role,
    changes_profession,
    update_account,
)
from tests.competencies import hold
from tests.places import administers

#: A competency a consultant holds from their profession.
HELD = "perform_venepuncture"
#: One a consultant does not hold, and a teaching admin may grant.
TEACHING = "view_teaching_results"
#: One a consultant does not hold, and a teaching admin may not grant.
NOT_TEACHING = "manage_users"

MODULE = "first-module"


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


def _serve(db: Session, org: OrgUnit, module_id: str, synced_by: int) -> None:
    """Switch teaching on at *org* and have it serve one module."""
    db.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=synced_by
        )
    )
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=module_id,
            version=1,
            title="A module",
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


def _held(user: User) -> set[str]:
    return set(user.get_final_competencies())


def _memberships(db: Session, user: User) -> dict[int, str]:
    return {
        int(unit_id): str(capacity)
        for unit_id, capacity in db.execute(
            select(
                org_unit_member.c.org_unit_id, org_unit_member.c.capacity
            ).where(org_unit_member.c.user_id == user.id)
        ).all()
    }


def _practice(
    db: Session, user: User
) -> set[tuple[int | None, str, int | None]]:
    """Each practice row: where, what, and who authorised it."""
    return {
        (row.org_unit_id, row.competency, row.authorised_by)
        for row in db.scalars(
            select(PractisingCompetency).where(
                PractisingCompetency.user_id == user.id
            )
        ).all()
    }


def _grant_rows_in_the_database(
    db: Session, user: User, competency: str
) -> int:
    """How many grant rows have been sent, leaving out any still pending."""
    return len(
        db.execute(
            select(UserCompetency.id).where(
                UserCompetency.user_id == user.id,
                UserCompetency.competency_id == competency,
            )
        ).all()
    )


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _org_unit(db_session, "Severn Trust", "organisation")


@pytest.fixture
def ward(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _org_unit(db_session, "Ward 4", "site", trust)


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """A tree the manager does not administer."""
    return _org_unit(db_session, "Wye Trust", "organisation")


@pytest.fixture
def manager(db_session: Session, trust: OrgUnit, ward: OrgUnit) -> User:
    """Holds ``manage_users``, and administers the trust and the ward."""
    user = _person(db_session, "manager", "system_administrator")
    administers(db_session, user.id, trust.id)
    administers(db_session, user.id, ward.id)

    return user


@pytest.fixture
def coordinator(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching``, a scoped manager, at the trust."""
    return _person(db_session, "coordinator", "teaching_admin", trust)


@pytest.fixture
def delegate(db_session: Session, trust: OrgUnit) -> User:
    """Holds only what a teaching admin may grant."""
    return _person(db_session, "delegate", "teaching_delegate", trust)


@pytest.fixture
def surgeon(db_session: Session, trust: OrgUnit, ward: OrgUnit) -> User:
    """A consultant who belongs to the trust and the ward."""
    user = _person(db_session, "surgeon", "consultant", trust, ward)
    user.full_name = "Sam Surgeon"
    db_session.commit()

    return user


# --- whether a save acts on the whole account -------------------------------


def test_a_save_that_sends_nothing_does_not_act_on_the_account(
    surgeon: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    assert not acts_on_whole_account(
        surgeon, AccountChanges(), member_of={trust.id, ward.id}
    )


def test_every_field_sent_as_it_is_held_does_not_act_on_the_account(
    surgeon: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    """The form carries every field on every save, changed or not."""
    unchanged = AccountChanges(
        username=" surgeon ",
        name=" Sam Surgeon ",
        email=" surgeon@example.test ",
        password="",
        base_profession="consultant",
        platform_role="standard",
        org_unit_ids=[ward.id, trust.id],
    )

    assert not acts_on_whole_account(
        surgeon, unchanged, member_of={trust.id, ward.id}
    )


def test_what_they_hold_and_where_they_practise_is_not_the_account(
    surgeon: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    """The lists, practice and enrolments each have their own check."""
    changes = AccountChanges(
        additional_competencies=[TEACHING],
        removed_competencies=[HELD],
        practising={ward.id: []},
        teaching_enrolments={trust.id: {MODULE: None}},
    )

    assert not acts_on_whole_account(
        surgeon, changes, member_of={trust.id, ward.id}
    )


@pytest.mark.parametrize(
    "changes",
    [
        AccountChanges(base_profession="receptionist"),
        AccountChanges(platform_role="superadmin"),
        AccountChanges(password="x"),
        AccountChanges(username="sam"),
        AccountChanges(name="Sam Smith"),
        AccountChanges(name=""),
        AccountChanges(email="sam@example.test"),
        AccountChanges(org_unit_ids=[]),
    ],
    ids=[
        "profession",
        "platform role",
        "password",
        "username",
        "name",
        "name cleared",
        "email",
        "org units",
    ],
)
def test_one_field_that_differs_acts_on_the_account(
    surgeon: User, trust: OrgUnit, ward: OrgUnit, changes: AccountChanges
) -> None:
    assert acts_on_whole_account(
        surgeon, changes, member_of={trust.id, ward.id}
    )


def test_a_blank_name_is_no_change_for_somebody_with_no_name(
    db_session: Session,
) -> None:
    nameless = _person(db_session, "nameless", "consultant")

    assert nameless.full_name is None
    assert not acts_on_whole_account(
        nameless, AccountChanges(name="  "), member_of=set()
    )


def test_an_address_in_other_capitals_counts_as_a_change(
    surgeon: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    """Compared as sent, trimmed only, though it is stored in lower case.

    ``change_identity`` goes on to treat it as no change. The route has
    always asked the question this way, and the rule moved as it was.
    """
    assert acts_on_whole_account(
        surgeon,
        AccountChanges(email="Surgeon@Example.Test"),
        member_of={trust.id, ward.id},
    )


def test_one_org_unit_more_or_fewer_acts_on_the_account(
    surgeon: User, trust: OrgUnit, ward: OrgUnit, other_trust: OrgUnit
) -> None:
    belongs = {trust.id, ward.id}

    assert acts_on_whole_account(
        surgeon, AccountChanges(org_unit_ids=[trust.id]), member_of=belongs
    )
    assert acts_on_whole_account(
        surgeon,
        AccountChanges(org_unit_ids=[trust.id, ward.id, other_trust.id]),
        member_of=belongs,
    )


def test_no_org_units_is_no_change_for_somebody_who_belongs_nowhere(
    surgeon: User,
) -> None:
    assert not acts_on_whole_account(
        surgeon, AccountChanges(org_unit_ids=[]), member_of=set()
    )


def test_a_profession_or_role_counts_only_when_it_differs(
    surgeon: User,
) -> None:
    same = AccountChanges(
        base_profession="consultant", platform_role="standard"
    )
    different = AccountChanges(
        base_profession="receptionist", platform_role="superadmin"
    )

    assert not changes_profession(surgeon, AccountChanges())
    assert not changes_profession(surgeon, same)
    assert changes_profession(surgeon, different)
    assert not changes_platform_role(surgeon, AccountChanges())
    assert not changes_platform_role(surgeon, same)
    assert changes_platform_role(surgeon, different)


# --- which refusal comes first ----------------------------------------------


def test_an_account_out_of_scope_is_reported_before_a_profession(
    db_session: Session, coordinator: User, surgeon: User, delegate: User
) -> None:
    """A teaching admin may neither reach a consultant nor make one."""
    with pytest.raises(AccountOutOfScope):
        update_account(
            db_session,
            coordinator,
            surgeon,
            AccountChanges(base_profession="receptionist"),
        )

    # The same profession given to somebody they do reach is refused for
    # the profession, so the first refusal was not the only one waiting.
    with pytest.raises(ProfessionOutOfScope):
        update_account(
            db_session,
            coordinator,
            delegate,
            AccountChanges(base_profession="receptionist"),
        )


def test_a_profession_out_of_scope_is_reported_before_a_platform_role(
    db_session: Session, coordinator: User, delegate: User
) -> None:
    with pytest.raises(ProfessionOutOfScope):
        update_account(
            db_session,
            coordinator,
            delegate,
            AccountChanges(
                base_profession="receptionist", platform_role="superadmin"
            ),
        )


def test_a_platform_role_is_reported_before_a_taken_username(
    db_session: Session, coordinator: User, delegate: User, surgeon: User
) -> None:
    with pytest.raises(PlatformRoleNotAllowed):
        update_account(
            db_session,
            coordinator,
            delegate,
            AccountChanges(username="surgeon", platform_role="superadmin"),
        )


def test_granting_to_yourself_is_reported_before_a_taken_username(
    db_session: Session, manager: User, surgeon: User
) -> None:
    with pytest.raises(SelfGranting):
        update_account(
            db_session,
            manager,
            manager,
            AccountChanges(username="surgeon", additional_competencies=[]),
        )

    assert manager.username == "manager"


def test_who_they_are_is_settled_before_what_they_hold(
    db_session: Session, manager: User, surgeon: User
) -> None:
    """A short password is reported before a promotion nobody may make."""
    with pytest.raises(PasswordTooShort):
        update_account(
            db_session,
            manager,
            surgeon,
            AccountChanges(password="short", platform_role="superadmin"),
        )


def test_what_they_hold_is_settled_before_where_they_belong(
    db_session: Session, manager: User, surgeon: User, other_trust: OrgUnit
) -> None:
    with pytest.raises(SuperadminRoleNotAllowed):
        update_account(
            db_session,
            manager,
            surgeon,
            AccountChanges(
                platform_role="superadmin", org_unit_ids=[other_trust.id]
            ),
        )


def test_a_refused_org_unit_writes_no_competency_rows(
    db_session: Session,
    manager: User,
    surgeon: User,
    trust: OrgUnit,
    ward: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    """The competencies come first, and are still not sent when it fails."""
    with pytest.raises(PlaceNotFound):
        update_account(
            db_session,
            manager,
            surgeon,
            AccountChanges(
                additional_competencies=[TEACHING],
                org_unit_ids=[other_trust.id],
            ),
        )

    assert _grant_rows_in_the_database(db_session, surgeon, TEACHING) == 0

    # What the session dependency does when a route raises.
    db_session.rollback()

    assert TEACHING not in _held(surgeon)
    assert set(_memberships(db_session, surgeon)) == {trust.id, ward.id}


def test_practice_is_checked_against_where_the_same_save_put_them(
    db_session: Session, manager: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    starter = _person(db_session, "starter", "consultant")

    update_account(
        db_session,
        manager,
        starter,
        AccountChanges(org_unit_ids=[ward.id], practising={ward.id: [HELD]}),
    )

    assert _practice(db_session, starter) == {(ward.id, HELD, manager.id)}


def test_practice_where_the_same_save_took_them_from_is_refused(
    db_session: Session,
    manager: User,
    surgeon: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    with pytest.raises(PractisingWhereNotAMember):
        update_account(
            db_session,
            manager,
            surgeon,
            AccountChanges(
                org_unit_ids=[trust.id], practising={ward.id: [HELD]}
            ),
        )


def test_practice_may_be_given_for_what_the_same_save_granted(
    db_session: Session, manager: User, surgeon: User, ward: OrgUnit
) -> None:
    update_account(
        db_session,
        manager,
        surgeon,
        AccountChanges(
            additional_competencies=[TEACHING],
            practising={ward.id: [TEACHING]},
        ),
    )

    assert _practice(db_session, surgeon) == {(ward.id, TEACHING, manager.id)}


# --- what is and is not touched ---------------------------------------------


def test_a_save_that_sends_nothing_changes_nothing(
    db_session: Session,
    manager: User,
    surgeon: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    update_account(
        db_session,
        manager,
        surgeon,
        AccountChanges(practising={ward.id: [HELD]}),
    )
    db_session.commit()
    password_before = surgeon.password_hash
    held_before = _held(surgeon)

    update_account(db_session, manager, surgeon, AccountChanges())
    db_session.commit()

    assert surgeon.username == "surgeon"
    assert surgeon.full_name == "Sam Surgeon"
    assert surgeon.email == "surgeon@example.test"
    assert surgeon.password_hash == password_before
    assert surgeon.base_profession == "consultant"
    assert surgeon.platform_role == "standard"
    assert _held(surgeon) == held_before
    assert _memberships(db_session, surgeon) == {
        trust.id: "staff",
        ward.id: "staff",
    }
    assert _practice(db_session, surgeon) == {(ward.id, HELD, manager.id)}


def test_one_field_sent_leaves_the_others_alone(
    db_session: Session,
    manager: User,
    surgeon: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    held_before = _held(surgeon)

    update_account(
        db_session, manager, surgeon, AccountChanges(name="Sam Smith")
    )
    db_session.commit()

    assert surgeon.full_name == "Sam Smith"
    assert surgeon.username == "surgeon"
    assert surgeon.email == "surgeon@example.test"
    assert _held(surgeon) == held_before
    assert set(_memberships(db_session, surgeon)) == {trust.id, ward.id}


def test_no_org_units_sent_is_an_answer_and_none_sent_is_not(
    db_session: Session,
    manager: User,
    surgeon: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    update_account(db_session, manager, surgeon, AccountChanges())

    assert set(_memberships(db_session, surgeon)) == {trust.id, ward.id}

    update_account(
        db_session, manager, surgeon, AccountChanges(org_unit_ids=[])
    )

    assert _memberships(db_session, surgeon) == {}


def test_no_organisation_sent_for_enrolments_is_still_asked_about(
    db_session: Session, manager: User, surgeon: User
) -> None:
    """Sent empty is sent: somebody who does not run teaching is refused."""
    update_account(db_session, manager, surgeon, AccountChanges())

    with pytest.raises(EnrolmentNotAllowed):
        update_account(
            db_session,
            manager,
            surgeon,
            AccountChanges(teaching_enrolments={}),
        )


def test_a_teaching_admin_changes_teaching_competencies_on_a_full_form(
    db_session: Session,
    coordinator: User,
    surgeon: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    """The account is out of their reach; the teaching competencies are not.

    The form carries the unchanged name, address and org units with it,
    and none of them is a reason to refuse.
    """
    update_account(
        db_session,
        coordinator,
        surgeon,
        AccountChanges(
            username="surgeon",
            name="Sam Surgeon",
            email="surgeon@example.test",
            password="",
            org_unit_ids=[trust.id, ward.id],
            additional_competencies=[TEACHING],
        ),
    )
    db_session.commit()

    assert TEACHING in _held(surgeon)

    # One changed letter in the name and the same save is refused.
    with pytest.raises(AccountOutOfScope):
        update_account(
            db_session,
            coordinator,
            surgeon,
            AccountChanges(
                name="Sam Surgeons", additional_competencies=[TEACHING]
            ),
        )


# --- the whole save ---------------------------------------------------------


def test_one_save_settles_every_part_together(
    db_session: Session, manager: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    """Somebody who belonged nowhere is set up in one go."""
    # Running teaching reaches the organisations somebody belongs to.
    hold(manager, "manage_teaching")
    add_org_unit_member(db_session, trust.id, manager.id, "staff")
    db_session.commit()
    _serve(db_session, trust, MODULE, manager.id)
    starter = _person(db_session, "starter", "consultant")

    update_account(
        db_session,
        manager,
        starter,
        AccountChanges(
            username=" sam ",
            name=" Sam Surgeon ",
            email=" Sam@Example.Test ",
            password="Password456!",
            base_profession="consultant",
            additional_competencies=["view_teaching_analytics"],
            removed_competencies=["certify_death"],
            org_unit_ids=[trust.id, ward.id],
            practising={ward.id: [HELD]},
            teaching_enrolments={trust.id: {MODULE: None}},
        ),
    )
    db_session.commit()
    db_session.refresh(starter)

    assert starter.username == "sam"
    assert starter.full_name == "Sam Surgeon"
    assert starter.email == "sam@example.test"
    assert verify_password("Password456!", starter.password_hash)
    assert "view_teaching_analytics" in _held(starter)
    assert "certify_death" not in _held(starter)
    assert _memberships(db_session, starter) == {
        trust.id: "staff",
        ward.id: "trainee",
    }
    assert (ward.id, HELD, manager.id) in _practice(db_session, starter)
    assert is_enrolled(
        db_session,
        starter.id,
        org_unit_id=trust.id,
        question_bank_id=MODULE,
    )
