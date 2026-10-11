"""Registering: what is checked first, and what is written."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.positions import set_clinical_lead
from app.features.teaching.enrolment import is_enrolled
from app.features.teaching.models import QuestionBankOrgStatus
from app.marketing.preferences import MARKETING_WORDING_VERSION
from app.models import (
    MarketingPreferenceChange,
    OrgUnit,
    PractisingCompetency,
    User,
    org_unit_member,
)
from app.security import hash_password, verify_password
from app.users import register as register_module
from app.users.errors import (
    ClinicalLeadAndModuleRequired,
    ClinicalLeadNotRecognised,
    ModuleNotOpenToRegistration,
    OrganisationNotFound,
    OrganisationRequiredForModule,
    OrganisationRequiredForSite,
    PasswordTooShort,
    RegistrationFieldsMissing,
    SiteNotChosen,
    SiteNotFound,
    SiteNotTheClinicalLeads,
    UserAdminError,
    UsernameOrEmailInUse,
)
from app.users.register import (
    Registration,
    clinical_lead_site,
    register_account,
)

PASSWORD = "Password123!"
MODULE = "first-module"
LEAD_EMAIL = "lead@example.test"


def _person(db: Session, username: str, email: str | None = None) -> User:
    user = User(
        username=username,
        email=email or f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
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


def _open(db: Session, org: OrgUnit, module_id: str = MODULE) -> None:
    """Have *org* open a module to registration."""
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=module_id,
            is_live=True,
            site_registration=True,
        )
    )
    db.commit()


def _leads(db: Session, lead: User, site: OrgUnit) -> None:
    """Make *lead* a member of *site* and its clinical lead."""
    db.execute(
        org_unit_member.insert().values(
            org_unit_id=site.id, user_id=lead.id, capacity="staff"
        )
    )
    set_clinical_lead(db, site, lead)
    db.commit()


def _new(**fields: object) -> Registration:
    """Somebody registering, with whatever a test says differently."""
    values: dict[str, object] = {
        "username": "delegate",
        "email": "delegate@example.test",
        "password": PASSWORD,
    }
    values.update(fields)

    return Registration(**values)  # type: ignore[arg-type]


def _through_the_link(**fields: object) -> Registration:
    """Somebody registering through a module's join link."""
    return _new(
        **{
            "teaching_module_id": MODULE,
            "clinical_lead_email": LEAD_EMAIL,
            **fields,
        }
    )


def _account(db: Session, username: str = "delegate") -> User | None:
    return db.scalar(select(User).where(User.username == username))


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


def _marketing_answers(
    db: Session, user: User
) -> list[tuple[bool, str, str | None]]:
    return [
        (row.wants_marketing, row.source, row.wording_version)
        for row in db.scalars(
            select(MarketingPreferenceChange).where(
                MarketingPreferenceChange.user_id == user.id
            )
        ).all()
    ]


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """An organisation that has opened the module to registration."""
    org = _org_unit(db_session, "Severn Trust", "organisation")
    _open(db_session, org)

    return org


