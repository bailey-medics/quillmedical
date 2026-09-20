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

from app.cbac.positions import clinical_lead_post, clinical_leads_of
from app.models import (
    Organisation,
    OrgUnit,
    Position,
    PositionHolding,
    User,
    org_unit_member,
    org_unit_patient_member,
)
from app.org_units.tree import root_ids_of_organisations
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

    def test_each_kind_of_organisation_can_be_created(
        self, authenticated_superadmin_client
    ):
        """The kinds used to be a column on the organisations table.

        They are types of place now, so a screen offering them is
        offering something the server will accept — which it was not
        while the tree knew only one kind of organisation.
        """
        kinds = [
            "organisation",
            "hospital_team",
            "gp_practice",
            "private_clinic",
            "teaching_establishment",
        ]

        for kind in kinds:
            resp = authenticated_superadmin_client.post(
                "/api/org-units",
                json={"name": f"A {kind}", "type": kind},
            )

            assert resp.status_code == 200, resp.text
            assert resp.json()["is_root"] is True

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

    def test_it_names_the_place_it_sits_inside(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)

        resp = authenticated_superadmin_client.get(f"/api/org-units/{ward.id}")

        assert resp.json()["parent_name"] == org.name
        assert resp.json()["parent_is_root"] is True

    def test_it_says_when_the_place_above_is_not_an_organisation(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)
        room = OrgUnit(name="Room 4", type="room", parent_id=ward.id)
        db_session.add(room)
        db_session.commit()

        resp = authenticated_superadmin_client.get(f"/api/org-units/{room.id}")

        # A screen linking upwards needs to know which page to send
        # somebody to, and a ward is not an organisation.
        assert resp.json()["parent_name"] == ward.name
        assert resp.json()["parent_is_root"] is False

    def test_the_top_of_a_tree_sits_inside_nothing(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)

        resp = authenticated_superadmin_client.get(
            f"/api/org-units/{org.org_unit_id}"
        )

        assert resp.json()["parent_id"] is None
        assert resp.json()["parent_name"] == ""
        assert resp.json()["parent_is_root"] is False

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


class TestTheOrganisationsSurfaceStillWorks:
    """The sites surface has gone; this one has not.

    It answers in organisation ids rather than place ids, which is what
    makes them two surfaces rather than one with two names. It stays
    until the user form stops sending organisation ids to the users API.
    """

    def test_it_still_answers_in_organisation_ids(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)

        resp = authenticated_superadmin_client.get(
            f"/api/organisations/{org.id}"
        )

        assert resp.status_code == 200
        assert resp.json()["id"] == org.id


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


class TestLeavingAPlace:
    """What somebody holds at a place goes when they do.

    These rules were proved against `/api/sites` while it was the only
    way to do any of this. They are rules about places, not about that
    address, so they are asked here before it goes.
    """

    def test_taking_the_lead_off_the_place_vacates_the_post(
        self, authenticated_superadmin_client, db_session
    ):
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

        authenticated_superadmin_client.delete(
            f"/api/org-units/{ward.id}/members/{person.id}"
        )

        # Naming a lead requires them to be at the place, so leaving them
        # holding the post afterwards would be a state this same surface
        # refuses to create.
        assert clinical_leads_of(db_session, [ward.id]) == {}

    def test_the_departure_is_recorded_rather_than_erased(
        self, authenticated_superadmin_client, db_session
    ):
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

        authenticated_superadmin_client.delete(
            f"/api/org-units/{ward.id}/members/{person.id}"
        )

        post = clinical_lead_post(db_session, ward)
        holdings = (
            db_session.execute(
                select(PositionHolding).where(
                    PositionHolding.position_id == post.id
                )
            )
            .scalars()
            .all()
        )
        assert len(holdings) == 1
        assert holdings[0].ended_on is not None

    def test_taking_anybody_else_off_leaves_the_post_alone(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org.org_unit_id)
        lead = _person(db_session)
        nurse = _person(db_session, "nurse")
        for person in (lead, nurse):
            authenticated_superadmin_client.post(
                f"/api/org-units/{ward.id}/members",
                json={"user_id": person.id, "capacity": "staff"},
            )
        authenticated_superadmin_client.put(
            f"/api/org-units/{ward.id}/clinical-lead",
            json={"user_id": lead.id},
        )

        authenticated_superadmin_client.delete(
            f"/api/org-units/{ward.id}/members/{nurse.id}"
        )

        assert clinical_leads_of(db_session, [ward.id]) == {ward.id: lead.id}


class TestThePostIsCreatedOnDemand:
    """A post nobody has tried to fill is not a vacancy anyone is chasing."""

    def test_a_new_place_has_no_clinical_lead_post(self, db_session):
        ward = OrgUnit(name="Fresh Ward", type="ward")
        db_session.add(ward)
        db_session.commit()

        assert (
            db_session.execute(
                select(Position).where(Position.org_unit_id == ward.id)
            ).first()
            is None
        )

    def test_asking_for_it_creates_it_vacant(self, db_session):
        ward = OrgUnit(name="Fresh Ward", type="ward")
        db_session.add(ward)
        db_session.commit()

        post = clinical_lead_post(db_session, ward)
        db_session.commit()

        assert post.kind == "clinical_lead"
        assert post.max_holders == 1
        assert clinical_leads_of(db_session, [ward.id]) == {}


