"""Walking the governance tree.

Ownership is the parent column alone: an organisation is a row with no
parent, and every place beneath it walks up to that row to find out who
is accountable for it.

Covers:
- Each walk is one recursive query, whatever the depth
- Every organisation gets a row in the tree, and keeps it in step
- Walking up: the root, and the organisation it stands for
- Walking down: a whole subtree, three levels deep, with no leak into a
  neighbouring organisation
- A broken tree answers None rather than hanging
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Organisation, OrgUnit
from app.org_units.tree import (
    MAX_TREE_DEPTH,
    descendant_ids,
    organisation_id_of_site,
    organisation_ids_of_sites,
    root_id_of,
    root_ids_of_organisations,
    site_ids_of_organisations,
)
from app.org_units.types import ORGANISATION_TYPE


def _org(db: Session, name: str) -> Organisation:
    org = Organisation(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _under(
    db: Session, parent_id: int | None, name: str, type_: str
) -> OrgUnit:
    site = OrgUnit(name=name, type=type_, parent_id=parent_id)
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


class TestEveryOrganisationIsInTheTree:
    def test_creating_one_creates_its_row(self, db_session):
        org = _org(db_session, "Trust")

        assert org.org_unit_id is not None
        root = db_session.get(OrgUnit, org.org_unit_id)
        assert root.name == "Trust"
        assert root.type == ORGANISATION_TYPE
        assert root.parent_id is None

    def test_renaming_one_renames_its_row(self, db_session):
        org = _org(db_session, "Old Name")

        org.name = "New Name"
        org.location = "Elsewhere"
        db_session.commit()

        root = db_session.get(OrgUnit, org.org_unit_id)
        db_session.refresh(root)
        assert root.name == "New Name"
        assert root.location == "Elsewhere"

    def test_two_organisations_get_two_rows(self, db_session):
        a = _org(db_session, "A")
        b = _org(db_session, "B")

        assert a.org_unit_id != b.org_unit_id


class TestWalkingUp:
    def test_an_organisation_is_its_own_root(self, db_session):
        org = _org(db_session, "Trust")

        assert root_id_of(db_session, org.org_unit_id) == org.org_unit_id

    def test_a_place_three_levels_down_still_finds_it(self, db_session):
        """The interface builds two levels; the walk is not limited to two."""
        org = _org(db_session, "Trust")
        hospital = _under(db_session, org.org_unit_id, "Hospital", "hospital")
        ward = _under(db_session, hospital.id, "Ward", "ward")
        room = _under(db_session, ward.id, "Room", "room")

        assert root_id_of(db_session, room.id) == org.org_unit_id
        assert organisation_id_of_site(db_session, room.id) == org.id

    def test_a_place_with_no_parent_at_all_has_no_organisation(
        self, db_session
    ):
        """A detached place is accountable to nobody, and says so."""
        loose = _under(db_session, None, "Loose Ward", "ward")

        assert root_id_of(db_session, loose.id) == loose.id
        assert organisation_id_of_site(db_session, loose.id) is None

    def test_a_place_that_does_not_exist_has_no_root(self, db_session):
        assert root_id_of(db_session, 999999) is None

    def test_a_cycle_answers_none_rather_than_hanging(self, db_session):
        """The guard against making one comes later; this is the net."""
        org = _org(db_session, "Trust")
        a = _under(db_session, org.org_unit_id, "A", "ward")
        b = _under(db_session, a.id, "B", "room")
        a.parent_id = b.id
        db_session.commit()

        assert root_id_of(db_session, a.id) is None
        assert organisation_id_of_site(db_session, a.id) is None

    def test_a_chain_longer_than_the_cap_gives_up(self, db_session):
        org = _org(db_session, "Trust")
        parent_id = org.org_unit_id
        for depth in range(MAX_TREE_DEPTH + 2):
            parent_id = _under(
                db_session, parent_id, f"Level {depth}", "ward"
            ).id

        assert root_id_of(db_session, parent_id) is None


class TestWalkingDown:
    def test_a_whole_subtree_comes_back_three_levels_deep(self, db_session):
        org = _org(db_session, "Trust")
        hospital = _under(db_session, org.org_unit_id, "Hospital", "hospital")
        ward = _under(db_session, hospital.id, "Ward", "ward")
        room = _under(db_session, ward.id, "Room", "room")

        assert descendant_ids(db_session, [org.org_unit_id]) == {
            hospital.id,
            ward.id,
            room.id,
        }

    def test_a_root_is_not_one_of_its_own_places(self, db_session):
        org = _org(db_session, "Trust")
        ward = _under(db_session, org.org_unit_id, "Ward", "ward")

        assert site_ids_of_organisations(db_session, [org.id]) == [ward.id]

    def test_a_neighbouring_organisation_does_not_leak_in(self, db_session):
        mine = _org(db_session, "My Trust")
        theirs = _org(db_session, "Their Trust")
        my_ward = _under(db_session, mine.org_unit_id, "My Ward", "ward")
        _under(db_session, theirs.org_unit_id, "Their Ward", "ward")

        assert site_ids_of_organisations(db_session, [mine.id]) == [my_ward.id]

    def test_asking_about_no_organisations_returns_nothing(self, db_session):
        assert site_ids_of_organisations(db_session, []) == []
        assert descendant_ids(db_session, []) == set()

    def test_a_cycle_below_a_root_does_not_loop(self, db_session):
        org = _org(db_session, "Trust")
        a = _under(db_session, org.org_unit_id, "A", "ward")
        b = _under(db_session, a.id, "B", "room")
        # B's child is A again, which is already in the subtree.
        c = _under(db_session, b.id, "C", "room")
        c.parent_id = b.id
        db_session.commit()

        found = descendant_ids(db_session, [org.org_unit_id])
        assert found == {a.id, b.id, c.id}


class TestNamingTheOrganisationForManyPlaces:
    def test_each_place_is_matched_to_its_own_organisation(self, db_session):
        mine = _org(db_session, "My Trust")
        theirs = _org(db_session, "Their Trust")
        my_ward = _under(db_session, mine.org_unit_id, "My Ward", "ward")
        their_ward = _under(db_session, theirs.org_unit_id, "Ward", "ward")
        loose = _under(db_session, None, "Loose", "ward")

        assert organisation_ids_of_sites(
            db_session, [my_ward.id, their_ward.id, loose.id]
        ) == {my_ward.id: mine.id, their_ward.id: theirs.id}

    def test_roots_come_back_for_the_organisations_asked_for(self, db_session):
        a = _org(db_session, "A")
        b = _org(db_session, "B")

        assert root_ids_of_organisations(db_session, [a.id, b.id]) == sorted(
            [a.org_unit_id, b.org_unit_id]
        )
        assert root_ids_of_organisations(db_session, []) == []


class TestAnOrganisationIsNotASite:
    """Organisations share the table now, so the site routes must not
    reach them: a trust renamed from a screen built for wards, or listed
    among them, would be a surprise."""

    def test_it_is_not_in_the_list_of_places(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")
        ward = _under(db_session, org.org_unit_id, "Ward", "ward")

        listed = authenticated_superadmin_client.get("/api/sites").json()
        ids = [s["id"] for s in listed["sites"]]

        assert ward.id in ids
        assert org.org_unit_id not in ids

    def test_it_cannot_be_read_as_a_place(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")

        resp = authenticated_superadmin_client.get(
            f"/api/sites/{org.org_unit_id}"
        )

        assert resp.status_code == 404

    def test_it_cannot_be_renamed_as_a_place(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")

        resp = authenticated_superadmin_client.put(
            f"/api/sites/{org.org_unit_id}", json={"name": "Renamed"}
        )

        assert resp.status_code == 404

    def test_it_cannot_be_deleted_as_a_place(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")

        resp = authenticated_superadmin_client.delete(
            f"/api/sites/{org.org_unit_id}"
        )

        assert resp.status_code == 404
        assert db_session.get(OrgUnit, org.org_unit_id) is not None


class TestDeletingAnOrganisation:
    def test_its_row_goes_with_it(self, db_session):
        org = _org(db_session, "Trust")
        root_id = org.org_unit_id

        db_session.delete(org)
        db_session.commit()

        assert db_session.get(OrgUnit, root_id) is None

    def test_its_places_are_detached_rather_than_deleted(self, db_session):
        org = _org(db_session, "Trust")
        ward = _under(db_session, org.org_unit_id, "Ward", "ward")

        db_session.delete(org)
        db_session.commit()

        db_session.refresh(ward)
        assert ward.parent_id is None
        assert organisation_id_of_site(db_session, ward.id) is None


class TestEachWalkIsOneQuery:
    """Scoping runs on every admin request, so depth must not cost trips.

    A walk that asks the database once per level is fine on a two-level
    tree and quietly gets worse as the tree grows — which is exactly the
    kind of cost nobody notices until the day a third level is added.
    """

    @staticmethod
    def _count_queries(db_session, work) -> int:
        from sqlalchemy import event

        connection = db_session.connection()
        counted: list[str] = []

        def record(_conn, _cursor, statement, *_args):
            counted.append(statement)

        event.listen(connection.engine, "before_cursor_execute", record)
        try:
            work()
        finally:
            event.remove(connection.engine, "before_cursor_execute", record)
        return len(counted)

    def _four_levels(self, db_session) -> tuple[int, int]:
        """Build a four-level tree and return the root and leaf ids.

        Ids rather than rows: reading an attribute off a row that was
        committed reloads it, and that query would be counted as though
        the walk had made it.
        """
        org = _org(db_session, "Trust")
        assert org.org_unit_id is not None
        root_id = org.org_unit_id
        hospital = _under(db_session, root_id, "Hospital", "hospital")
        ward = _under(db_session, hospital.id, "Ward", "ward")
        room = _under(db_session, ward.id, "Room", "room")
        return root_id, room.id

    def test_walking_down_asks_once(self, db_session):
        root_id, _room_id = self._four_levels(db_session)

        asked = self._count_queries(
            db_session, lambda: descendant_ids(db_session, [root_id])
        )

        assert asked == 1

    def test_walking_up_asks_once(self, db_session):
        _root_id, room_id = self._four_levels(db_session)

        asked = self._count_queries(
            db_session, lambda: root_id_of(db_session, room_id)
        )

        assert asked == 1

    def test_naming_the_organisation_for_many_places_asks_twice(
        self, db_session
    ):
        """One walk up for the whole list, then one lookup of the roots."""
        _root_id, room_id = self._four_levels(db_session)
        other = _org(db_session, "Other Trust")
        their_ward_id = _under(
            db_session, other.org_unit_id, "Ward", "ward"
        ).id

        asked = self._count_queries(
            db_session,
            lambda: organisation_ids_of_sites(
                db_session, [room_id, their_ward_id]
            ),
        )

        assert asked == 2
