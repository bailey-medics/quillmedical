"""``/api/auth/me`` says which patient record an account belongs to.

The message composer needs to know whether someone is writing about
their own health, so it can hide the patient picker. It used to ask the
``single-user`` rung of ``system_permissions``, a column being retired.

**A competency does not answer this, even now one could.** The id was
split into ``access_own_patient_records`` and ``access_patient_records``,
so a competency *can* mark a patient — only the ``patient`` profession
holds the first. It still does not serve here, for two reasons:

- A clinician who is also a patient at their own trust holds both, so
  reading the competency would hide the patient picker from someone
  messaging about a patient they treat.
- The interface needs to know *which* record is theirs, to name it on
  the conversation. A competency says what someone may do, never which
  record it applies to.

So the interface reads ``fhir_patient_id``, which is how the backend
answers the same question in ``check_user_patient_access`` and the two
self-access routes in ``main.py``. Additive, so a stale client is
unaffected.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password
from tests.competencies import hold

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


class TestTheCompetencyDoesNotServeInstead:
    """Why the interface reads a link rather than a competency."""

    def test_a_clinician_who_is_also_a_patient_holds_both(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """The case that keeps this field, asserted rather than assumed.

        Someone treating patients at the trust where they are also
        registered holds ``access_patient_records`` for their caseload
        and ``access_own_patient_records`` for themselves. A modal
        reading the second would hide their patient picker, which is
        wrong whenever they are messaging about someone they treat.

        The link says which record is theirs and the competencies do
        not, so the two are not interchangeable.
        """
        clinician = _user(
            db_session,
            "treats_and_is_treated",
            profession="specialty_trainee_1_2",
            fhir_patient_id=PATIENT_RECORD,
        )
        hold(clinician, "access_own_patient_records")
        db_session.commit()

        client = _login(test_client, "treats_and_is_treated")
        response = client.get("/api/auth/me")

        assert response.status_code == 200, response.text
        body = response.json()
        assert "access_patient_records" in body["competencies"]
        assert "access_own_patient_records" in body["competencies"]
        assert body["fhir_patient_id"] == PATIENT_RECORD

    def test_a_patient_holds_only_the_own_records_competency(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """The split did work: the competency alone marks a patient.

        It is simply not what this field is for.
        """
        _user(
            db_session,
            "just_a_patient",
            profession="patient",
            fhir_patient_id=PATIENT_RECORD,
        )

        client = _login(test_client, "just_a_patient")
        response = client.get("/api/auth/me")

        assert response.status_code == 200, response.text
        body = response.json()
        assert "access_own_patient_records" in body["competencies"]
        assert "access_patient_records" not in body["competencies"]


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
