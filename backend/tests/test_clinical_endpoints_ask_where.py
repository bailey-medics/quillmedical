"""The suspended surgeon, asserted against the endpoint layer.

``test_cbac_scoped.py`` and ``test_has_competency_at.py`` show the model
can answer "may this person do this *here*". Nothing clinical asks it
yet: every clinical route still gates on ``has_competency``, which reads
the ceiling and is true everywhere at once.

So this file is the gap, written down. The case is a surgeon suspended by
one hospital pending an investigation: they stay qualified, they go on
operating at the other hospital, and Quill refuses them only at the one
that withdrew its authorisation. That is the case the whole model exists
for and the one it cannot yet enforce.

**Marked ``xfail(strict=True)`` on purpose.** It runs on every suite, it
keeps CI green while no clinical route is scoped, and the moment somebody
scopes one pytest reports it as unexpectedly passing and fails the build.
A test here going green is news, and the signal to delete the xfail
marker rather than the test.

To adopt: give the prescribing route a place in its path, gate it with
``has_competency_at`` from ``app.deps``, and point ``ENDPOINT`` at it.
See ``docs/docs/plans/2026-09-21-practising-competencies-enforcement-plan.md``.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, PractisingCompetency, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import hold

#: The competency the surgeon holds. A stand-in: there is no hernia
#: repair competency in the catalogue, and what is asserted is that the
#: answer differs by place, not which competency it is.
COMPETENCY = "prescribe_controlled_schedule_2"

#: The route the case would be enforced on. It takes no place today,
#: which is exactly why the assertions below cannot pass.
ENDPOINT = "/api/prescriptions/controlled"


@pytest.fixture
def surgeon(db_session: Session) -> User:
    """A consultant who holds the competency, and keeps holding it."""
    user = User(
        username="suspended_surgeon",
        email="surgeon@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
        full_name="A Surgeon",
    )
    hold(user, COMPETENCY)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def hospital_a(db_session: Session, surgeon: User) -> OrgUnit:
    """Where they still operate."""
    org = OrgUnit(name="Hospital A", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    add_org_unit_member(db_session, org.id, surgeon.id, "staff")
    db_session.add(
        PractisingCompetency(
            user_id=surgeon.id,
            org_unit_id=org.id,
            competency=COMPETENCY,
        )
    )
    db_session.commit()
    return org


@pytest.fixture
def hospital_b(db_session: Session, surgeon: User) -> OrgUnit:
    """Where they have been stopped.

    A member, because a suspension is not a dismissal: they are still
    staff there. What is missing is the row authorising them to practise,
    which is what the withdrawal removed.
    """
    org = OrgUnit(name="Hospital B", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    add_org_unit_member(db_session, org.id, surgeon.id, "staff")
    db_session.commit()
    return org


def _as_surgeon(client: TestClient) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": "suspended_surgeon", "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    csrf = client.cookies.get("XSRF-TOKEN")
    if csrf:
        client.headers["X-CSRF-Token"] = csrf
    return client


def _prescribe(client: TestClient, org_unit_id: int):
    """Ask to prescribe at one place.

    The place is sent as a query parameter because the route has nowhere
    to take one. A route that ignores it answers the same either way,
    which is the failure these assertions describe.
    """
    return client.post(
        f"{ENDPOINT}?org_unit_id={org_unit_id}",
        json={
            "patient_id": "patient-1",
            "medication": "Morphine sulfate",
            "dose": "10mg",
            "duration_days": 3,
        },
    )


class TestTheSuspendedSurgeon:
    """Qualified everywhere, authorised at one hospital and not the other."""

    def test_the_competency_survives_the_suspension(
        self, surgeon: User
    ) -> None:
        """Passes today, and must go on passing.

        Removing the competency from the person would be a lie about
        their training, and would stop them at Hospital A too. The
        withdrawal is a row at one place, not a change to the person.
        """
        assert COMPETENCY in surgeon.get_final_competencies()

    def test_they_may_still_work_at_the_hospital_that_kept_them(
        self,
        test_client: TestClient,
        surgeon: User,
        hospital_a: OrgUnit,
        hospital_b: OrgUnit,
    ) -> None:
        """Passes today, for the wrong reason.

        The route allows it because the ceiling allows it, not because
        Hospital A authorised it. Left here so the pair reads as one
        case: this is the half that must not break when the other half
        is fixed.
        """
        client = _as_surgeon(test_client)

        assert _prescribe(client, hospital_a.id).status_code == 201

    @pytest.mark.xfail(
        strict=True,
        reason=(
            "No clinical route asks where. Give the prescribing route a "
            "place and gate it with has_competency_at, then delete this "
            "marker."
        ),
    )
    def test_they_are_refused_at_the_hospital_that_stopped_them(
        self,
        test_client: TestClient,
        surgeon: User,
        hospital_a: OrgUnit,
        hospital_b: OrgUnit,
    ) -> None:
        """The case this model exists for, and cannot yet enforce.

        Hospital B withdrew its authorisation, so there is no row for
        this competency there. The route reads the ceiling and allows it
        anyway, which is a suspended surgeon prescribing at the hospital
        that suspended them.
        """
        client = _as_surgeon(test_client)

        assert _prescribe(client, hospital_b.id).status_code == 404

    @pytest.mark.xfail(
        strict=True,
        reason=(
            "No clinical route asks where, so both places answer the same."
        ),
    )
    def test_the_two_hospitals_answer_differently(
        self,
        test_client: TestClient,
        surgeon: User,
        hospital_a: OrgUnit,
        hospital_b: OrgUnit,
    ) -> None:
        """One person, one competency, two answers.

        Stated as the difference rather than as two absolutes, because
        the difference is the whole point: a model that says yes
        everywhere and one that says no everywhere are both wrong in the
        same way.
        """
        client = _as_surgeon(test_client)

        allowed = _prescribe(client, hospital_a.id).status_code
        refused = _prescribe(client, hospital_b.id).status_code

        assert allowed != refused
