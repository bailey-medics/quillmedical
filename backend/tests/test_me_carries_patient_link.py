"""``/api/auth/me`` says which patient record an account belongs to.

The message composer needs to know whether someone is writing about
their own health, so it can hide the patient picker. It used to ask the
``single-user`` rung of ``system_permissions``, a column being retired.

**A competency cannot answer this yet.** The natural test is
``access_patient_records``, and eighteen staff professions hold it
alongside ``patient`` — from ``healthcare_assistant`` to ``consultant``
— because the id names two different permissions: reading the records of
patients you treat, and reading your own. Splitting it is recorded in
the plan as its own unit.

So the interface reads ``fhir_patient_id``, which is how the backend
already answers the same question in ``check_user_patient_access`` and
the two self-access routes in ``main.py``. Additive, so a stale client
is unaffected.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password

PATIENT_RECORD = "fhir-patient-their-own"


def _user(
    db: Session,
    username: str,
    *,
    profession: str,
    fhir_patient_id: str | None = None,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        fhir_patient_id=fhir_patient_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return client


class TestTheFieldIsServed:
    """Both answers matter: the modal branches on which it gets."""

    def test_a_patient_carries_their_record_id(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        _user(
            db_session,
            "a_patient",
            profession="patient",
            fhir_patient_id=PATIENT_RECORD,
        )

        client = _login(test_client, "a_patient")
        response = client.get("/api/auth/me")

        assert response.status_code == 200, response.text
        assert response.json()["fhir_patient_id"] == PATIENT_RECORD

    def test_a_clinician_carries_null(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Staff who are not patients here have no record to point at."""
        _user(db_session, "a_clinician", profession="specialty_trainee_1_2")

        client = _login(test_client, "a_clinician")
        response = client.get("/api/auth/me")

        assert response.status_code == 200, response.text
        assert response.json()["fhir_patient_id"] is None


class TestTheCompetencyCannotServeInstead:
    """Why the interface reads a link rather than a competency."""

    def test_a_clinician_holds_the_patient_competency_too(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """The reason this field exists, asserted rather than assumed.

        If ``access_patient_records`` distinguished patients from staff,
        the modal could ask for it and no new field would be needed. It
        does not, and this fails the day the competency is split — which
        is the point at which the field can go.
        """
        _user(db_session, "also_holds_it", profession="specialty_trainee_1_2")

        client = _login(test_client, "also_holds_it")
        response = client.get("/api/auth/me")

        assert response.status_code == 200, response.text
        body = response.json()
        assert "access_patient_records" in body["competencies"]
        assert body["fhir_patient_id"] is None


@pytest.mark.parametrize(
    "profession", ["patient", "specialty_trainee_1_2", "receptionist"]
)
def test_the_field_is_always_present(
    test_client: TestClient,
    db_session: Session,
    profession: str,
) -> None:
    """Present for everyone, so the interface never sees it missing."""
    _user(db_session, f"user_{profession}", profession=profession)

    client = _login(test_client, f"user_{profession}")
    response = client.get("/api/auth/me")

    assert response.status_code == 200, response.text
    assert "fhir_patient_id" in response.json()
