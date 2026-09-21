"""The user form says where somebody belongs, in org_unit ids.

It used to say it twice: `organisation_ids`, counting in organisation
ids, and `site_ids`, counting in site ids. Two vocabularies for one
question, and the same number meaning different things in each.

`org_unit_ids` is the one list, and now the only one: the older fields
arrived, overlapped, and have been retired.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, User, org_unit_member
from app.organisations import add_org_unit_member
from app.security import hash_password


@pytest.fixture
def org(db_session: Session) -> OrgUnit:
    organisation = OrgUnit(name="Own Trust", type="hospital_team")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


@pytest.fixture
def ward(db_session: Session, org: OrgUnit) -> OrgUnit:
    place = OrgUnit(name="Ward 9", type="ward", parent_id=org.id)
    db_session.add(place)
    db_session.commit()
    db_session.refresh(place)
    return place


@pytest.fixture
def other_ward(db_session: Session) -> OrgUnit:
    """A ward in a tree the admin has nothing to do with."""
    other = OrgUnit(name="Other Trust", type="hospital_team")
    db_session.add(other)
    db_session.commit()
    place = OrgUnit(name="Their Ward", type="ward", parent_id=other.id)
    db_session.add(place)
    db_session.commit()
    db_session.refresh(place)
    return place


def _places_of(db: Session, user_id: int) -> dict[int, str]:
    return {
        row[0]: row[1]
        for row in db.execute(
            select(
                org_unit_member.c.org_unit_id, org_unit_member.c.capacity
            ).where(org_unit_member.c.user_id == user_id)
        ).all()
    }


def _new_user(**extra: object) -> dict[str, object]:
    return {
        "name": "Ada Someone",
        "username": "ada",
        "email": "ada@example.com",
        "password": "Password123!",
        "base_profession": "consultant",
        **extra,
    }


class TestCreating:
    def test_places_are_recorded(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        ward: OrgUnit,
    ) -> None:
        resp = authenticated_superadmin_client.post(
            "/api/users",
            json=_new_user(org_unit_ids=[org.id, ward.id]),
        )

        assert resp.status_code == 200, resp.text
        assert set(_places_of(db_session, resp.json()["id"])) == {
            org.id,
            ward.id,
        }

    def test_staff_of_an_organisation_and_a_trainee_inside_it(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        ward: OrgUnit,
    ) -> None:
        """What each of the two older lists did, kept exactly.

        Widening the request must not quietly change who counts as staff
        anywhere. Settling on one answer is a separate decision.
        """
        resp = authenticated_superadmin_client.post(
            "/api/users",
            json=_new_user(org_unit_ids=[org.id, ward.id]),
        )

        places = _places_of(db_session, resp.json()["id"])
        root_id = org.id
        assert root_id is not None
        assert places[root_id] == "staff"
        assert places[ward.id] == "trainee"

    def test_a_place_the_caller_cannot_administer_is_not_found(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        other_ward: OrgUnit,
        test_admin: User,
    ) -> None:
        """404, so the answer does not confirm that the place exists."""
        add_org_unit_member(db_session, org.id, test_admin.id, "staff")
        db_session.commit()

        resp = authenticated_admin_client.post(
            "/api/users", json=_new_user(org_unit_ids=[other_ward.id])
        )

        assert resp.status_code == 404, resp.text


class TestChanging:
    @pytest.fixture
    def person(self, db_session: Session) -> User:
        user = User(
            username="person",
            email="person@example.com",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            base_profession="consultant",
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    def test_the_list_given_is_what_they_belong_to(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        ward: OrgUnit,
        person: User,
    ) -> None:
        authenticated_superadmin_client.patch(
            f"/api/users/{person.id}",
            json={"org_unit_ids": [org.id, ward.id]},
        )

        resp = authenticated_superadmin_client.patch(
            f"/api/users/{person.id}", json={"org_unit_ids": [ward.id]}
        )

        assert resp.status_code == 200, resp.text
        assert set(_places_of(db_session, person.id)) == {ward.id}

    def test_an_empty_list_takes_them_off_everywhere(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        person: User,
    ) -> None:
        authenticated_superadmin_client.patch(
            f"/api/users/{person.id}", json={"org_unit_ids": [org.id]}
        )

        authenticated_superadmin_client.patch(
            f"/api/users/{person.id}", json={"org_unit_ids": []}
        )

        assert _places_of(db_session, person.id) == {}

    def test_another_trusts_tree_is_left_alone(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        ward: OrgUnit,
        other_ward: OrgUnit,
        person: User,
        test_admin: User,
    ) -> None:
        """An admin settles their own places, not the whole record.

        Clearing what they cannot see would let an admin at one trust
        empty somebody's memberships at another by saving a form they
        could not even read.
        """
        add_org_unit_member(db_session, org.id, test_admin.id, "staff")
        # The person is in both trusts. The admin can see one of them.
        add_org_unit_member(db_session, org.id, person.id, "staff")
        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=other_ward.id,
                user_id=person.id,
                capacity="trainee",
            )
        )
        db_session.commit()

        resp = authenticated_admin_client.patch(
            f"/api/users/{person.id}", json={"org_unit_ids": [ward.id]}
        )

        assert resp.status_code == 200, resp.text
        assert set(_places_of(db_session, person.id)) == {
            ward.id,
            other_ward.id,
        }


class TestReading:
    def test_the_places_come_back(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        ward: OrgUnit,
    ) -> None:
        created = authenticated_superadmin_client.post(
            "/api/users",
            json=_new_user(org_unit_ids=[org.id, ward.id]),
        )
        user_id = created.json()["id"]

        resp = authenticated_superadmin_client.get(f"/api/users/{user_id}")

        assert set(resp.json()["org_unit_ids"]) == {org.id, ward.id}


class TestTheRetiredName:
    """`place_ids` is gone, leaving `org_unit_ids` as the only answer.

    The expand added `org_unit_ids` beside `place_ids` and shipped a
    release earlier, so a client still sending the old name has had a
    full cycle to move. It is now refused rather than quietly ignored,
    because a silently dropped list reads as "nobody belongs anywhere".
    """

    def test_the_old_name_is_refused_on_create(
        self,
        authenticated_superadmin_client: TestClient,
        org: OrgUnit,
    ) -> None:
        response = authenticated_superadmin_client.post(
            "/api/users",
            json=_new_user(place_ids=[org.id]),
        )

        assert response.status_code == 422, response.text

    def test_the_response_carries_only_the_new_name(
        self,
        authenticated_superadmin_client: TestClient,
        org: OrgUnit,
        ward: OrgUnit,
    ) -> None:
        created = authenticated_superadmin_client.post(
            "/api/users",
            json=_new_user(org_unit_ids=[org.id, ward.id]),
        )
        user_id = created.json()["id"]

        body = authenticated_superadmin_client.get(
            f"/api/users/{user_id}"
        ).json()

        assert set(body["org_unit_ids"]) == {org.id, ward.id}
        assert "place_ids" not in body
