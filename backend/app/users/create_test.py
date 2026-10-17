"""Making an account: what is checked first, and what is written."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.base_professions import (
    SUPERADMIN_PROFESSION,
    get_profession_base_competencies,
)
from app.features.passport import cover as passport_cover
from app.features.teaching.enrolment import is_enrolled
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import (
    NewsletterSubscriber,
    OrgUnit,
    OrgUnitFeature,
    PractisingCompetency,
    User,
    UserCompetency,
    org_unit_member,
)
from app.organisations import add_org_unit_member
from app.security import hash_password, verify_password
from app.users import create as create_module
from app.users.create import NewAccount, create_account
from app.users.errors import (
    CompetenciesOutOfScope,
    EmailTaken,
    EnrolmentNotAllowed,
    MissingRequiredFields,
    NoPlaceChosen,
    PasswordTooShort,
    PlaceNotFound,
    PlatformRoleNotAllowed,
    PractisingWhereNotAMember,
    ProfessionOutOfScope,
    SuperadminRoleNotAllowed,
    UsernameTaken,
)
from tests.competencies import hold
from tests.places import administers

PASSWORD = "Password123!"

#: A competency a consultant holds from their profession.
HELD = "perform_venepuncture"
#: One a teaching admin may grant.
TEACHING = "view_teaching_analytics"
#: One a teaching admin may not grant.
NOT_TEACHING = "prescribe_non_controlled"

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
        password_hash=hash_password(PASSWORD),
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


def _new(**fields: object) -> NewAccount:
    """A new starter, with whatever a test says differently."""
    values: dict[str, object] = {
        "name": "Sam Starter",
        "username": "starter",
        "email": "starter@example.test",
        "password": PASSWORD,
        "base_profession": "consultant",
    }
    values.update(fields)

    return NewAccount(**values)  # type: ignore[arg-type]


def _account(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


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


def _grant_rows(db: Session, user: User) -> dict[str, tuple[str, int | None]]:
    """Each grant row: the competency, its source and who granted it."""
    return {
        row.competency_id: (row.source, row.granted_by)
        for row in db.scalars(
            select(UserCompetency).where(UserCompetency.user_id == user.id)
        ).all()
    }


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _org_unit(db_session, "Severn Trust", "organisation")


@pytest.fixture
def ward(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _org_unit(db_session, "Ward 4", "site", trust)


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """A tree neither caller reaches."""
    return _org_unit(db_session, "Wye Trust", "organisation")


@pytest.fixture
def manager(db_session: Session, trust: OrgUnit, ward: OrgUnit) -> User:
    """Holds ``manage_users``, and administers the trust and the ward."""
    user = _person(db_session, "manager", "system_administrator")
    administers(db_session, user.id, trust.id)
    administers(db_session, user.id, ward.id)

    return user


@pytest.fixture
def operator(db_session: Session, trust: OrgUnit) -> User:
    """Operates Quill, and holds ``manage_users`` through doing so."""
    user = _person(
        db_session,
        "operator",
        "superadmin_profession",
        platform_role="superadmin",
    )
    administers(db_session, user.id, trust.id)

    return user


@pytest.fixture
def coordinator(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching``, a scoped manager, at the trust."""
    return _person(db_session, "coordinator", "teaching_admin", trust)


@pytest.fixture
def colleague(db_session: Session) -> User:
    """Somebody whose username and address are spoken for."""
    return _person(db_session, "colleague", "consultant")


# --- what was sent ----------------------------------------------------------


@pytest.mark.parametrize(
    "missing",
    [{"email": ""}, {"email": "   "}, {"password": ""}],
    ids=["no address", "a blank address", "no password"],
)
def test_an_address_and_a_password_are_both_needed(
    db_session: Session, manager: User, missing: dict[str, object]
) -> None:
    with pytest.raises(MissingRequiredFields) as refusal:
        create_account(db_session, manager, _new(**missing))

    assert refusal.value.status_code == 400
    assert refusal.value.message == "Missing required fields"
    assert _account(db_session, "starter") is None


def test_a_password_under_eight_characters_is_refused(
    db_session: Session, manager: User
) -> None:
    with pytest.raises(PasswordTooShort):
        create_account(db_session, manager, _new(password="1234567"))

    assert _account(db_session, "starter") is None


def test_a_password_of_eight_characters_will_do(
    db_session: Session, manager: User
) -> None:
    made = create_account(db_session, manager, _new(password="12345678"))

    assert verify_password("12345678", made.password_hash)


