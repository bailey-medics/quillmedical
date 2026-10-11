"""What the people routes answer when teaching enrolments are refused.

The rules are in ``app.users.enrolments`` and are tested there. This
drives the routes, to pin what a caller is sent: the status and the
``detail`` each route gave when the rules were written inside
``app.main``. No test pinned these words before the rules moved.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.access import BelongsNowhere
from app.features.teaching.enrolment import is_enrolled
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from app.users import enrolments
from tests.competencies import hold
from tests.places import administers

PASSWORD = "Coordinator123!"  # noqa: S105
FIRST = "first-module"

NOT_ALLOWED = "Not allowed"
NOT_THEIR_ORGANISATION = (
    "Enrolment can be set only at an organisation they belong to."
)
END_PASSED = "An enrolment's end date has already passed."
NOT_YOURSELF = "Somebody else must enrol you in teaching."
NOT_SERVED = "A module was named that the organisation does not serve."
BELONGS_NOWHERE = (
    "They must belong to an org unit under the organisation before they "
    "can be enrolled."
)


def _user(db: Session, username: str, profession: str, org: OrgUnit) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.flush()
    add_org_unit_member(db, org.id, user.id, "staff")
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


def _sign_in(test_client: TestClient, user: User) -> TestClient:
    response = test_client.post(
        "/api/auth/login",
        json={"username": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")

    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf

    return test_client


def _at(
    org: OrgUnit, *modules: str, ends_on: str | None = None
) -> dict[str, Any]:
    return {
        "org_unit_id": org.id,
        "modules": [{"module_id": m, "ends_on": ends_on} for m in modules],
    }


def _new_user(org: OrgUnit, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "New Delegate",
        "username": "new_delegate",
        "email": "new_delegate@example.test",
        "password": "NewDelegate123!",
        "base_profession": "teaching_delegate",
        "org_unit_ids": [org.id],
    }
    body.update(overrides)

    return body


def _yesterday() -> str:
    return (datetime.now(UTC) - timedelta(days=1)).isoformat()


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _organisation(db_session, "Teaching Trust")


@pytest.fixture
def elsewhere(db_session: Session) -> OrgUnit:
    """An organisation the coordinator does not belong to."""
    return _organisation(db_session, "Elsewhere")


@pytest.fixture
def coordinator(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching`` and belongs to the trust."""
    user = _user(db_session, "coordinator", "teaching_admin", trust)
    _serve(db_session, trust, FIRST, user.id)

    return user


@pytest.fixture
def delegate(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "delegate", "teaching_delegate", trust)


@pytest.fixture
def client(test_client: TestClient, coordinator: User) -> TestClient:
    """Signed in as the coordinator."""
    return _sign_in(test_client, coordinator)


# --- who may send enrolments at all -----------------------------------------


def test_a_user_manager_who_does_not_run_teaching_is_a_403(
    test_client: TestClient,
    trust: OrgUnit,
    coordinator: User,
    delegate: User,
    db_session: Session,
) -> None:
    manager = _user(db_session, "manager", "system_administrator", trust)
    client = _sign_in(test_client, manager)

    response = client.patch(
        f"/api/users/{delegate.id}",
        json={"teaching_enrolments": [_at(trust, FIRST)]},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NOT_ALLOWED}
    assert not is_enrolled(
        db_session, delegate.id, org_unit_id=trust.id, question_bank_id=FIRST
    )


def test_they_are_a_403_even_when_the_list_sent_is_empty(
    test_client: TestClient,
    trust: OrgUnit,
    delegate: User,
    db_session: Session,
) -> None:
    """Sent is enough on an update, whatever the list holds."""
    manager = _user(db_session, "manager", "system_administrator", trust)
    client = _sign_in(test_client, manager)

    response = client.patch(
        f"/api/users/{delegate.id}", json={"teaching_enrolments": []}
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NOT_ALLOWED}


def test_an_empty_list_on_a_new_account_is_not_looked_at(
    test_client: TestClient,
    trust: OrgUnit,
    db_session: Session,
) -> None:
    """A new account has nothing to end, so an empty list says nothing."""
    manager = _user(db_session, "manager", "system_administrator", trust)
    administers(db_session, manager.id, trust.id)
    client = _sign_in(test_client, manager)

    response = client.post(
        "/api/users", json=_new_user(trust, teaching_enrolments=[])
    )

    assert response.status_code == 200, response.text


# --- where they may be settled ----------------------------------------------


