"""One member of a place: what they hold, and what they may do there.

The page about one person at one place reads both halves of the model at
once, and can write both at once: give somebody a competency and
authorise them to practise it here, in one step.

Covers:
- GET  /api/org-units/{unit_id}/members/{user_id}/practice
- POST /api/org-units/{unit_id}/members/{user_id}/grant-and-authorise
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, PractisingCompetency, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

#: Held by a consultant from their profession.
HELD = "perform_venepuncture"
#: Not held by a consultant, and not granted by their profession.
NOT_HELD = "manage_users"


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
def ward(db_session: Session, own_org: OrgUnit, test_admin: User) -> OrgUnit:
    unit = OrgUnit(name="Ward A", type="ward", parent_id=own_org.id)
    db_session.add(unit)
    db_session.commit()
    administers(db_session, test_admin.id, unit.id)
    return unit


def _person(db: Session, username: str, **extra: object) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
        full_name=username.title(),
        **extra,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def surgeon(db_session: Session, own_org: OrgUnit, ward: OrgUnit) -> User:
    """A consultant at the trust and at its ward."""
    user = _person(db_session, "surgeon")
    add_org_unit_member(db_session, own_org.id, user.id, "staff")
    add_org_unit_member(db_session, ward.id, user.id, "staff")
    db_session.commit()
    return user


def _practice_url(unit_id: int, user_id: int) -> str:
    return f"/api/org-units/{unit_id}/members/{user_id}/practice"


def _grant_url(unit_id: int, user_id: int) -> str:
    return f"/api/org-units/{unit_id}/members/{user_id}/grant-and-authorise"


def _authorised(db: Session, unit_id: int, user_id: int) -> set[str]:
    return set(
        db.execute(
            select(PractisingCompetency.competency).where(
                PractisingCompetency.org_unit_id == unit_id,
                PractisingCompetency.user_id == user_id,
            )
        )
        .scalars()
        .all()
    )


class TestReadingOneMember:
    def test_ceiling_and_rows_come_back_together(
        self,
        authenticated_admin_client,
        db_session,
        ward,
        surgeon,
        test_admin,
    ):
        db_session.add(
            PractisingCompetency(
                user_id=surgeon.id,
                org_unit_id=ward.id,
                competency=HELD,
                authorised_by=test_admin.id,
            )
        )
        db_session.commit()

        resp = authenticated_admin_client.get(
            _practice_url(ward.id, surgeon.id)
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["user_id"] == surgeon.id
        assert body["org_unit_name"] == "Ward A"
        assert HELD in body["qualified"]
        assert NOT_HELD not in body["qualified"]
        assert [row["competency"] for row in body["authorised"]] == [HELD]
        assert body["authorised"][0]["authorised_by"] == "testadmin"
        assert body["may_grant"] is True

    def test_a_row_beyond_the_ceiling_is_still_listed(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        """It authorises nothing, but hiding it would hide a row somebody wrote."""
        db_session.add(
            PractisingCompetency(
                user_id=surgeon.id, org_unit_id=ward.id, competency=NOT_HELD
            )
        )
        db_session.commit()

        body = authenticated_admin_client.get(
            _practice_url(ward.id, surgeon.id)
        ).json()

        assert [row["competency"] for row in body["authorised"]] == [NOT_HELD]
        assert body["authorised"][0]["authorised_by"] is None
        assert NOT_HELD not in body["qualified"]

    def test_rows_at_another_place_are_not_listed(
        self, authenticated_admin_client, db_session, own_org, ward, surgeon
    ):
        db_session.add(
            PractisingCompetency(
                user_id=surgeon.id, org_unit_id=own_org.id, competency=HELD
            )
        )
        db_session.commit()

        body = authenticated_admin_client.get(
            _practice_url(ward.id, surgeon.id)
        ).json()

        assert body["authorised"] == []

    def test_somebody_who_is_not_a_member_is_not_found(
        self, authenticated_admin_client, db_session, ward
    ):
        stranger = _person(db_session, "stranger")

        resp = authenticated_admin_client.get(
            _practice_url(ward.id, stranger.id)
        )

        assert resp.status_code == 404

    def test_a_place_the_caller_cannot_see_is_not_found(
        self, authenticated_admin_client, db_session
    ):
        theirs = OrgUnit(name="Their Trust", type="hospital_team")
        db_session.add(theirs)
        db_session.commit()
        person = _person(db_session, "theirs")
        add_org_unit_member(db_session, theirs.id, person.id, "staff")
        db_session.commit()

        resp = authenticated_admin_client.get(
            _practice_url(theirs.id, person.id)
        )

        assert resp.status_code == 404

    def test_reading_yourself_offers_no_grant(
        self, authenticated_admin_client, db_session, ward, test_admin
    ):
        add_org_unit_member(db_session, ward.id, test_admin.id, "staff")
        db_session.commit()

        body = authenticated_admin_client.get(
            _practice_url(ward.id, test_admin.id)
        ).json()

        assert body["may_grant"] is False

    def test_it_requires_manage_practising_competencies(
        self, authenticated_clinician_client, ward, surgeon
    ):
        resp = authenticated_clinician_client.get(
            _practice_url(ward.id, surgeon.id)
        )

        assert resp.status_code == 403


class TestGrantingAndAuthorising:
    def test_both_are_written(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        resp = authenticated_admin_client.post(
            _grant_url(ward.id, surgeon.id), json={"competency": NOT_HELD}
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "granted_and_authorised"
        db_session.refresh(surgeon)
        assert NOT_HELD in surgeon.get_final_competencies()
        assert NOT_HELD in surgeon.additional_competency_ids
        assert _authorised(db_session, ward.id, surgeon.id) == {NOT_HELD}

    def test_the_grant_records_who_and_where(
        self, authenticated_admin_client, db_session, ward, surgeon, test_admin
    ):
        authenticated_admin_client.post(
            _grant_url(ward.id, surgeon.id), json={"competency": NOT_HELD}
        )

        db_session.refresh(surgeon)
        row = next(
            row
            for row in surgeon.competency_grants
            if row.competency_id == NOT_HELD
        )
        assert row.granted_by == test_admin.id
        assert row.org_unit_id == ward.id

    def test_nothing_else_on_the_ceiling_changes(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        before = set(surgeon.get_final_competencies())

        authenticated_admin_client.post(
            _grant_url(ward.id, surgeon.id), json={"competency": NOT_HELD}
        )

        db_session.refresh(surgeon)
        assert set(surgeon.get_final_competencies()) == before | {NOT_HELD}

    def test_a_profession_competency_that_was_removed_is_restored(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        for row in surgeon.competency_grants:
            if row.competency_id == HELD:
                db_session.delete(row)
        db_session.commit()
        db_session.refresh(surgeon)
        assert HELD in surgeon.removed_competency_ids

        resp = authenticated_admin_client.post(
            _grant_url(ward.id, surgeon.id), json={"competency": HELD}
        )

        assert resp.json()["status"] == "granted_and_authorised"
        db_session.refresh(surgeon)
        assert HELD in surgeon.get_final_competencies()
        assert HELD not in surgeon.removed_competency_ids
        assert HELD not in surgeon.additional_competency_ids

    def test_a_held_competency_is_only_authorised(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        resp = authenticated_admin_client.post(
            _grant_url(ward.id, surgeon.id), json={"competency": HELD}
        )

        assert resp.json()["status"] == "authorised"
        assert _authorised(db_session, ward.id, surgeon.id) == {HELD}

    def test_asking_again_changes_nothing(
        self, authenticated_admin_client, db_session, ward, surgeon
    ):
        authenticated_admin_client.post(
            _grant_url(ward.id, surgeon.id), json={"competency": NOT_HELD}
        )

        resp = authenticated_admin_client.post(
            _grant_url(ward.id, surgeon.id), json={"competency": NOT_HELD}
        )

        assert resp.json()["status"] == "unchanged"
        db_session.refresh(surgeon)
        current = [
            row
            for row in surgeon.competency_grants
            if row.competency_id == NOT_HELD and row.ends_on is None
        ]
        assert len(current) == 1

    def test_an_unknown_competency_is_refused(
        self, authenticated_admin_client, ward, surgeon
    ):
        resp = authenticated_admin_client.post(
            _grant_url(ward.id, surgeon.id),
            json={"competency": "not_a_competency"},
        )

        assert resp.status_code == 422


class TestWhoMayGrant:
    def test_nobody_grants_themselves(
        self, authenticated_admin_client, db_session, ward, test_admin
    ):
        add_org_unit_member(db_session, ward.id, test_admin.id, "staff")
        db_session.commit()

        resp = authenticated_admin_client.post(
            _grant_url(ward.id, test_admin.id),
            json={"competency": "certify_death"},
        )

        assert resp.status_code == 403
        # Their `manage_users` row is the fixture's, and is what let them in.
        assert "certify_death" not in _authorised(
            db_session, ward.id, test_admin.id
        )

    def test_an_operator_cannot_be_changed_by_an_administrator(
        self, authenticated_admin_client, db_session, own_org, ward
    ):
        operator = _person(db_session, "operator", platform_role="superadmin")
        add_org_unit_member(db_session, own_org.id, operator.id, "staff")
        add_org_unit_member(db_session, ward.id, operator.id, "staff")
        db_session.commit()

        resp = authenticated_admin_client.post(
            _grant_url(ward.id, operator.id), json={"competency": NOT_HELD}
        )

        assert resp.status_code == 403

    def test_somebody_in_no_shared_organisation_is_not_found(
        self, authenticated_admin_client, db_session, test_admin
    ):
        """Administering a ward is not sharing its trust with its staff."""
        theirs = OrgUnit(name="Their Trust", type="hospital_team")
        db_session.add(theirs)
        db_session.commit()
        their_ward = OrgUnit(
            name="Their Ward", type="ward", parent_id=theirs.id
        )
        db_session.add(their_ward)
        db_session.commit()
        administers(db_session, test_admin.id, their_ward.id)
        person = _person(db_session, "theirs")
        add_org_unit_member(db_session, theirs.id, person.id, "staff")
        add_org_unit_member(db_session, their_ward.id, person.id, "staff")
        db_session.commit()

        read = authenticated_admin_client.get(
            _practice_url(their_ward.id, person.id)
        )
        resp = authenticated_admin_client.post(
            _grant_url(their_ward.id, person.id), json={"competency": NOT_HELD}
        )

        assert read.json()["may_grant"] is False
        assert resp.status_code == 404
        db_session.refresh(person)
        assert NOT_HELD not in person.get_final_competencies()
        assert _authorised(db_session, their_ward.id, person.id) == set()

    def test_an_operator_may_grant_anyone(
        self, authenticated_superadmin_client, db_session
    ):
        unit = OrgUnit(name="Any Trust", type="hospital_team")
        db_session.add(unit)
        db_session.commit()
        person = _person(db_session, "anyone")
        add_org_unit_member(db_session, unit.id, person.id, "staff")
        db_session.commit()

        resp = authenticated_superadmin_client.post(
            _grant_url(unit.id, person.id), json={"competency": NOT_HELD}
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "granted_and_authorised"

    def test_it_requires_manage_users(
        self, authenticated_clinician_client, ward, surgeon
    ):
        resp = authenticated_clinician_client.post(
            _grant_url(ward.id, surgeon.id), json={"competency": NOT_HELD}
        )

        assert resp.status_code == 403