def test_a_username_another_account_has_is_refused(
    db_session: Session, manager: User, colleague: User
) -> None:
    with pytest.raises(UsernameTaken):
        create_account(db_session, manager, _new(username="colleague"))


def test_an_address_another_account_has_is_refused_in_any_capitals(
    db_session: Session, manager: User, colleague: User
) -> None:
    with pytest.raises(EmailTaken):
        create_account(
            db_session, manager, _new(email=" Colleague@Example.Test ")
        )

    assert _account(db_session, "starter") is None


@pytest.mark.parametrize(
    ("fields", "check", "refusal"),
    [
        ({"username": "colleague"}, "check_username_free", UsernameTaken),
        ({"email": "colleague@example.test"}, "check_email_free", EmailTaken),
    ],
    ids=["the username", "the address"],
)
def test_an_account_written_since_the_check_is_refused_by_name(
    db_session: Session,
    manager: User,
    colleague: User,
    monkeypatch: pytest.MonkeyPatch,
    fields: dict[str, object],
    check: str,
    refusal: type[Exception],
) -> None:
    """Two admins making the same person at once, or a double click.

    The first look finds nothing, as it would have if the other request
    wrote its account in between, so the database's unique constraint is
    what refuses it. The answer still says which was taken, not a 500.
    """
    looks: list[str] = []
    real_check = getattr(create_module, check)

    def found_free_the_first_time(db: Session, value: str) -> None:
        looks.append(value)
        if len(looks) > 1:
            real_check(db, value)

    monkeypatch.setattr(create_module, check, found_free_the_first_time)

    with pytest.raises(refusal):
        create_account(db_session, manager, _new(**fields))

    assert len(looks) == 2
    assert _account(db_session, "starter") is None
    # The refusal is undone by its savepoint, leaving the transaction
    db_session.commit()


@pytest.mark.parametrize("username", [None, ""], ids=["left out", "empty"])
def test_a_username_not_given_is_made_from_the_name(
    db_session: Session, manager: User, username: str | None
) -> None:
    made = create_account(
        db_session,
        manager,
        _new(name="  Not With Standing ", username=username),
    )

    assert made.username == "notwithstanding"
    assert made.full_name == "Not With Standing"


def test_a_username_made_from_the_name_may_be_taken_too(
    db_session: Session, manager: User, colleague: User
) -> None:
    with pytest.raises(UsernameTaken):
        create_account(
            db_session, manager, _new(name="Col League", username=None)
        )


def test_a_username_given_is_kept_exactly_as_sent(
    db_session: Session, manager: User
) -> None:
    """Not trimmed and not put in lower case, as the route never did."""
    made = create_account(db_session, manager, _new(username=" Sam S "))

    assert made.username == " Sam S "


# --- where they are to belong -----------------------------------------------


def test_an_org_unit_nobody_has_is_refused_by_its_id(
    db_session: Session, manager: User
) -> None:
    with pytest.raises(PlaceNotFound) as refusal:
        create_account(db_session, manager, _new(org_unit_ids=[987654]))

    assert refusal.value.message == "Place 987654 not found"
    assert _account(db_session, "starter") is None


def test_an_org_unit_out_of_the_callers_reach_is_refused_the_same_way(
    db_session: Session, manager: User, trust: OrgUnit, other_trust: OrgUnit
) -> None:
    with pytest.raises(PlaceNotFound) as refusal:
        create_account(
            db_session,
            manager,
            _new(org_unit_ids=[trust.id, other_trust.id]),
        )

    assert refusal.value.message == f"Place {other_trust.id} not found"
    assert _account(db_session, "starter") is None


# --- a caller whose scope has a limit ---------------------------------------


def test_a_scoped_manager_must_put_them_somewhere(
    db_session: Session, coordinator: User
) -> None:
    with pytest.raises(NoPlaceChosen) as refusal:
        create_account(
            db_session, coordinator, _new(base_profession="teaching_delegate")
        )

    assert refusal.value.status_code == 400
    assert refusal.value.message == "Choose at least one organisation or site."
    assert _account(db_session, "starter") is None


def test_a_scoped_manager_may_not_make_an_operator(
    db_session: Session, coordinator: User, trust: OrgUnit
) -> None:
    with pytest.raises(PlatformRoleNotAllowed):
        create_account(
            db_session,
            coordinator,
            _new(
                base_profession="teaching_delegate",
                platform_role="superadmin",
                org_unit_ids=[trust.id],
            ),
        )


