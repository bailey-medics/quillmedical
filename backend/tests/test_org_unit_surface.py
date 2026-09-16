"""One surface for every place.

``/api/organisations`` and ``/api/sites`` grew up as two surfaces over two
tables. There is one table now, so there is one surface: every route takes
a place id, and what a place *is* comes from its type.

The two older surfaces are untouched here. They answer in organisation ids
and site ids, which are different numbers, so both run side by side until
the frontend has moved.

Covers:
- Listing, with and without the roots filter
- Creating a root and creating a place inside one, and what each requires
- Reading one place, with who is here and what is inside it
- Changing, moving, deactivating and deleting
- Members, features, the patient list and links
- Who may see and edit what
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    OrgUnit,
    User,
    org_unit_member,
    org_unit_patient_member,
)
from app.organisations import add_organisation_member
from app.security import hash_password


def _org(db: Session, name: str = "Trust") -> Organisation:
    org = Organisation(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _ward(db: Session, parent_id: int, name: str = "Ward 1") -> OrgUnit:
    place = OrgUnit(name=name, type="ward", parent_id=parent_id)
    db.add(place)
    db.commit()
    db.refresh(place)
    return place


def _person(db: Session, username: str = "alice") -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class TestListing:
    def test_the_roots_are_the_organisations(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.get("/api/org-units?roots=true")

        assert resp.status_code == 200
        ids = [u["id"] for u in resp.json()["org_units"]]
        assert org.org_unit_id in ids
        assert ward.id not in ids

    def test_asking_for_the_others_excludes_them(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.get(
            "/api/org-units?roots=false"
        )

        ids = [u["id"] for u in resp.json()["org_units"]]
        assert ids == [ward.id]

    def test_children_of_one_place(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id, "Ward 1")
        _ward(db_session, ward.id, "Room 4")

        resp = authenticated_superadmin_client.get(
            f"/api/org-units?parent_id={org.org_unit_id}"
        )

        assert [u["id"] for u in resp.json()["org_units"]] == [ward.id]

    def test_an_admin_sees_only_their_own(
        self, authenticated_admin_client, db_session, test_admin
    ):
        mine = _org(db_session, "My Trust")
        theirs = _org(db_session, "Their Trust")
        add_organisation_member(db_session, mine.id, test_admin.id, "staff")
        db_session.commit()
        my_ward = _ward(db_session, mine.org_unit_id, "My Ward")
        _ward(db_session, theirs.org_unit_id, "Their Ward")

        resp = authenticated_admin_client.get("/api/org-units")

        ids = {u["id"] for u in resp.json()["org_units"]}
        assert ids == {mine.org_unit_id, my_ward.id}

    def test_the_type_is_named_for_a_person(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.get(
            "/api/org-units?roots=false"
        )

        assert resp.json()["org_units"][0]["type_display_name"] == "Ward"


class TestCreating:
    def test_an_operator_creates_a_root(
        self, authenticated_superadmin_client, db_session
    ):
        resp = authenticated_superadmin_client.post(
            "/api/org-units",
            json={"name": "New Trust", "type": "organisation"},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["is_root"] is True
        assert body["parent_id"] is None

    def test_an_admin_may_not_create_a_root(
        self, authenticated_admin_client, db_session
    ):
        resp = authenticated_admin_client.post(
            "/api/org-units",
            json={"name": "New Trust", "type": "organisation"},
        )

        assert resp.status_code == 403

    def test_a_place_inside_one(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)

        resp = authenticated_superadmin_client.post(
            "/api/org-units",
            json={
                "name": "Ward 9",
                "type": "ward",
                "parent_id": org.org_unit_id,
            },
        )

        assert resp.status_code == 200
        assert resp.json()["parent_id"] == org.org_unit_id
        assert resp.json()["is_root"] is False

    def test_a_ward_with_no_parent_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        """The type says a ward sits inside something."""
        resp = authenticated_superadmin_client.post(
            "/api/org-units", json={"name": "Loose Ward", "type": "ward"}
        )

        assert resp.status_code == 422

    def test_an_organisation_with_a_parent_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)

        resp = authenticated_superadmin_client.post(
            "/api/org-units",
            json={
                "name": "Inner Trust",
                "type": "organisation",
                "parent_id": org.org_unit_id,
            },
        )

        assert resp.status_code == 422

    def test_an_unknown_type_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)

        resp = authenticated_superadmin_client.post(
            "/api/org-units",
            json={
                "name": "Thing",
                "type": "corridor",
                "parent_id": org.org_unit_id,
            },
        )

        assert resp.status_code == 422

    def test_creating_inside_another_organisation_is_refused(
        self, authenticated_admin_client, db_session, test_admin
    ):
        mine = _org(db_session, "My Trust")
        theirs = _org(db_session, "Their Trust")
        add_organisation_member(db_session, mine.id, test_admin.id, "staff")
        db_session.commit()

        resp = authenticated_admin_client.post(
            "/api/org-units",
            json={
                "name": "My Ward",
                "type": "ward",
                "parent_id": theirs.org_unit_id,
            },
        )

        assert resp.status_code == 404


class TestReadingOne:
    def test_it_names_what_is_inside_it(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.get(
            f"/api/org-units/{org.org_unit_id}"
        )

        assert resp.status_code == 200
        assert [c["id"] for c in resp.json()["children"]] == [ward.id]

    def test_it_names_who_is_here(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        person = _person(db_session)
        add_organisation_member(db_session, org.id, person.id, "staff")
        db_session.commit()

        resp = authenticated_superadmin_client.get(
            f"/api/org-units/{org.org_unit_id}"
        )

        members = resp.json()["members"]
        assert [m["id"] for m in members] == [person.id]
        assert members[0]["capacity"] == "staff"

    def test_a_ward_carries_no_features_or_patients(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.get(f"/api/org-units/{ward.id}")

        assert resp.json()["features"] == []
        assert resp.json()["patient_ids"] == []

    def test_another_organisations_place_is_not_found(
        self, authenticated_admin_client, db_session
    ):
        theirs = _org(db_session, "Their Trust")

        resp = authenticated_admin_client.get(
            f"/api/org-units/{theirs.org_unit_id}"
        )

        assert resp.status_code == 404


class TestChanging:
    def test_renaming(self, authenticated_superadmin_client, db_session):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{ward.id}", json={"name": "Renamed"}
        )

        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed"

    def test_moving_it_inside_itself_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id, "Ward")
        room = _ward(db_session, ward.id, "Room")

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{ward.id}", json={"parent_id": room.id}
        )

        assert resp.status_code == 400

    def test_changing_a_ward_into_an_organisation_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        """Whether a place sits inside another is not a rename."""
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{ward.id}", json={"type": "organisation"}
        )

        assert resp.status_code == 422

    def test_deactivating(self, authenticated_superadmin_client, db_session):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.patch(
            f"/api/org-units/{ward.id}/active", json={"is_active": False}
        )

        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_deleting_a_ward(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.delete(
            f"/api/org-units/{ward.id}"
        )

        assert resp.status_code == 200
        assert db_session.get(OrgUnit, ward.id) is None

    def test_an_admin_may_not_delete_a_root(
        self, authenticated_admin_client, db_session, test_admin
    ):
        mine = _org(db_session, "My Trust")
        add_organisation_member(db_session, mine.id, test_admin.id, "staff")
        db_session.commit()

        resp = authenticated_admin_client.delete(
            f"/api/org-units/{mine.org_unit_id}"
        )

        assert resp.status_code == 403


class TestMembers:
    def test_adding_and_removing(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)
        person = _person(db_session)

        added = authenticated_superadmin_client.post(
            f"/api/org-units/{ward.id}/members",
            json={"user_id": person.id, "capacity": "trainee"},
        )
        assert added.status_code == 200
        assert added.json()["status"] == "added"

        listed = authenticated_superadmin_client.get(
            f"/api/org-units/{ward.id}/members"
        )
        assert [m["id"] for m in listed.json()["members"]] == [person.id]

        removed = authenticated_superadmin_client.delete(
            f"/api/org-units/{ward.id}/members/{person.id}"
        )
        assert removed.status_code == 200
        assert db_session.execute(select(org_unit_member)).first() is None

    def test_adding_twice_changes_the_capacity(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        person = _person(db_session)
        body = {"user_id": person.id, "capacity": "trainee"}
        authenticated_superadmin_client.post(
            f"/api/org-units/{org.org_unit_id}/members", json=body
        )

        again = authenticated_superadmin_client.post(
            f"/api/org-units/{org.org_unit_id}/members",
            json={"user_id": person.id, "capacity": "staff"},
        )

        assert again.json()["status"] == "updated"
        assert (
            db_session.scalar(
                select(org_unit_member.c.capacity).where(
                    org_unit_member.c.user_id == person.id
                )
            )
            == "staff"
        )

    def test_a_room_takes_nobody(
        self, authenticated_superadmin_client, db_session
    ):
        """The type says a room is only an address."""
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)
        room = OrgUnit(name="Room 4", type="room", parent_id=ward.id)
        db_session.add(room)
        db_session.commit()
        person = _person(db_session)

        resp = authenticated_superadmin_client.post(
            f"/api/org-units/{room.id}/members", json={"user_id": person.id}
        )

        assert resp.status_code == 422

    def test_an_unknown_capacity_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        person = _person(db_session)

        resp = authenticated_superadmin_client.post(
            f"/api/org-units/{org.org_unit_id}/members",
            json={"user_id": person.id, "capacity": "chief"},
        )

        assert resp.status_code == 422


class TestFeatures:
    def test_switching_one_on_and_off(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)

        on = authenticated_superadmin_client.put(
            f"/api/org-units/{org.org_unit_id}/features/teaching",
            json={"enabled": True},
        )
        assert on.json()["status"] == "enabled"

        listed = authenticated_superadmin_client.get(
            f"/api/org-units/{org.org_unit_id}/features"
        )
        assert [f["feature_key"] for f in listed.json()["features"]] == [
            "teaching"
        ]

        off = authenticated_superadmin_client.put(
            f"/api/org-units/{org.org_unit_id}/features/teaching",
            json={"enabled": False},
        )
        assert off.json()["status"] == "disabled"

    def test_a_ward_carries_none(
        self, authenticated_superadmin_client, db_session
    ):
        """Refused rather than written and never read."""
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{ward.id}/features/teaching",
            json={"enabled": True},
        )

        assert resp.status_code == 422


class TestPatients:
    def test_adding_and_removing(
        self,
        authenticated_patient_manager_client,
        db_session,
        test_patient_manager,
    ):
        org = _org(db_session)
        add_organisation_member(
            db_session, org.id, test_patient_manager.id, "staff"
        )
        db_session.commit()
        authenticated_superadmin_client = authenticated_patient_manager_client

        added = authenticated_superadmin_client.post(
            f"/api/org-units/{org.org_unit_id}/patients",
            json={"patient_id": "patient-1"},
        )
        assert added.json()["status"] == "added"

        stored = db_session.execute(
            select(org_unit_patient_member.c.patient_id).where(
                org_unit_patient_member.c.org_unit_id == org.org_unit_id
            )
        ).scalar_one()
        assert stored == "patient-1"

        removed = authenticated_superadmin_client.delete(
            f"/api/org-units/{org.org_unit_id}/patients/patient-1"
        )
        assert removed.json()["status"] == "removed"

    def test_a_ward_keeps_no_list(
        self,
        authenticated_patient_manager_client,
        db_session,
        test_patient_manager,
    ):
        org = _org(db_session)
        add_organisation_member(
            db_session, org.id, test_patient_manager.id, "staff"
        )
        db_session.commit()
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_patient_manager_client.post(
            f"/api/org-units/{ward.id}/patients",
            json={"patient_id": "patient-1"},
        )

        assert resp.status_code == 422


class TestLinks:
    def test_recording_and_removing_one(
        self, authenticated_superadmin_client, db_session
    ):
        school = _org(db_session, "Medical School")
        trust = _org(db_session, "Trust")

        created = authenticated_superadmin_client.post(
            f"/api/org-units/{school.org_unit_id}/links",
            json={
                "target_id": trust.org_unit_id,
                "relation": "teaches_at",
            },
        )
        assert created.status_code == 200
        links = created.json()["links"]
        assert len(links) == 1
        assert links[0]["target_name"] == "Trust"

        removed = authenticated_superadmin_client.delete(
            f"/api/org-units/{school.org_unit_id}/links/{links[0]['id']}"
        )
        assert removed.json()["links"] == []

    def test_the_other_end_sees_it_too(
        self, authenticated_superadmin_client, db_session
    ):
        school = _org(db_session, "Medical School")
        trust = _org(db_session, "Trust")
        authenticated_superadmin_client.post(
            f"/api/org-units/{school.org_unit_id}/links",
            json={
                "target_id": trust.org_unit_id,
                "relation": "teaches_at",
            },
        )

        resp = authenticated_superadmin_client.get(
            f"/api/org-units/{trust.org_unit_id}/links"
        )

        assert len(resp.json()["links"]) == 1

    def test_linking_a_place_to_itself_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)

        resp = authenticated_superadmin_client.post(
            f"/api/org-units/{org.org_unit_id}/links",
            json={"target_id": org.org_unit_id, "relation": "hosts"},
        )

        assert resp.status_code == 400


class TestTheOldSurfacesStillWork:
    def test_organisations_still_answers_in_organisation_ids(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)

        resp = authenticated_superadmin_client.get(
            f"/api/organisations/{org.id}"
        )

        assert resp.status_code == 200
        assert resp.json()["id"] == org.id

    def test_sites_still_answers_in_place_ids(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.get(f"/api/sites/{ward.id}")

        assert resp.status_code == 200
        assert resp.json()["id"] == ward.id


class TestTheClinicalLead:
    def test_naming_one(self, authenticated_superadmin_client, db_session):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)
        person = _person(db_session)
        authenticated_superadmin_client.post(
            f"/api/org-units/{ward.id}/members",
            json={"user_id": person.id, "capacity": "staff"},
        )

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{ward.id}/clinical-lead",
            json={"user_id": person.id},
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "set"
        detail = authenticated_superadmin_client.get(
            f"/api/org-units/{ward.id}"
        )
        assert detail.json()["clinical_lead_id"] == person.id

    def test_leaving_the_post_vacant(
        self, authenticated_superadmin_client, db_session
    ):
        """A vacancy is a real state, so it is said rather than implied."""
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)
        person = _person(db_session)
        authenticated_superadmin_client.post(
            f"/api/org-units/{ward.id}/members",
            json={"user_id": person.id, "capacity": "staff"},
        )
        authenticated_superadmin_client.put(
            f"/api/org-units/{ward.id}/clinical-lead",
            json={"user_id": person.id},
        )

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{ward.id}/clinical-lead", json={}
        )

        assert resp.json()["status"] == "vacant"
        detail = authenticated_superadmin_client.get(
            f"/api/org-units/{ward.id}"
        )
        assert detail.json()["clinical_lead_id"] is None

    def test_somebody_not_at_the_place_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)
        stranger = _person(db_session, "stranger")

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{ward.id}/clinical-lead",
            json={"user_id": stranger.id},
        )

        assert resp.status_code == 422

    def test_a_room_has_no_clinical_lead(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)
        room = OrgUnit(name="Room 4", type="room", parent_id=ward.id)
        db_session.add(room)
        db_session.commit()
        person = _person(db_session)

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{room.id}/clinical-lead",
            json={"user_id": person.id},
        )

        assert resp.status_code == 422

    def test_the_list_of_places_names_the_lead(
        self, authenticated_superadmin_client, db_session
    ):
        """So a list reads without a request per row."""
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)
        person = _person(db_session)
        authenticated_superadmin_client.post(
            f"/api/org-units/{ward.id}/members",
            json={"user_id": person.id, "capacity": "staff"},
        )
        authenticated_superadmin_client.put(
            f"/api/org-units/{ward.id}/clinical-lead",
            json={"user_id": person.id},
        )

        detail = authenticated_superadmin_client.get(
            f"/api/org-units/{org.org_unit_id}"
        )

        child = detail.json()["children"][0]
        assert child["clinical_lead_id"] == person.id
        assert child["clinical_lead_name"] == "alice"
