"""Authorising and withdrawing practice at one place.

A person's competencies say what they are qualified for, everywhere at
once. These routes say where they may exercise one, which is the other
half and the only half an organisation gets to decide.

Covers:
- GET    /api/org-units/{unit_id}/practising-competencies
- POST   /api/org-units/{unit_id}/practising-competencies
- DELETE /api/org-units/{unit_id}/practising-competencies/{user_id}/{competency}
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, PractisingCompetency, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

COMPETENCY = "perform_venepuncture"
OTHER_COMPETENCY = "certify_death"


@pytest.fixture
def own_org(db_session: Session, test_admin: User) -> OrgUnit:
    org = OrgUnit(name="Own Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    add_org_unit_member(db_session, org.id, test_admin.id, "staff")
    administers(db_session, test_admin.id, org.id)
    db_session.commit()
    return org


@pytest.fixture
def other_org(db_session: Session) -> OrgUnit:
    """An organisation the admin does not belong to."""
    org = OrgUnit(name="Other Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    return org


@pytest.fixture
def ward(db_session: Session, own_org: OrgUnit, test_admin: User) -> OrgUnit:
    """A ward the admin may administer.

    Authorised at the ward itself, not inherited from the trust: a row at
    a trust says nothing about its wards, which is the property the whole
    model turns on.
    """
    unit = OrgUnit(name="Ward A", type="ward", parent_id=own_org.id)
    db_session.add(unit)
    db_session.commit()
    administers(db_session, test_admin.id, unit.id)
    return unit


@pytest.fixture
def surgeon(db_session: Session) -> User:
    user = User(
        username="surgeon",
        email="surgeon@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
        full_name="A Surgeon",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _listed(resp: object) -> list[dict[str, object]]:
    """The listed authorisations, minus the fixture's own.

    Same reason as `_rows`: the admin's `manage_users` row is what let
    them call the route, and counting it would make every assertion one
    out.
    """
    return [
        row
        for row in resp.json()["practising_competencies"]  # type: ignore[attr-defined]
        if row["competency"] != "manage_users"
    ]


def _rows(db: Session, unit_id: int) -> list[PractisingCompetency]:
    """The rows at *unit_id*, minus the fixture's own authorisation.

    The `ward` fixture holds a `manage_users` row, because that is what
    lets the admin reach these routes at all. Counting it would make
    every assertion here one out, so it is excluded: these tests are
    about the competencies they authorise, not about the one that let
    them in.
    """
    return list(
        db.execute(
            select(PractisingCompetency).where(
                PractisingCompetency.org_unit_id == unit_id,
                PractisingCompetency.competency != "manage_users",
            )
        )
        .scalars()
        .all()
    )


class TestAuthorisingPractice:
    def test_a_competency_can_be_authorised_at_a_place(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        resp = authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies",
            json={"user_id": surgeon.id, "competency": COMPETENCY},
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "authorised"
        rows = _rows(db_session, ward.id)
        assert len(rows) == 1
        assert rows[0].competency == COMPETENCY
        assert rows[0].user_id == surgeon.id

    def test_who_authorised_it_is_kept(
        self,
        authenticated_admin_client,
        db_session,
        ward,
        surgeon,
        test_admin,
    ):
        """A grant documents itself, which is why withdrawal need not."""
        authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies",
            json={"user_id": surgeon.id, "competency": COMPETENCY},
        )

        row = _rows(db_session, ward.id)[0]
        assert row.authorised_by == test_admin.id
        assert row.authorised_at is not None

    def test_authorising_twice_changes_nothing(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        """A double-click is not a problem to report."""
        body = {"user_id": surgeon.id, "competency": COMPETENCY}
        first = authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies", json=body
        )
        second = authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies", json=body
        )

        assert first.json()["status"] == "authorised"
        assert second.status_code == 200
        assert second.json()["status"] == "unchanged"
        assert len(_rows(db_session, ward.id)) == 1

    def test_authorising_beyond_a_persons_ceiling_is_allowed(
        self, authenticated_admin_client, db_session, ward
    ):
        """The place records its decision without waiting on paperwork.

        The row does nothing until the person is qualified, because
        ``can_practise_at`` requires both halves. Refusing it here would
        make a place unable to say what it has decided.
        """
        patient = User(
            username="not-a-clinician",
            email="nc@example.test",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            base_profession="patient",
        )
        db_session.add(patient)
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies",
            json={"user_id": patient.id, "competency": COMPETENCY},
        )

        assert resp.status_code == 200
        assert len(_rows(db_session, ward.id)) == 1

    def test_an_unknown_person_is_refused(
        self, authenticated_admin_client, ward
    ):
        resp = authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies",
            json={"user_id": 999999, "competency": COMPETENCY},
        )

        assert resp.status_code == 404


class TestWhatCannotBeAuthorised:
    def test_a_room_cannot_hold_competencies(
        self, authenticated_admin_client, db_session, ward, surgeon, test_admin
    ):
        """Nobody practises anything at a room."""
        room = OrgUnit(name="Room 4", type="room", parent_id=ward.id)
        db_session.add(room)
        db_session.commit()
        # Authorised here, so the refusal below is about a room holding
        # no competencies rather than about not seeing the room.
        administers(db_session, test_admin.id, room.id)

        resp = authenticated_admin_client.post(
            f"/api/org-units/{room.id}/practising-competencies",
            json={"user_id": surgeon.id, "competency": COMPETENCY},
        )

        assert resp.status_code == 422
        assert "room" in resp.json()["detail"]

    def test_an_unknown_competency_id_is_refused(
        self, authenticated_admin_client, ward, surgeon
    ):
        """A misspelling would otherwise store a row authorising nothing."""
        resp = authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies",
            json={
                "user_id": surgeon.id,
                "competency": "perform_no_such_thing",
            },
        )

        assert resp.status_code == 422

    def test_a_retired_competency_id_is_refused(
        self, authenticated_admin_client, ward, surgeon
    ):
        """Retiring an id takes it out of use everywhere at once.

        Distinct from withdrawing a row, which removes one person's
        authorisation at one place. This pins that the write boundary
        refuses a retired id, which `validate_competency_ids` gives the
        route for free and a later refactor could silently remove.
        """
        from app.cbac.competencies import RETIRED_COMPETENCY_IDS

        if not RETIRED_COMPETENCY_IDS:
            pytest.skip("Nothing in the catalogue is retired yet.")

        resp = authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies",
            json={
                "user_id": surgeon.id,
                "competency": RETIRED_COMPETENCY_IDS[0],
            },
        )

        assert resp.status_code == 422

    def test_a_place_in_another_organisation_is_not_found(
        self, authenticated_admin_client, db_session, other_org, surgeon
    ):
        """404 rather than 403, so a refusal does not confirm it exists."""
        theirs = OrgUnit(
            name="Their Ward", type="ward", parent_id=other_org.id
        )
        db_session.add(theirs)
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/org-units/{theirs.id}/practising-competencies",
            json={"user_id": surgeon.id, "competency": COMPETENCY},
        )

        assert resp.status_code == 404


class TestListingWhoMayPractise:
    def test_the_authorisations_come_back(
        self, authenticated_admin_client, ward, surgeon
    ):
        for competency in (COMPETENCY, OTHER_COMPETENCY):
            authenticated_admin_client.post(
                f"/api/org-units/{ward.id}/practising-competencies",
                json={"user_id": surgeon.id, "competency": competency},
            )

        resp = authenticated_admin_client.get(
            f"/api/org-units/{ward.id}/practising-competencies"
        )

        assert resp.status_code == 200
        listed = [
            row
            for row in resp.json()["practising_competencies"]
            if row["competency"] != "manage_users"
        ]
        assert len(listed) == 2
        assert {row["competency"] for row in listed} == {
            COMPETENCY,
            OTHER_COMPETENCY,
        }
        assert listed[0]["username"] == "surgeon"
        assert listed[0]["full_name"] == "A Surgeon"

    def test_a_place_with_nothing_authorised_lists_nothing(
        self, authenticated_admin_client, ward
    ):
        """The common state at first, and not an error."""
        resp = authenticated_admin_client.get(
            f"/api/org-units/{ward.id}/practising-competencies"
        )

        assert resp.status_code == 200
        assert _listed(resp) == []

    def test_another_places_authorisations_do_not_appear(
        self,
        authenticated_admin_client,
        db_session,
        own_org,
        ward,
        surgeon,
        test_admin,
    ):
        """Nothing is inherited, in either direction."""
        sibling = OrgUnit(name="Ward B", type="ward", parent_id=own_org.id)
        db_session.add(sibling)
        db_session.commit()
        administers(db_session, test_admin.id, sibling.id)

        authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies",
            json={"user_id": surgeon.id, "competency": COMPETENCY},
        )

        resp = authenticated_admin_client.get(
            f"/api/org-units/{sibling.id}/practising-competencies"
        )

        assert _listed(resp) == []


class TestWithdrawingPractice:
    def test_withdrawing_removes_the_row(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies",
            json={"user_id": surgeon.id, "competency": COMPETENCY},
        )

        resp = authenticated_admin_client.delete(
            f"/api/org-units/{ward.id}/practising-competencies"
            f"/{surgeon.id}/{COMPETENCY}"
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "withdrawn"
        assert _rows(db_session, ward.id) == []

    def test_withdrawing_leaves_the_person_qualified(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        """The suspended surgeon keeps their qualification.

        Removing it from the person would be a lie, and would withdraw it
        at every other place at the same time.
        """
        authenticated_admin_client.post(
            f"/api/org-units/{ward.id}/practising-competencies",
            json={"user_id": surgeon.id, "competency": COMPETENCY},
        )
        authenticated_admin_client.delete(
            f"/api/org-units/{ward.id}/practising-competencies"
            f"/{surgeon.id}/{COMPETENCY}"
        )

        db_session.refresh(surgeon)
        assert COMPETENCY in surgeon.get_final_competencies()

    def test_withdrawing_at_one_place_leaves_another_alone(
        self,
        authenticated_admin_client,
        db_session,
        own_org,
        ward,
        surgeon,
        test_admin,
    ):
        """The case the model exists for: stopped here, still working there."""
        elsewhere = OrgUnit(name="Ward C", type="ward", parent_id=own_org.id)
        db_session.add(elsewhere)
        db_session.commit()
        administers(db_session, test_admin.id, elsewhere.id)

        for unit in (ward, elsewhere):
            authenticated_admin_client.post(
                f"/api/org-units/{unit.id}/practising-competencies",
                json={"user_id": surgeon.id, "competency": COMPETENCY},
            )

        authenticated_admin_client.delete(
            f"/api/org-units/{ward.id}/practising-competencies"
            f"/{surgeon.id}/{COMPETENCY}"
        )

        assert _rows(db_session, ward.id) == []
        assert len(_rows(db_session, elsewhere.id)) == 1

    def test_withdrawing_only_one_competency_leaves_the_others(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        for competency in (COMPETENCY, OTHER_COMPETENCY):
            authenticated_admin_client.post(
                f"/api/org-units/{ward.id}/practising-competencies",
                json={"user_id": surgeon.id, "competency": competency},
            )

        authenticated_admin_client.delete(
            f"/api/org-units/{ward.id}/practising-competencies"
            f"/{surgeon.id}/{COMPETENCY}"
        )

        remaining = _rows(db_session, ward.id)
        assert len(remaining) == 1
        assert remaining[0].competency == OTHER_COMPETENCY

    def test_withdrawing_something_never_authorised_is_not_an_error(
        self, authenticated_admin_client, ward, surgeon
    ):
        """The caller asked for it to be unauthorised, and it is."""
        resp = authenticated_admin_client.delete(
            f"/api/org-units/{ward.id}/practising-competencies"
            f"/{surgeon.id}/{COMPETENCY}"
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "withdrawn"

    def test_withdrawing_at_another_organisations_place_is_not_found(
        self, authenticated_admin_client, db_session, other_org, surgeon
    ):
        theirs = OrgUnit(
            name="Their Ward", type="ward", parent_id=other_org.id
        )
        db_session.add(theirs)
        db_session.commit()

        resp = authenticated_admin_client.delete(
            f"/api/org-units/{theirs.id}/practising-competencies"
            f"/{surgeon.id}/{COMPETENCY}"
        )

        assert resp.status_code == 404


class TestWhoMayAuthorise:
    def test_somebody_without_the_competency_is_refused(
        self, authenticated_clinician_client, ward, surgeon
    ):
        """Authorising practice is its own authority, not part of clinical work."""
        resp = authenticated_clinician_client.post(
            f"/api/org-units/{ward.id}/practising-competencies",
            json={"user_id": surgeon.id, "competency": COMPETENCY},
        )

        assert resp.status_code == 403

    def test_listing_also_requires_it(
        self, authenticated_clinician_client, ward
    ):
        resp = authenticated_clinician_client.get(
            f"/api/org-units/{ward.id}/practising-competencies"
        )

        assert resp.status_code == 403