def test_a_scoped_manager_may_not_give_a_profession_outside_their_scope(
    db_session: Session, coordinator: User, trust: OrgUnit
) -> None:
    with pytest.raises(ProfessionOutOfScope) as refusal:
        create_account(db_session, coordinator, _new(org_unit_ids=[trust.id]))

    assert (
        refusal.value.message == "You may not give the profession consultant."
    )


def test_a_scoped_manager_may_not_grant_outside_their_scope(
    db_session: Session, coordinator: User, trust: OrgUnit
) -> None:
    with pytest.raises(CompetenciesOutOfScope) as refusal:
        create_account(
            db_session,
            coordinator,
            _new(
                base_profession="teaching_delegate",
                additional_competencies=[NOT_TEACHING],
                org_unit_ids=[trust.id],
            ),
        )

    assert (
        refusal.value.message
        == f"You may not grant or remove: {NOT_TEACHING}."
    )
    assert _account(db_session, "starter") is None


def test_a_scoped_manager_makes_an_account_within_their_scope(
    db_session: Session, coordinator: User, trust: OrgUnit
) -> None:
    made = create_account(
        db_session,
        coordinator,
        _new(
            base_profession="teaching_delegate",
            additional_competencies=[TEACHING],
            org_unit_ids=[trust.id],
        ),
    )
    db_session.commit()

    assert _held(made) == {
        "view_teaching_results",
        "take_teaching_modules",
        TEACHING,
    }
    assert _memberships(db_session, made) == {trust.id: "staff"}


def test_somebody_holding_manage_users_is_asked_none_of_that(
    db_session: Session, manager: User
) -> None:
    """No org unit, any profession, any competency."""
    made = create_account(
        db_session,
        manager,
        _new(additional_competencies=[TEACHING, "manage_users"]),
    )
    db_session.commit()

    assert made.base_profession == "consultant"
    assert {TEACHING, "manage_users"} <= _held(made)
    assert _memberships(db_session, made) == {}


def test_a_user_manager_who_is_not_an_operator_may_not_make_one(
    db_session: Session, manager: User
) -> None:
    """Only an operator may make another, here as when a page is saved.

    ``manage_users`` says what somebody may administer, and never that
    they may make somebody to run the platform. The words are the ones a
    refused promotion gives, and nobody is left behind.
    """
    assert manager.platform_role != "superadmin"

    with pytest.raises(SuperadminRoleNotAllowed) as refused:
        create_account(
            db_session,
            manager,
            _new(base_profession="patient", platform_role="superadmin"),
        )

    assert refused.value.status_code == 403
    assert refused.value.message == "Cannot grant the superadmin platform role"
    assert _account(db_session, "starter") is None


def test_an_operator_makes_an_operator_who_holds_the_operator_competencies(
    db_session: Session, operator: User
) -> None:
    """Without them every competency gate would refuse the new operator.

    They are held beside what the profession and the form gave, and the
    profession sent is the one kept.
    """
    made = create_account(
        db_session,
        operator,
        _new(
            base_profession="consultant",
            additional_competencies=[TEACHING],
            platform_role="superadmin",
        ),
    )
    db_session.commit()

    assert made.platform_role == "superadmin"
    assert made.base_profession == "consultant"
    assert _held(made) >= {HELD, TEACHING} | set(
        get_profession_base_competencies(SUPERADMIN_PROFESSION)
    )


def test_an_operator_making_a_standard_account_adds_nothing_to_it(
    db_session: Session, operator: User
) -> None:
    made = create_account(
        db_session, operator, _new(base_profession="patient")
    )
    db_session.commit()

    assert made.platform_role == "standard"
    assert _held(made) == set(get_profession_base_competencies("patient"))


# --- which refusal comes first ----------------------------------------------


def test_something_missing_is_reported_before_a_taken_username(
    db_session: Session, manager: User, colleague: User
) -> None:
    with pytest.raises(MissingRequiredFields):
        create_account(
            db_session, manager, _new(username="colleague", email="")
        )


def test_a_short_password_is_reported_before_a_taken_username(
    db_session: Session, manager: User, colleague: User
) -> None:
    with pytest.raises(PasswordTooShort):
        create_account(
            db_session, manager, _new(username="colleague", password="short")
        )


