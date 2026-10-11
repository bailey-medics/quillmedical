"""Registering saves the account first and sends its email second.

The route used to send the verification email and then commit. If the
send worked and the commit failed, somebody held a link to an account
that did not exist. Now the account is committed first, and where the
email then cannot be sent the account is removed again.

What a caller is promised has not moved: an email that cannot be sent
leaves no account, the address and the username stay free, and the
three answers keep their statuses and their words. These tests pin that
through the route, table by table, on the registration that writes the
most rows: one that joins a site through a clinical lead and enrols on
a module.
"""

import logging
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import main
from app.cbac.positions import set_clinical_lead
from app.email_send import EmailNotAllowedError, EmailRateLimitError
from app.features.teaching.models import (
    ModuleEnrolment,
    QuestionBankOrgStatus,
)
from app.models import (
    Base,
    MarketingPreferenceChange,
    OrgUnit,
    PractisingCompetency,
    User,
    UserCompetency,
    org_unit_member,
)
from app.security import hash_password

MODULE = "first-module"
LEAD_EMAIL = "lead@example.com"

#: Every table a registration writes to.
TABLES_WRITTEN = (
    "users",
    "user_competency",
    "marketing_preference_change",
    "org_unit_member",
    "practising_competency",
    "module_enrolment",
)

#: What a full registration writes: the account, the two competencies
#: of a teaching delegate, the answer about news, the organisation and
#: the site, the place to take modules, and the enrolment.
ROWS_WRITTEN = {
    "users": 1,
    "user_competency": 2,
    "marketing_preference_change": 1,
    "org_unit_member": 2,
    "practising_competency": 1,
    "module_enrolment": 1,
}

REGISTRATION: dict[str, Any] = {
    "username": "delegate",
    "email": "delegate@example.com",
    "password": "Delegate123!",
    "marketing_opt_out": False,
    "teaching_module_id": MODULE,
    "clinical_lead_email": LEAD_EMAIL,
}


def _rate_limited(**_kwargs: object) -> None:
    raise EmailRateLimitError("too many")


def _not_allowed(**_kwargs: object) -> None:
    raise EmailNotAllowedError("not on the list")


def _unreachable(**_kwargs: object) -> None:
    raise RuntimeError("mail server unreachable")


#: Each way the email can fail, with the answer the route gives for it.
FAILED_SENDS = [
    pytest.param(
        _rate_limited,
        429,
        "Too many attempts for that email address. Try again later.",
        id="rate limited",
    ),
    pytest.param(
        _not_allowed,
        400,
        "This environment may only email approved addresses. "
        "Nothing has been saved.",
        id="not an allowed recipient",
    ),
    pytest.param(
        _unreachable,
        502,
        "We could not send your verification email, so the account has "
        "not been created. Please try again.",
        id="could not be sent",
    ),
]


def _every_row(db: Session) -> dict[str, list[tuple[object, ...]]]:
    """Every row of every table, by table name."""
    return {
        table.name: sorted(
            (tuple(row) for row in db.execute(select(table)).all()),
            key=repr,
        )
        for table in Base.metadata.sorted_tables
    }


def _rows_written_for(db: Session, user_id: int) -> dict[str, int]:
    """How many rows each table a registration writes holds for one person."""
    counted = {
        "users": select(User.id).where(User.id == user_id),
        "user_competency": select(UserCompetency.id).where(
            UserCompetency.user_id == user_id
        ),
        "marketing_preference_change": select(
            MarketingPreferenceChange.id
        ).where(MarketingPreferenceChange.user_id == user_id),
        "org_unit_member": select(org_unit_member.c.org_unit_id).where(
            org_unit_member.c.user_id == user_id
        ),
        "practising_competency": select(PractisingCompetency.id).where(
            PractisingCompetency.user_id == user_id
        ),
        "module_enrolment": select(ModuleEnrolment.id).where(
            ModuleEnrolment.user_id == user_id
        ),
    }

    return {
        name: len(db.execute(query).all()) for name, query in counted.items()
    }


def _registered(db: Session) -> User | None:
    return db.scalar(select(User).where(User.username == "delegate"))


@pytest.fixture(autouse=True)
def somewhere_to_join(db_session: Session) -> None:
    """A trust that has opened the module, a hospital and its lead."""
    trust = OrgUnit(name="Severn Trust", type="organisation")
    db_session.add(trust)
    db_session.flush()

    hospital = OrgUnit(
        name="Severn Hospital", type="hospital", parent_id=trust.id
    )
    lead = User(
        username="lead",
        email=LEAD_EMAIL,
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
    )
    db_session.add_all(
        [
            hospital,
            lead,
            QuestionBankOrgStatus(
                org_unit_id=trust.id,
                question_bank_id=MODULE,
                is_live=True,
                site_registration=True,
            ),
        ]
    )
    db_session.flush()

    db_session.execute(
        org_unit_member.insert().values(
            org_unit_id=hospital.id, user_id=lead.id, capacity="staff"
        )
    )
    set_clinical_lead(db_session, hospital, lead)
    db_session.commit()


@pytest.mark.parametrize(("failing", "status", "words"), FAILED_SENDS)
def test_an_email_that_cannot_be_sent_is_answered_as_it_always_was(
    test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    failing: Callable[..., None],
    status: int,
    words: str,
) -> None:
    monkeypatch.setattr(main, "send_email", failing)

    response = test_client.post("/api/auth/register", json=REGISTRATION)

    assert response.status_code == status, response.text
    assert response.json() == {"detail": words}