class TestMovingAPlace:
    """The tree has to stay a tree, however deep the chain being moved.

    One level up is refused already (`TestChanging`). This is about the
    walk going the whole way, which is what `/api/sites` proved and what
    nothing else asks.
    """

    def test_under_a_deeper_descendant_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        """The walk goes the whole way up, not one level."""
        org = _org(db_session)
        hospital = _ward(db_session, org.org_unit_id, "Hospital")
        ward = OrgUnit(name="Ward", type="ward", parent_id=hospital.id)
        db_session.add(ward)
        db_session.commit()
        room = OrgUnit(name="Room 4", type="room", parent_id=ward.id)
        db_session.add(room)
        db_session.commit()

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{hospital.id}", json={"parent_id": room.id}
        )

        assert resp.status_code == 400
        db_session.refresh(hospital)
        assert hospital.parent_id == org.org_unit_id

    def test_a_move_that_keeps_it_a_tree_still_works(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        first = _ward(db_session, org.org_unit_id, "Ward 1")
        second = _ward(db_session, org.org_unit_id, "Ward 2")

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{first.id}", json={"parent_id": second.id}
        )

        assert resp.status_code == 200
        db_session.refresh(first)
        assert first.parent_id == second.id


class TestWhatTheAnswerLeavesOut:
    """The list fails closed, and the gate is a competency.

    These were asked of `/api/sites`, which is being retired. They are
    rules about who may read the estate, not about that address.
    """

    def test_an_admin_in_no_organisation_sees_nothing(
        self, authenticated_admin_client, db_session
    ):
        """An empty list of organisations must not invert into "all".

        ``IN ()`` is the classic way a filter turns into its opposite.
        """
        org = _org(db_session, "Some Trust")
        _ward(db_session, org.org_unit_id, "Unreachable Ward")

        resp = authenticated_admin_client.get("/api/org-units")

        assert resp.status_code == 200
        assert resp.json()["org_units"] == []

    def test_a_place_that_belongs_nowhere_is_not_shared(
        self, authenticated_admin_client, db_session, test_admin
    ):
        """A place under nothing is an anomaly, not a commons."""
        mine = _org(db_session, "My Trust")
        add_organisation_member(db_session, mine.id, test_admin.id, "staff")
        db_session.commit()
        orphan = OrgUnit(name="Orphan Ward", type="ward")
        db_session.add(orphan)
        db_session.commit()

        resp = authenticated_admin_client.get("/api/org-units")

        names = {unit["name"] for unit in resp.json()["org_units"]}
        assert "Orphan Ward" not in names

    def test_the_rank_alone_is_not_enough(
        self, authenticated_client, db_session, test_user
    ):
        """Promoted by rank, in the right organisation, no competency.

        A consultant holds clinical competencies and not ``manage_users``,
        which is the distinction the gate exists to make.
        """
        org = _org(db_session, "My Trust")
        test_user.base_profession = "consultant"
        add_organisation_member(db_session, org.id, test_user.id, "staff")
        db_session.commit()

        resp = authenticated_client.get("/api/org-units")

        assert resp.status_code == 403

    def test_a_superadmin_sees_every_trusts_places(
        self, authenticated_superadmin_client, db_session
    ):
        first = _org(db_session, "First Trust")
        second = _org(db_session, "Second Trust")
        mine = _ward(db_session, first.org_unit_id, "First Ward")
        theirs = _ward(db_session, second.org_unit_id, "Second Ward")

        resp = authenticated_superadmin_client.get("/api/org-units")

        ids = {unit["id"] for unit in resp.json()["org_units"]}
        assert {mine.id, theirs.id} <= ids