def test_a_taken_username_is_reported_before_a_taken_address(
    db_session: Session, manager: User, colleague: User
) -> None:
    with pytest.raises(UsernameTaken):
        create_account(
            db_session,
            manager,
            _new(username="colleague", email="colleague@example.test"),
        )


def test_a_taken_address_is_reported_before_an_org_unit_out_of_reach(
    db_session: Session, manager: User, colleague: User, other_trust: OrgUnit
) -> None:
    with pytest.raises(EmailTaken):
        create_account(
            db_session,
            manager,
            _new(
                email="colleague@example.test", org_unit_ids=[other_trust.id]
            ),
        )


def test_an_org_unit_out_of_reach_is_reported_before_the_callers_scope(
    db_session: Session, coordinator: User, other_trust: OrgUnit
) -> None:
    """A teaching admin may not make a consultant either."""
    with pytest.raises(PlaceNotFound):
        create_account(
            db_session, coordinator, _new(org_unit_ids=[other_trust.id])
        )


def test_no_org_unit_is_reported_before_a_platform_role(
    db_session: Session, coordinator: User
) -> None:
    with pytest.raises(NoPlaceChosen):
        create_account(
            db_session, coordinator, _new(platform_role="superadmin")
        )


def test_a_platform_role_is_reported_before_a_profession(
    db_session: Session, coordinator: User, trust: OrgUnit
) -> None:
    with pytest.raises(PlatformRoleNotAllowed):
        create_account(
            db_session,
            coordinator,
            _new(platform_role="superadmin", org_unit_ids=[trust.id]),
        )


def test_a_profession_is_reported_before_its_competencies(
    db_session: Session, coordinator: User, trust: OrgUnit
) -> None:
    """A consultant's own competencies are all outside a teaching scope."""
    with pytest.raises(ProfessionOutOfScope):
        create_account(
            db_session,
            coordinator,
            _new(
                additional_competencies=[NOT_TEACHING],
                org_unit_ids=[trust.id],
            ),
        )