@pytest.fixture
def hospital(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _org_unit(db_session, "Severn Hospital", "hospital", trust)


@pytest.fixture
def lead(db_session: Session, hospital: OrgUnit) -> User:
    """The clinical lead of the hospital."""
    user = _person(db_session, "lead", LEAD_EMAIL)
    _leads(db_session, user, hospital)

    return user


@pytest.fixture
def second_hospital(
    db_session: Session, trust: OrgUnit, lead: User
) -> OrgUnit:
    """Another site beneath the trust, with the same clinical lead."""
    site = _org_unit(db_session, "Avon Hospital", "hospital", trust)
    _leads(db_session, lead, site)

    return site


@pytest.fixture
def colleague(db_session: Session) -> User:
    """Somebody whose username and address are spoken for."""
    return _person(db_session, "colleague")


# --- what was sent ----------------------------------------------------------


@pytest.mark.parametrize(
    "missing",
    [
        {"username": ""},
        {"username": "   "},
        {"email": ""},
        {"email": "   "},
        {"password": ""},
    ],
    ids=[
        "no username",
        "a blank username",
        "no address",
        "a blank address",
        "no password",
    ],
)
def test_a_username_an_address_and_a_password_are_all_needed(
    db_session: Session, missing: dict[str, object]
) -> None:
    with pytest.raises(RegistrationFieldsMissing) as refusal:
        register_account(db_session, _new(**missing))

    assert refusal.value.status_code == 400
    assert refusal.value.message == "Missing fields"
    assert db_session.scalars(select(User)).all() == []


def test_a_password_under_eight_characters_is_refused(
    db_session: Session,
) -> None:
    with pytest.raises(PasswordTooShort) as refusal:
        register_account(db_session, _new(password="1234567"))

    assert refusal.value.status_code == 400
    assert refusal.value.message == "Password must be at least 8 characters"
    assert _account(db_session) is None


def test_a_password_of_eight_characters_will_do(db_session: Session) -> None:
    made = register_account(db_session, _new(password="12345678"))

    assert verify_password("12345678", made.password_hash)


# --- a username or an address that is taken ---------------------------------


def test_a_username_an_account_has_is_refused(
    db_session: Session, colleague: User
) -> None:
    with pytest.raises(UsernameOrEmailInUse) as refusal:
        register_account(db_session, _new(username="colleague"))

    assert refusal.value.status_code == 400
    assert refusal.value.message == "Username or email already in use"
    assert _account(db_session) is None


def test_a_username_is_trimmed_before_it_is_looked_for(
    db_session: Session, colleague: User
) -> None:
    with pytest.raises(UsernameOrEmailInUse):
        register_account(db_session, _new(username="  colleague "))


def test_an_address_an_account_has_is_refused_in_any_capitals(
    db_session: Session, colleague: User
) -> None:
    with pytest.raises(UsernameOrEmailInUse):
        register_account(db_session, _new(email=" Colleague@Example.Test "))

    assert _account(db_session) is None


def test_a_taken_address_is_answered_exactly_as_a_taken_username_is(
    db_session: Session, colleague: User
) -> None:
    """So nobody can learn from the answer whether an address is held."""
    with pytest.raises(UserAdminError) as for_username:
        register_account(db_session, _new(username="colleague"))

    with pytest.raises(UserAdminError) as for_email:
        register_account(db_session, _new(email="colleague@example.test"))

    assert type(for_email.value) is type(for_username.value)
    assert for_email.value.status_code == for_username.value.status_code
    assert for_email.value.message == for_username.value.message


# --- which refusal comes first ----------------------------------------------


def test_something_missing_is_reported_before_a_short_password(
    db_session: Session,
) -> None:
    with pytest.raises(RegistrationFieldsMissing):
        register_account(db_session, _new(username=" ", password="short"))


def test_a_short_password_is_reported_before_a_taken_username(
    db_session: Session, colleague: User
) -> None:
    with pytest.raises(PasswordTooShort):
        register_account(
            db_session, _new(username="colleague", password="short")
        )


def test_a_taken_address_is_reported_before_the_clinical_lead(
    db_session: Session, colleague: User
) -> None:
    with pytest.raises(UsernameOrEmailInUse):
        register_account(
            db_session,
            _new(email="colleague@example.test", org_unit_id=987654),
        )


# --- an account that joins nowhere ------------------------------------------


def test_the_account_is_held_tidied_and_not_yet_verified(
    db_session: Session,
) -> None:
    made = register_account(
        db_session,
        _new(
            username="  delegate ",
            full_name="  Dee Legate ",
            email=" Delegate@Example.Test ",
        ),
    )
    db_session.commit()

    assert made.id is not None
    assert made.username == "delegate"
    assert made.full_name == "Dee Legate"
    assert made.email == "delegate@example.test"
    assert made.email_verified is False
    assert made.password_hash != PASSWORD
    assert verify_password(PASSWORD, made.password_hash)
    assert made.platform_role == "standard"


@pytest.mark.parametrize("name", [None, "", "   "])
def test_a_name_not_given_or_blank_is_held_as_none(
    db_session: Session, name: str | None
) -> None:
    made = register_account(db_session, _new(full_name=name))

    assert made.full_name is None


def test_everybody_registering_is_a_teaching_delegate(
    db_session: Session,
) -> None:
    """Holding what the profession gives, written as rows."""
    made = register_account(db_session, _new())
    db_session.commit()

    assert made.base_profession == "teaching_delegate"
    assert set(made.get_final_competencies()) == {
        "view_teaching_results",
        "take_teaching_modules",
    }


def test_naming_nowhere_joins_nowhere(db_session: Session) -> None:
    made = register_account(db_session, _new())
    db_session.commit()

    assert _memberships(db_session, made) == {}
    assert _practice(db_session, made) == set()


def test_a_clinical_lead_named_with_nothing_else_is_not_looked_at(
    db_session: Session,
) -> None:
    """No organisation, site or module was named, so nothing is joined."""
    made = register_account(
        db_session, _new(clinical_lead_email="nobody@example.test")
    )
    db_session.commit()

    assert _memberships(db_session, made) == {}


# --- whether they are sent news ---------------------------------------------


def test_a_form_that_never_asked_leaves_them_unsubscribed(
    db_session: Session,
) -> None:
    made = register_account(db_session, _new(marketing_opt_out=None))
    db_session.commit()

    assert made.marketing_emails is False
    assert _marketing_answers(db_session, made) == []


def test_leaving_the_box_unticked_subscribes_them(
    db_session: Session,
) -> None:
    made = register_account(db_session, _new(marketing_opt_out=False))
    db_session.commit()

    assert made.marketing_emails is True
    assert _marketing_answers(db_session, made) == [
        (True, "registration", MARKETING_WORDING_VERSION)
    ]


def test_ticking_the_box_is_recorded_as_an_answer_too(
    db_session: Session,
) -> None:
    made = register_account(db_session, _new(marketing_opt_out=True))
    db_session.commit()

    assert made.marketing_emails is False
    assert _marketing_answers(db_session, made) == [
        (False, "registration", MARKETING_WORDING_VERSION)
    ]


# --- the clinical lead ------------------------------------------------------


@pytest.mark.parametrize(
    "named",
    [
        {"org_unit_id": 1},
        {"site_id": 1},
        {"teaching_module_id": MODULE},
        {"org_unit_id": 1, "site_id": 1, "teaching_module_id": MODULE},
        {"org_unit_id": 1, "clinical_lead_email": LEAD_EMAIL},
        {"site_id": 1, "clinical_lead_email": LEAD_EMAIL},
    ],
    ids=[
        "an organisation alone",
        "a site alone",
        "a module alone",
        "all three and no lead",
        "an organisation and a lead but no module",
        "a site and a lead but no module",
    ],
)
def test_joining_anywhere_needs_both_a_clinical_lead_and_a_module(
    db_session: Session, lead: User, named: dict[str, object]
) -> None:
    with pytest.raises(ClinicalLeadAndModuleRequired) as refusal:
        register_account(db_session, _new(**named))

    assert refusal.value.status_code == 400
    assert (
        refusal.value.message
        == "A clinical lead and a module are required to join a site"
    )
    assert _account(db_session) is None


def test_an_address_that_is_no_clinical_leads_is_refused(
    db_session: Session, lead: User, colleague: User
) -> None:
    """Whether nobody has it or somebody who leads nowhere does."""
    for email in ("nobody@example.test", colleague.email):
        with pytest.raises(ClinicalLeadNotRecognised) as refusal:
            register_account(
                db_session, _through_the_link(clinical_lead_email=email)
            )

        assert refusal.value.status_code == 400
        assert refusal.value.message == "Clinical lead not recognised"

    assert _account(db_session) is None


def test_a_lead_is_not_recognised_for_a_module_not_open_to_registration(
    db_session: Session, lead: User
) -> None:
    with pytest.raises(ClinicalLeadNotRecognised):
        register_account(
            db_session, _through_the_link(teaching_module_id="another-module")
        )


def test_a_lead_at_several_sites_needs_one_chosen(
    db_session: Session, lead: User, second_hospital: OrgUnit
) -> None:
    with pytest.raises(SiteNotChosen) as refusal:
        register_account(db_session, _through_the_link())

    assert refusal.value.status_code == 400
    assert (
        refusal.value.message
        == "Choose which of the clinical lead's sites to join"
    )
    assert _account(db_session) is None


def test_a_site_the_lead_does_not_hold_is_refused(
    db_session: Session, lead: User, trust: OrgUnit
) -> None:
    elsewhere = _org_unit(db_session, "Wye Hospital", "hospital", trust)

    with pytest.raises(SiteNotTheClinicalLeads) as refusal:
        register_account(db_session, _through_the_link(site_id=elsewhere.id))

    assert refusal.value.status_code == 400
    assert refusal.value.message == "Site does not match the clinical lead"
    assert _account(db_session) is None


def test_an_organisation_that_is_not_the_leads_is_refused_the_same_way(
    db_session: Session, lead: User, hospital: OrgUnit
) -> None:
    other = _org_unit(db_session, "Wye Trust", "organisation")

    with pytest.raises(SiteNotTheClinicalLeads) as refusal:
        register_account(
            db_session,
            _through_the_link(org_unit_id=other.id, site_id=hospital.id),
        )

    assert refusal.value.message == "Site does not match the clinical lead"
    assert _account(db_session) is None


# --- joining through a clinical lead ----------------------------------------


def test_a_lead_at_one_site_needs_no_site_named(
    db_session: Session, lead: User, trust: OrgUnit, hospital: OrgUnit
) -> None:
    made = register_account(db_session, _through_the_link())
    db_session.commit()

    assert _memberships(db_session, made) == {
        trust.id: "trainee",
        hospital.id: "trainee",
    }


def test_what_the_browser_sent_may_agree_with_the_lead(
    db_session: Session, lead: User, trust: OrgUnit, hospital: OrgUnit
) -> None:
    made = register_account(
        db_session,
        _through_the_link(org_unit_id=trust.id, site_id=hospital.id),
    )
    db_session.commit()

    assert _memberships(db_session, made) == {
        trust.id: "trainee",
        hospital.id: "trainee",
    }


def test_an_organisation_named_alone_still_joins_the_leads_site(
    db_session: Session, lead: User, trust: OrgUnit, hospital: OrgUnit
) -> None:
    """The site comes from the lead, never from what was left out."""
    made = register_account(
        db_session, _through_the_link(org_unit_id=trust.id)
    )
    db_session.commit()

    assert set(_memberships(db_session, made)) == {trust.id, hospital.id}


def test_the_site_chosen_is_joined_and_no_other(
    db_session: Session,
    lead: User,
    trust: OrgUnit,
    hospital: OrgUnit,
    second_hospital: OrgUnit,
) -> None:
    made = register_account(
        db_session, _through_the_link(site_id=second_hospital.id)
    )
    db_session.commit()

    assert _memberships(db_session, made) == {
        trust.id: "trainee",
        second_hospital.id: "trainee",
    }


def test_they_take_modules_through_the_site_and_nobody_authorised_it(
    db_session: Session, lead: User, hospital: OrgUnit
) -> None:
    made = register_account(db_session, _through_the_link())
    db_session.commit()

    assert _practice(db_session, made) == {
        (hospital.id, "take_teaching_modules", None)
    }


def test_somebody_not_holding_the_competency_is_given_no_place(
    db_session: Session,
    lead: User,
    hospital: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every delegate holds it today, so the name is changed to ask."""
    monkeypatch.setattr(
        register_module, "MODULES_COMPETENCY", "not_held_by_a_delegate"
    )

    made = register_account(db_session, _through_the_link())
    db_session.commit()

    assert _practice(db_session, made) == set()
    assert hospital.id in _memberships(db_session, made)


def test_they_are_enrolled_on_the_module_of_the_link(
    db_session: Session, lead: User, trust: OrgUnit
) -> None:
    made = register_account(db_session, _through_the_link())
    db_session.commit()

    assert is_enrolled(
        db_session, made.id, org_unit_id=trust.id, question_bank_id=MODULE
    )


# --- refused after the account is written -----------------------------------


def test_a_tree_whose_top_is_no_organisation_is_refused(
    db_session: Session,
) -> None:
    """Refused after the account is written, and gone once rolled back."""
    detached = _org_unit(db_session, "Adrift Hospital", "hospital")
    _open(db_session, detached)
    ward = _org_unit(db_session, "Ward 4", "ward", detached)
    _leads(db_session, _person(db_session, "lead", LEAD_EMAIL), ward)

    with pytest.raises(OrganisationNotFound) as refusal:
        register_account(db_session, _through_the_link())

    assert refusal.value.status_code == 400
    assert refusal.value.message == "Organisation not found"

    # What the session dependency does when a route raises.
    db_session.rollback()

    assert _account(db_session) is None


def test_a_site_of_a_type_that_tops_a_tree_is_refused(
    db_session: Session, trust: OrgUnit
) -> None:
    """Its type says what it is, whatever it sits beneath."""
    team = _org_unit(db_session, "Renal Team", "hospital_team", trust)
    _leads(db_session, _person(db_session, "lead", LEAD_EMAIL), team)

    with pytest.raises(SiteNotFound) as refusal:
        register_account(db_session, _through_the_link())

    assert refusal.value.status_code == 400
    assert refusal.value.message == "Site not found"

    db_session.rollback()

    assert _account(db_session) is None


# --- the parts, for what the whole cannot reach today -----------------------
#
# The organisation and the site both come from the clinical lead's
# address, so the site is always beneath the organisation and the module
# is always open there. These refusals stay in case that ever changes,
# and can only be reached by calling the part.


def test_a_site_with_no_organisation_given_is_refused(
    db_session: Session, hospital: OrgUnit
) -> None:
    newcomer = _person(db_session, "newcomer")

    with pytest.raises(OrganisationRequiredForSite) as refusal:
        register_module._join_site(db_session, newcomer, hospital.id, None)

    assert refusal.value.status_code == 400
    assert (
        refusal.value.message
        == "org_unit_id required when site_id is provided"
    )


def test_a_site_nobody_has_is_refused(
    db_session: Session, trust: OrgUnit
) -> None:
    newcomer = _person(db_session, "newcomer")

    with pytest.raises(SiteNotFound):
        register_module._join_site(db_session, newcomer, 987654, trust.id)


def test_a_site_beneath_another_organisation_is_refused(
    db_session: Session, trust: OrgUnit
) -> None:
    other = _org_unit(db_session, "Wye Trust", "organisation")
    elsewhere = _org_unit(db_session, "Wye Hospital", "hospital", other)
    newcomer = _person(db_session, "newcomer")

    with pytest.raises(SiteNotFound):
        register_module._join_site(
            db_session, newcomer, elsewhere.id, trust.id
        )

    assert _memberships(db_session, newcomer) == {}


def test_a_module_with_no_organisation_given_is_refused(
    db_session: Session,
) -> None:
    newcomer = _person(db_session, "newcomer")

    with pytest.raises(OrganisationRequiredForModule) as refusal:
        register_module._enrol_through_the_link(
            db_session, newcomer, MODULE, None
        )

    assert refusal.value.status_code == 400
    assert (
        refusal.value.message
        == "org_unit_id required when teaching_module_id is provided"
    )


def test_a_module_the_organisation_has_not_opened_is_refused(
    db_session: Session, trust: OrgUnit
) -> None:
    newcomer = _person(db_session, "newcomer")

    with pytest.raises(ModuleNotOpenToRegistration) as refusal:
        register_module._enrol_through_the_link(
            db_session, newcomer, "another-module", trust.id
        )

    assert refusal.value.status_code == 400
    assert refusal.value.message == "Module is not open to registration"
    assert not is_enrolled(
        db_session,
        newcomer.id,
        org_unit_id=trust.id,
        question_bank_id="another-module",
    )


# --- where a clinical lead's address admits somebody ------------------------


def test_an_address_nobody_has_admits_nobody(
    db_session: Session, lead: User
) -> None:
    answer = clinical_lead_site(db_session, "nobody@example.test", MODULE)

    assert answer.valid is False
    assert answer.sites == []


def test_a_module_nobody_has_opened_admits_nobody(
    db_session: Session, lead: User
) -> None:
    assert clinical_lead_site(db_session, LEAD_EMAIL, "another").valid is False


def test_an_organisation_with_nothing_beneath_it_admits_nobody(
    db_session: Session, trust: OrgUnit
) -> None:
    _person(db_session, "lead", LEAD_EMAIL)

    assert clinical_lead_site(db_session, LEAD_EMAIL, MODULE).valid is False


def test_somebody_who_leads_none_of_its_sites_admits_nobody(
    db_session: Session, lead: User, colleague: User
) -> None:
    assert (
        clinical_lead_site(db_session, colleague.email, MODULE).valid is False
    )


def test_a_module_opened_below_the_top_of_a_tree_admits_nobody(
    db_session: Session, lead: User, hospital: OrgUnit
) -> None:
    """The lead's ward answers to the trust, which has not opened it."""
    _open(db_session, hospital, "ward-module")
    ward = _org_unit(db_session, "Ward 4", "ward", hospital)
    _leads(db_session, lead, ward)

    answer = clinical_lead_site(db_session, LEAD_EMAIL, "ward-module")

    assert answer.valid is False


def test_a_lead_at_one_site_is_answered_with_that_site(
    db_session: Session, lead: User, trust: OrgUnit, hospital: OrgUnit
) -> None:
    """Found whatever capitals the address is typed in."""
    answer = clinical_lead_site(db_session, " Lead@Example.Test ", MODULE)

    assert answer.valid is True
    assert [site.site_id for site in answer.sites] == [hospital.id]
    assert answer.site_id == hospital.id
    assert answer.site_name == "Severn Hospital"
    assert answer.org_unit_id == trust.id


def test_a_lead_at_several_sites_is_answered_with_all_and_no_one_site(
    db_session: Session,
    lead: User,
    trust: OrgUnit,
    hospital: OrgUnit,
    second_hospital: OrgUnit,
) -> None:
    """By name, so the list reads the same each time."""
    answer = clinical_lead_site(db_session, LEAD_EMAIL, MODULE)

    assert answer.valid is True
    assert [site.site_name for site in answer.sites] == [
        "Avon Hospital",
        "Severn Hospital",
    ]
    assert {site.org_unit_id for site in answer.sites} == {trust.id}
    assert answer.site_id is None
    assert answer.site_name is None
    assert answer.org_unit_id is None