def test_an_organisation_they_do_not_belong_to_is_a_422_with_the_reason(
    client: TestClient, delegate: User, elsewhere: OrgUnit
) -> None:
    response = client.patch(
        f"/api/users/{delegate.id}",
        json={"teaching_enrolments": [_at(elsewhere, FIRST)]},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": NOT_THEIR_ORGANISATION}


def test_an_organisation_the_caller_does_not_reach_is_a_403(
    client: TestClient,
    delegate: User,
    elsewhere: OrgUnit,
    db_session: Session,
) -> None:
    """The delegate belongs there; the coordinator does not."""
    add_org_unit_member(db_session, elsewhere.id, delegate.id, "staff")
    db_session.commit()

    response = client.patch(
        f"/api/users/{delegate.id}",
        json={"teaching_enrolments": [_at(elsewhere)]},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NOT_ALLOWED}


# --- when an enrolment ends -------------------------------------------------


def test_an_end_date_already_passed_is_a_422_with_the_reason(
    client: TestClient, trust: OrgUnit, delegate: User
) -> None:
    response = client.patch(
        f"/api/users/{delegate.id}",
        json={
            "teaching_enrolments": [_at(trust, FIRST, ends_on=_yesterday())]
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": END_PASSED}


def test_an_end_date_passed_on_a_new_account_saves_nobody(
    client: TestClient, trust: OrgUnit, db_session: Session
) -> None:
    response = client.post(
        "/api/users",
        json=_new_user(
            trust,
            teaching_enrolments=[_at(trust, FIRST, ends_on=_yesterday())],
        ),
    )

    assert response.status_code == 422
    assert response.json() == {"detail": END_PASSED}
    db_session.rollback()
    assert (
        db_session.query(User).filter_by(username="new_delegate").first()
        is None
    )


# --- enrolling yourself -----------------------------------------------------


def test_enrolling_yourself_into_a_competency_is_a_403_with_the_reason(
    test_client: TestClient,
    trust: OrgUnit,
    coordinator: User,
    db_session: Session,
) -> None:
    """Runs teaching, and holds neither learner competency."""
    lone = _user(db_session, "lone", "system_administrator", trust)
    hold(lone, "manage_teaching")
    db_session.commit()
    client = _sign_in(test_client, lone)

    response = client.patch(
        f"/api/users/{lone.id}",
        json={"teaching_enrolments": [_at(trust, FIRST)]},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NOT_YOURSELF}


# --- what the organisation serves -------------------------------------------


def test_a_module_not_served_is_a_422_with_the_reason(
    client: TestClient, trust: OrgUnit, delegate: User
) -> None:
    response = client.patch(
        f"/api/users/{delegate.id}",
        json={"teaching_enrolments": [_at(trust, "no-such-module")]},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": NOT_SERVED}


def test_a_module_not_served_on_a_new_account_is_a_422_with_the_reason(
    client: TestClient, trust: OrgUnit
) -> None:
    response = client.post(
        "/api/users",
        json=_new_user(
            trust, teaching_enrolments=[_at(trust, "no-such-module")]
        ),
    )

    assert response.status_code == 422
    assert response.json() == {"detail": NOT_SERVED}


def test_belonging_nowhere_under_the_organisation_is_a_422_with_the_reason(
    client: TestClient,
    trust: OrgUnit,
    delegate: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The writer's own refusal, passed on in words for the caller.

    The check on where the person belongs runs first and asks the same
    thing, so no request brings the writer to say this. It is made to
    here, to pin what the route answers if it ever does.
    """

    def _belongs_nowhere(*args: object, **kwargs: object) -> None:
        raise BelongsNowhere()

    monkeypatch.setattr(enrolments, "settle_enrolments", _belongs_nowhere)

    response = client.patch(
        f"/api/users/{delegate.id}",
        json={"teaching_enrolments": [_at(trust, FIRST)]},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": BELONGS_NOWHERE}


# --- which is reported when two things are wrong ----------------------------


def test_where_they_belong_is_reported_before_the_end_date(
    client: TestClient, delegate: User, elsewhere: OrgUnit
) -> None:
    response = client.patch(
        f"/api/users/{delegate.id}",
        json={
            "teaching_enrolments": [
                _at(elsewhere, FIRST, ends_on=_yesterday())
            ]
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": NOT_THEIR_ORGANISATION}


def test_the_end_date_is_reported_before_a_module_not_served(
    client: TestClient, trust: OrgUnit, delegate: User
) -> None:
    response = client.patch(
        f"/api/users/{delegate.id}",
        json={
            "teaching_enrolments": [
                _at(trust, "no-such-module", ends_on=_yesterday())
            ]
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": END_PASSED}