def test_practice_is_reported_before_enrolments(
    db_session: Session, manager: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    """The manager does not run teaching, so both would be refused."""
    with pytest.raises(PractisingWhereNotAMember):
        create_account(
            db_session,
            manager,
            _new(
                org_unit_ids=[trust.id],
                practising={ward.id: [HELD]},
                teaching_enrolments={trust.id: {}},
            ),
        )


# --- what is written --------------------------------------------------------


def test_the_account_is_held_tidied_and_already_verified(
    db_session: Session, manager: User
) -> None:
    made = create_account(
        db_session,
        manager,
        _new(name="  Sam Starter ", email=" Sam@Example.Test "),
    )
    db_session.commit()

    assert made.id is not None
    assert made.full_name == "Sam Starter"
    assert made.email == "sam@example.test"
    assert made.email_verified is True
    assert made.password_hash != PASSWORD
    assert verify_password(PASSWORD, made.password_hash)
    assert made.base_profession == "consultant"
    assert made.platform_role == "standard"


def test_an_account_given_nothing_else_is_a_standard_patient(
    db_session: Session, manager: User
) -> None:
    made = create_account(
        db_session,
        manager,
        NewAccount(
            name="Out Side", email="pat@example.test", password=PASSWORD
        ),
    )
    db_session.commit()

    assert made.username == "outside"
    assert made.base_profession == "patient"
    assert made.platform_role == "standard"
    assert _memberships(db_session, made) == {}
    assert _practice(db_session, made) == set()


def test_what_they_hold_is_written_as_rows_and_a_grant_names_the_caller(
    db_session: Session, manager: User
) -> None:
    """A row their profession seeds is nobody's grant, so names nobody."""
    made = create_account(
        db_session,
        manager,
        _new(
            additional_competencies=[TEACHING],
            removed_competencies=["certify_death"],
        ),
    )
    db_session.commit()
    rows = _grant_rows(db_session, made)

    assert rows[TEACHING] == ("admin", manager.id)
    assert rows[HELD] == ("profession", None)
    assert "certify_death" not in _held(made)


def test_they_are_staff_at_an_organisation_and_a_trainee_beneath_one(
    db_session: Session, manager: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    made = create_account(
        db_session, manager, _new(org_unit_ids=[trust.id, ward.id])
    )
    db_session.commit()

    assert _memberships(db_session, made) == {
        trust.id: "staff",
        ward.id: "trainee",
    }


def test_joining_a_covered_org_unit_grants_passport_writing(
    db_session: Session, manager: User, ward: OrgUnit
) -> None:
    db_session.add(
        OrgUnitFeature(org_unit=ward, feature_key=passport_cover.COVER_FEATURE)
    )
    db_session.commit()

    made = create_account(db_session, manager, _new(org_unit_ids=[ward.id]))
    db_session.commit()

    assert _grant_rows(db_session, made)["passport_write"] == (
        "organisation",
        manager.id,
    )


def test_somebody_on_the_mailing_list_becomes_one_record(
    db_session: Session, manager: User
) -> None:
    """The address is vouched for, so the two are the same person."""
    db_session.add(
        NewsletterSubscriber(email="starter@example.test", subscribed=True)
    )
    db_session.commit()

    made = create_account(db_session, manager, _new())
    db_session.commit()

    assert made.marketing_emails is True
    assert (
        db_session.scalar(
            select(NewsletterSubscriber).where(
                NewsletterSubscriber.email == "starter@example.test"
            )
        )
        is None
    )


# --- practice and enrolments ------------------------------------------------


def test_practice_is_checked_against_where_the_same_create_put_them(
    db_session: Session, manager: User, ward: OrgUnit
) -> None:
    made = create_account(
        db_session,
        manager,
        _new(org_unit_ids=[ward.id], practising={ward.id: [HELD]}),
    )
    db_session.commit()

    assert _practice(db_session, made) == {(ward.id, HELD, manager.id)}


def test_practice_may_be_given_for_what_the_same_create_granted(
    db_session: Session, manager: User, ward: OrgUnit
) -> None:
    made = create_account(
        db_session,
        manager,
        _new(
            additional_competencies=[TEACHING],
            org_unit_ids=[ward.id],
            practising={ward.id: [TEACHING]},
        ),
    )
    db_session.commit()

    assert _practice(db_session, made) == {(ward.id, TEACHING, manager.id)}


def test_practice_where_they_were_not_put_leaves_nobody_behind(
    db_session: Session, manager: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    """Refused after the account is written, and gone once rolled back."""
    with pytest.raises(PractisingWhereNotAMember):
        create_account(
            db_session,
            manager,
            _new(org_unit_ids=[trust.id], practising={ward.id: [HELD]}),
        )

    # What the session dependency does when a route raises.
    db_session.rollback()

    assert _account(db_session, "starter") is None


def test_no_organisation_named_for_enrolments_is_not_looked_at(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    """Where creating differs from saving: sent empty is not asked about."""
    assert "manage_teaching" not in _held(manager)

    made = create_account(
        db_session,
        manager,
        _new(org_unit_ids=[trust.id], teaching_enrolments={}),
    )

    assert made.id is not None


def test_an_organisation_named_by_somebody_not_running_teaching_is_refused(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    with pytest.raises(EnrolmentNotAllowed):
        create_account(
            db_session,
            manager,
            _new(org_unit_ids=[trust.id], teaching_enrolments={trust.id: {}}),
        )

    db_session.rollback()

    assert _account(db_session, "starter") is None


# --- the whole create -------------------------------------------------------


def test_one_create_writes_every_part_together(
    db_session: Session, manager: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    # Running teaching reaches the organisations somebody belongs to.
    hold(manager, "manage_teaching")
    add_org_unit_member(db_session, trust.id, manager.id, "staff")
    db_session.commit()
    _serve(db_session, trust, MODULE, manager.id)

    made = create_account(
        db_session,
        manager,
        NewAccount(
            name=" Sam Surgeon ",
            username="sam",
            email=" Sam@Example.Test ",
            password="Password456!",
            base_profession="consultant",
            additional_competencies=[TEACHING],
            removed_competencies=["certify_death"],
            platform_role="standard",
            org_unit_ids=[trust.id, ward.id],
            practising={ward.id: [HELD]},
            teaching_enrolments={trust.id: {MODULE: None}},
        ),
    )
    db_session.commit()
    db_session.refresh(made)

    assert made.username == "sam"
    assert made.full_name == "Sam Surgeon"
    assert made.email == "sam@example.test"
    assert made.email_verified is True
    assert verify_password("Password456!", made.password_hash)
    assert TEACHING in _held(made)
    assert "certify_death" not in _held(made)
    assert _memberships(db_session, made) == {
        trust.id: "staff",
        ward.id: "trainee",
    }
    assert (ward.id, HELD, manager.id) in _practice(db_session, made)
    assert is_enrolled(
        db_session,
        made.id,
        org_unit_id=trust.id,
        question_bank_id=MODULE,
    )