@pytest.mark.parametrize(("failing", "status", "words"), FAILED_SENDS)
def test_an_email_that_cannot_be_sent_leaves_no_row_in_any_table(
    test_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    failing: Callable[..., None],
    status: int,
    words: str,
) -> None:
    """The account was saved in full when the send failed, then removed."""
    before = _every_row(db_session)
    saved_when_sending: list[dict[str, int]] = []

    def _send(**kwargs: object) -> None:
        user = _registered(db_session)
        assert user is not None
        saved_when_sending.append(_rows_written_for(db_session, user.id))
        failing(**kwargs)

    monkeypatch.setattr(main, "send_email", _send)

    response = test_client.post("/api/auth/register", json=REGISTRATION)

    assert response.status_code == status, response.text
    assert saved_when_sending == [ROWS_WRITTEN]

    after = _every_row(db_session)

    assert after["users"] == before["users"]
    assert after["user_competency"] == before["user_competency"]
    assert (
        after["marketing_preference_change"]
        == before["marketing_preference_change"]
    )
    assert after["org_unit_member"] == before["org_unit_member"]
    assert after["practising_competency"] == before["practising_competency"]
    assert after["module_enrolment"] == before["module_enrolment"]

    # And nothing anywhere else: every table is as it was.
    assert set(TABLES_WRITTEN) <= set(after)
    assert after == before


@pytest.mark.parametrize(("failing", "status", "words"), FAILED_SENDS)
def test_the_same_username_and_address_can_register_afterwards(
    test_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    failing: Callable[..., None],
    status: int,
    words: str,
) -> None:
    monkeypatch.setattr(main, "send_email", failing)
    assert (
        test_client.post("/api/auth/register", json=REGISTRATION).status_code
        == status
    )

    # Whatever stopped the email is over.
    monkeypatch.setattr(main, "send_email", lambda **_kwargs: None)

    response = test_client.post("/api/auth/register", json=REGISTRATION)

    assert response.status_code == 200, response.text
    assert response.json() == {"detail": "created"}

    user = _registered(db_session)

    assert user is not None
    assert user.email == "delegate@example.com"
    assert _rows_written_for(db_session, user.id) == ROWS_WRITTEN


def test_the_account_is_committed_before_the_email_is_sent(
    test_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    happened: list[str] = []
    commit = db_session.commit

    def _commit() -> None:
        happened.append("commit")
        commit()

    def _send(**_kwargs: object) -> None:
        happened.append("send")

    monkeypatch.setattr(db_session, "commit", _commit)
    monkeypatch.setattr(main, "send_email", _send)

    response = test_client.post("/api/auth/register", json=REGISTRATION)

    assert response.status_code == 200, response.text
    assert happened[:2] == ["commit", "send"]


def test_no_email_is_sent_for_an_account_that_failed_to_save(
    test_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The gap this closes: a link to an account that does not exist."""
    before = _every_row(db_session)
    sent: list[object] = []

    def _commit() -> None:
        raise RuntimeError("the database went away")

    monkeypatch.setattr(db_session, "commit", _commit)
    monkeypatch.setattr(main, "send_email", lambda **kwargs: sent.append(1))

    # A client that answers as a browser is answered, where the usual
    # one raises the server's exception in the test.
    client = TestClient(test_client.app, raise_server_exceptions=False)
    response = client.post("/api/auth/register", json=REGISTRATION)

    monkeypatch.undo()

    assert response.status_code == 500, response.text
    assert "created" not in response.text
    assert sent == []
    assert _every_row(db_session) == before


def test_a_registration_whose_email_is_sent_is_saved_as_before(
    test_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_to: list[object] = []

    def _send(**kwargs: object) -> None:
        sent_to.append(kwargs["to"])

    monkeypatch.setattr(main, "send_email", _send)

    response = test_client.post("/api/auth/register", json=REGISTRATION)

    assert response.status_code == 200, response.text
    assert response.json() == {"detail": "created"}
    assert sent_to == ["delegate@example.com"]

    user = _registered(db_session)

    assert user is not None
    assert user.email_verified is False
    assert user.base_profession == "teaching_delegate"
    assert user.marketing_emails is True
    assert _rows_written_for(db_session, user.id) == ROWS_WRITTEN


def test_an_undo_that_fails_still_answers_for_the_email(
    test_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The account is then left unverified, to be sent its email again.

    The log names the account by its id and nothing else about them.
    """

    def _cannot_undo(_db: Session, _user_id: int) -> None:
        raise RuntimeError("delegate@example.com could not be removed")

    monkeypatch.setattr(main, "send_email", _unreachable)
    monkeypatch.setattr(main, "undo_registration", _cannot_undo)

    with caplog.at_level(logging.ERROR, logger="app.main"):
        response = test_client.post("/api/auth/register", json=REGISTRATION)

    assert response.status_code == 502, response.text
    assert response.json() == {
        "detail": (
            "We could not send your verification email, so the account "
            "has not been created. Please try again."
        )
    }

    user = _registered(db_session)

    assert user is not None
    assert user.email_verified is False
    assert _rows_written_for(db_session, user.id) == ROWS_WRITTEN

    messages = [record.getMessage() for record in caplog.records]

    assert f"registration could not be undone for user {user.id}" in messages
    assert not any("delegate" in message for message in messages)