class TestNestingStaysInsideOneOrganisation:
    """A place cannot be moved into somebody else's tree.

    Creating inside another organisation is already refused. Moving is
    the same rule applied later, and only `/api/sites` asked it.
    """

    def test_moving_under_another_organisations_place_is_refused(
        self, authenticated_admin_client, db_session, test_admin
    ):
        mine = _org(db_session, "My Trust")
        theirs = _org(db_session, "Their Trust")
        add_organisation_member(db_session, mine.id, test_admin.id, "staff")
        db_session.commit()
        my_ward = _ward(db_session, mine.org_unit_id, "My Ward")
        their_ward = _ward(db_session, theirs.org_unit_id, "Their Ward")

        resp = authenticated_admin_client.put(
            f"/api/org-units/{my_ward.id}",
            json={"parent_id": their_ward.id},
        )

        assert resp.status_code == 404
        db_session.refresh(my_ward)
        assert my_ward.parent_id == mine.org_unit_id

    def test_creating_under_another_organisations_place_is_refused(
        self, authenticated_admin_client, db_session, test_admin
    ):
        """Not only their organisation: anything in their tree."""
        mine = _org(db_session, "My Trust")
        theirs = _org(db_session, "Their Trust")
        add_organisation_member(db_session, mine.id, test_admin.id, "staff")
        db_session.commit()
        their_ward = _ward(db_session, theirs.org_unit_id, "Their Ward")

        resp = authenticated_admin_client.post(
            "/api/org-units",
            json={
                "name": "My Room",
                "type": "room",
                "parent_id": their_ward.id,
            },
        )

        assert resp.status_code == 404

    def test_a_place_that_belongs_nowhere_cannot_be_the_parent(
        self, authenticated_admin_client, db_session, test_admin
    ):
        """An orphan is not a shared place to hang things off."""
        mine = _org(db_session, "My Trust")
        add_organisation_member(db_session, mine.id, test_admin.id, "staff")
        db_session.commit()
        orphan = OrgUnit(name="Orphan Ward", type="ward")
        db_session.add(orphan)
        db_session.commit()

        resp = authenticated_admin_client.post(
            "/api/org-units",
            json={"name": "My Room", "type": "room", "parent_id": orphan.id},
        )

        assert resp.status_code == 404

    def test_moving_under_a_sibling_still_works(
        self, authenticated_admin_client, db_session, test_admin
    ):
        mine = _org(db_session, "My Trust")
        add_organisation_member(db_session, mine.id, test_admin.id, "staff")
        db_session.commit()
        first = _ward(db_session, mine.org_unit_id, "Ward 1")
        second = _ward(db_session, mine.org_unit_id, "Ward 2")

        resp = authenticated_admin_client.put(
            f"/api/org-units/{first.id}", json={"parent_id": second.id}
        )

        assert resp.status_code == 200
        db_session.refresh(first)
        assert first.parent_id == second.id


class TestAnOrganisationCreatedAsAPlace:
    """A root created here is an organisation in every sense.

    Two tables still describe one thing: the places, and the
    organisations that answer in organisation ids. Creating a root
    without the second one produced a place only a superadmin could see,
    with nobody able to belong to it — the first thing anybody would try.
    """

    def test_it_gets_its_organisation_row(
        self, authenticated_superadmin_client, db_session
    ):
        resp = authenticated_superadmin_client.post(
            "/api/org-units",
            json={"name": "New Trust", "type": "gp_practice"},
        )

        place_id = resp.json()["id"]
        organisation = db_session.scalar(
            select(Organisation).where(Organisation.org_unit_id == place_id)
        )
        assert organisation is not None
        assert organisation.name == "New Trust"
        assert organisation.type == "gp_practice"

    def test_only_one_place_is_created(
        self, authenticated_superadmin_client, db_session
    ):
        """The listener on the model makes a root for a new organisation.

        Writing the organisation with its place already named is what
        stops it making a second one.
        """
        resp = authenticated_superadmin_client.post(
            "/api/org-units",
            json={"name": "New Trust", "type": "organisation"},
        )

        roots = (
            db_session.execute(
                select(OrgUnit).where(OrgUnit.parent_id.is_(None))
            )
            .scalars()
            .all()
        )
        assert [root.id for root in roots] == [resp.json()["id"]]

    def test_somebody_can_then_be_made_a_member_and_see_it(
        self, authenticated_superadmin_client, db_session, test_admin
    ):
        resp = authenticated_superadmin_client.post(
            "/api/org-units",
            json={"name": "New Trust", "type": "organisation"},
        )
        place_id = resp.json()["id"]
        organisation = db_session.scalar(
            select(Organisation).where(Organisation.org_unit_id == place_id)
        )

        add_organisation_member(
            db_session, organisation.id, test_admin.id, "staff"
        )
        db_session.commit()

        assert root_ids_of_organisations(db_session, [organisation.id]) == [
            place_id
        ]

    def test_renaming_it_renames_the_organisation(
        self, authenticated_superadmin_client, db_session
    ):
        created = authenticated_superadmin_client.post(
            "/api/org-units",
            json={"name": "Old Name", "type": "organisation"},
        )
        place_id = created.json()["id"]

        authenticated_superadmin_client.put(
            f"/api/org-units/{place_id}", json={"name": "New Name"}
        )

        organisation = db_session.scalar(
            select(Organisation).where(Organisation.org_unit_id == place_id)
        )
        assert organisation.name == "New Name"

    def test_deleting_it_deletes_the_organisation(
        self, authenticated_superadmin_client, db_session
    ):
        created = authenticated_superadmin_client.post(
            "/api/org-units",
            json={"name": "Doomed Trust", "type": "organisation"},
        )
        place_id = created.json()["id"]

        authenticated_superadmin_client.delete(f"/api/org-units/{place_id}")

        assert (
            db_session.scalar(
                select(Organisation).where(
                    Organisation.org_unit_id == place_id
                )
            )
            is None
        )
        assert db_session.get(OrgUnit, place_id) is None
