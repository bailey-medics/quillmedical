"""Asking somebody to sign off a competency: who, and how often."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.passport.errors import (
    AskedTooOftenToday,
    AskingYourself,
    HolderBelongsNowhere,
)
from app.features.passport.models import (
    Passport,
    PassportLogbookConfirmationRequest,
    PassportSignOffRequest,
)
from app.features.passport.sign_off_requests import (
    Asked,
    asks_today,
    record_ask,
    who_is_asked,
)
from app.models import OrgUnit, OrgUnitFeature, User, org_unit_member
from app.organisations import add_org_unit_member
from app.security import hash_password

ASSESS = "assess_clinician_passport"
COMPETENCY = "uk_sact_board_2023_prescribe_sact"
#: An address with no account.
OUTSIDE = "outside.assessor@example.test"
#: High enough that no test here meets it by accident.
PLENTY = 100


def _person(db: Session, username: str, profession: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Made-up-password-1"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def _passport_of(db: Session, user: User) -> Passport:
    row = Passport(id=uuid.uuid4().hex, user_id=user.id)
    db.add(row)
    db.commit()

    return row


def _asked_already(
    db: Session, passport: Passport, *, ago: timedelta = timedelta(0)
) -> None:
    """A sign-off this passport asked for, some while ago."""
    db.add(
        PassportSignOffRequest(
            passport_id=passport.id,
            signoff_id=uuid.uuid4().hex,
            competency_id=COMPETENCY,
            assessor_email=OUTSIDE,
            status="open",
            created_at=datetime.now(UTC) - ago,
        )
    )
    db.commit()


def _confirmation_asked(
    db: Session, passport: Passport, *, ago: timedelta = timedelta(0)
) -> None:
    """A logbook entry this passport asked a supervisor to confirm."""
    db.add(
        PassportLogbookConfirmationRequest(
            passport_id=passport.id,
            competency_id=COMPETENCY,
            entry_stem=uuid.uuid4().hex,
            supervisor_email=OUTSIDE,
            created_at=datetime.now(UTC) - ago,
        )
    )
    db.commit()


def _ask(
    db: Session,
    passport: Passport,
    holder: User,
    email: str = OUTSIDE,
    *,
    daily_limit: int = PLENTY,
) -> Asked:
    return who_is_asked(
        db, passport.id, holder, email, daily_limit=daily_limit
    )


@pytest.fixture
def holder(db_session: Session) -> User:
    return _person(db_session, "holder", "specialty_trainee_3_plus")


@pytest.fixture
def passport(db_session: Session, holder: User) -> Passport:
    return _passport_of(db_session, holder)


@pytest.fixture
def team(db_session: Session, holder: User) -> OrgUnit:
    """Where the holder is, with the passport switched on."""
    unit = OrgUnit(name="Made-up Team", type="hospital_team")
    db_session.add(unit)
    db_session.commit()
    db_session.refresh(unit)
    db_session.add(OrgUnitFeature(org_unit_id=unit.id, feature_key="passport"))
    add_org_unit_member(db_session, unit.id, holder.id, "trainee")
    db_session.commit()

    return unit


@pytest.fixture
def delegate(db_session: Session) -> User:
    """An account that does not hold the assessor competency."""
    return _person(db_session, "delegate", "teaching_delegate")


# --- how many asks a passport has made today --------------------------------


def test_a_passport_that_has_asked_nobody_has_made_no_asks(
    db_session: Session, passport: Passport
) -> None:
    assert asks_today(db_session, passport.id) == 0


def test_sign_offs_and_logbook_confirmations_are_counted_together(
    db_session: Session, passport: Passport
) -> None:
    _asked_already(db_session, passport)
    _asked_already(db_session, passport)
    _confirmation_asked(db_session, passport)

    assert asks_today(db_session, passport.id) == 3


def test_an_ask_made_more_than_a_day_ago_is_not_counted(
    db_session: Session, passport: Passport
) -> None:
    """A rolling twenty-four hours, not a calendar day."""
    _asked_already(db_session, passport, ago=timedelta(hours=25))
    _confirmation_asked(db_session, passport, ago=timedelta(hours=25))
    _asked_already(db_session, passport, ago=timedelta(hours=23))

    assert asks_today(db_session, passport.id) == 1


def test_another_passports_asks_are_not_counted(
    db_session: Session, passport: Passport, delegate: User
) -> None:
    other = _passport_of(db_session, delegate)
    _asked_already(db_session, other)
    _confirmation_asked(db_session, other)

    assert asks_today(db_session, passport.id) == 0


# --- who is asked -----------------------------------------------------------


def test_an_address_with_no_account_may_be_asked(
    db_session: Session, holder: User, passport: Passport
) -> None:
    asked = _ask(db_session, passport, holder)

    assert asked == Asked(email=OUTSIDE, account=None)


def test_the_address_is_trimmed_and_folded_to_lower_case(
    db_session: Session, holder: User, passport: Passport
) -> None:
    asked = _ask(
        db_session, passport, holder, "  Outside.Assessor@Example.TEST "
    )

    assert asked.email == OUTSIDE


def test_a_holder_may_not_ask_themselves(
    db_session: Session, holder: User, passport: Passport
) -> None:
    with pytest.raises(AskingYourself):
        _ask(db_session, passport, holder, holder.email)


def test_a_holder_may_not_ask_themselves_in_other_capitals(
    db_session: Session, holder: User, passport: Passport
) -> None:
    with pytest.raises(AskingYourself):
        _ask(db_session, passport, holder, " HOLDER@Example.Test ")


def test_a_passport_that_has_asked_as_often_as_a_day_allows_is_refused(
    db_session: Session, holder: User, passport: Passport
) -> None:
    _asked_already(db_session, passport)
    _confirmation_asked(db_session, passport)

    with pytest.raises(AskedTooOftenToday) as refused:
        _ask(db_session, passport, holder, daily_limit=2)

    assert refused.value.message == (
        "You can ask up to 2 assessors a day. Try again tomorrow."
    )


def test_one_ask_short_of_the_limit_is_allowed(
    db_session: Session, holder: User, passport: Passport
) -> None:
    _asked_already(db_session, passport)

    assert _ask(db_session, passport, holder, daily_limit=2).email == OUTSIDE


def test_asking_yourself_is_what_is_reported_when_over_the_limit_too(
    db_session: Session, holder: User, passport: Passport
) -> None:
    _asked_already(db_session, passport)

    with pytest.raises(AskingYourself):
        _ask(db_session, passport, holder, holder.email, daily_limit=1)


def test_an_address_with_an_account_is_found_whatever_its_capitals(
    db_session: Session,
    holder: User,
    passport: Passport,
    team: OrgUnit,
    delegate: User,
) -> None:
    asked = _ask(db_session, passport, holder, "Delegate@Example.Test")

    assert asked.email == "delegate@example.test"
    assert asked.account is not None
    assert asked.account.id == delegate.id


def test_an_account_asked_is_given_what_it_needs_to_open_the_request(
    db_session: Session,
    holder: User,
    passport: Passport,
    team: OrgUnit,
    delegate: User,
) -> None:
    """Nobody asked is checked for the right to assess: they are given it."""
    assert ASSESS not in delegate.get_final_competencies()

    _ask(db_session, passport, holder, delegate.email)

    assert ASSESS in delegate.get_final_competencies()
    assert (
        db_session.scalar(
            select(org_unit_member.c.capacity).where(
                org_unit_member.c.org_unit_id == team.id,
                org_unit_member.c.user_id == delegate.id,
            )
        )
        == "external"
    )


def test_over_the_limit_an_account_asked_is_given_nothing(
    db_session: Session,
    holder: User,
    passport: Passport,
    team: OrgUnit,
    delegate: User,
) -> None:
    _asked_already(db_session, passport)

    with pytest.raises(AskedTooOftenToday):
        _ask(db_session, passport, holder, delegate.email, daily_limit=1)

    assert ASSESS not in delegate.get_final_competencies()


def test_a_holder_who_belongs_nowhere_cannot_ask_somebody_with_an_account(
    db_session: Session, holder: User, passport: Passport, delegate: User
) -> None:
    with pytest.raises(HolderBelongsNowhere):
        _ask(db_session, passport, holder, delegate.email)


def test_a_holder_who_belongs_nowhere_may_ask_an_address_with_no_account(
    db_session: Session, holder: User, passport: Passport
) -> None:
    """Where the assessor joins is not looked for until they accept."""
    assert _ask(db_session, passport, holder).account is None


def test_an_account_that_is_switched_off_is_asked_and_given_access(
    db_session: Session,
    holder: User,
    passport: Passport,
    team: OrgUnit,
    delegate: User,
) -> None:
    """Found while moving this rule, and pinned, not fixed.

    Nothing asks whether the account the address has is active. It
    cannot sign in to answer, and no invitation is sent because it has
    an account, so the request waits on somebody who cannot open it.
    It is given the competency and the membership all the same.
    """
    delegate.is_active = False
    db_session.commit()

    asked = _ask(db_session, passport, holder, delegate.email)

    assert asked.account is not None
    assert asked.account.id == delegate.id
    assert ASSESS in delegate.get_final_competencies()


# --- recording who was asked ------------------------------------------------


def test_the_ask_is_recorded_open_with_nobody_yet_having_signed(
    db_session: Session, passport: Passport
) -> None:
    record_ask(
        db_session,
        passport,
        signoff_id="made-up-sign-off",
        competency_id=COMPETENCY,
        assessor_email=OUTSIDE,
        commit="a" * 40,
    )

    row = db_session.scalar(select(PassportSignOffRequest))
    assert row is not None
    assert row.passport_id == passport.id
    assert row.signoff_id == "made-up-sign-off"
    assert row.competency_id == COMPETENCY
    assert row.assessor_email == OUTSIDE
    assert row.assessor_user_id is None
    assert row.status == "open"
    assert row.resolved_at is None


def test_recording_the_ask_moves_the_passport_on_to_its_commit(
    db_session: Session, passport: Passport
) -> None:
    record_ask(
        db_session,
        passport,
        signoff_id="made-up-sign-off",
        competency_id=COMPETENCY,
        assessor_email=OUTSIDE,
        commit="b" * 40,
    )

    assert passport.head_commit == "b" * 40


def test_a_recorded_ask_counts_towards_the_day_at_once(
    db_session: Session, passport: Passport
) -> None:
    """It is flushed, so the next count sees it before any commit."""
    record_ask(
        db_session,
        passport,
        signoff_id="made-up-sign-off",
        competency_id=COMPETENCY,
        assessor_email=OUTSIDE,
        commit="c" * 40,
    )

    assert asks_today(db_session, passport.id) == 1
