"""Walking the governance tree.

Ownership is the parent column alone: an organisation is a row with no
parent, and every place beneath it walks up to that row to find out who
is accountable for it.

``TestTheTwoIdSequencesStayApart`` used to close this file, checking
that an organisation's id and its place id were different numbers so
that nothing confusing the two could pass here and fail everywhere
else. There is one sequence now — an organisation *is* a place — so
there is nothing left for it to guard, and nothing left to keep a
paired row in step with either.

Covers:
- Each walk is one recursive query, whatever the depth
- What makes a place an organisation: its type, not its lack of a parent
- Walking up: the root, and whether it is an organisation
- Walking down: a whole subtree, three levels deep, with no leak into a
  neighbouring organisation
- A broken tree answers None rather than hanging
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import OrgUnit
from app.org_units.tree import (
    MAX_TREE_DEPTH,
    descendant_ids,
    organisation_org_unit_ids,
    organisation_place_of_site,
    organisation_places_of_sites,
    root_id_of,
)
from app.org_units.types import ROOT_TYPE_IDS


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="hospital_team")
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


class TestWhatMakesAPlaceAnOrganisation:
    """Its type, not its lack of a parent.

    This class used to check that creating an organisation created a
    paired row in the tree and kept it in step — a name, a type and a
    location copied across by a listener, with an unknown kind falling
    back to the plain one. There is one row now, so none of that can
    come apart. What is left is the question those rows existed to
    answer.
    """

    def test_a_root_type_with_no_parent_is_an_organisation(self, db_session):
        org = _org(db_session, "Trust")

        assert org.type in ROOT_TYPE_IDS
        assert org.parent_id is None
        assert org.id in set(
            db_session.execute(organisation_org_unit_ids()).scalars().all()
        )

    def test_a_ward_with_no_parent_is_not(self, db_session):
        """A detached ward is its own root, which is a different thing.

        Reading "root" as "organisation" would give its members the run
        of somewhere nobody is accountable for.
        """
        loose = _under(db_session, None, "Loose Ward", "ward")

        assert loose.parent_id is None
        assert loose.id not in set(
            db_session.execute(organisation_org_unit_ids()).scalars().all()
        )

    def test_renaming_one_is_one_row(self, db_session):
        org = _org(db_session, "Old Name")

        org.name = "New Name"
        org.location = "Elsewhere"
        db_session.commit()
        db_session.refresh(org)

        assert org.name == "New Name"
        assert org.location == "Elsewhere"


class TestWalkingUp:
    def test_an_organisation_is_its_own_root(self, db_session):
        org = _org(db_session, "Trust")

        assert root_id_of(db_session, org.id) == org.id

    def test_a_place_three_levels_down_still_finds_it(self, db_session):
        """The interface builds two levels; the walk is not limited to two."""
        org = _org(db_session, "Trust")
        hospital = _under(db_session, org.id, "Hospital", "hospital")
        ward = _under(db_session, hospital.id, "Ward", "ward")
        room = _under(db_session, ward.id, "Room", "room")

        assert root_id_of(db_session, room.id) == org.id
        assert organisation_place_of_site(db_session, room.id) == org.id

    def test_a_place_with_no_parent_at_all_has_no_organisation(
        self, db_session
    ):
        """A detached place is accountable to nobody, and says so."""
        loose = _under(db_session, None, "Loose Ward", "ward")

        assert root_id_of(db_session, loose.id) == loose.id
        assert organisation_place_of_site(db_session, loose.id) is None

    def test_a_place_that_does_not_exist_has_no_root(self, db_session):
        assert root_id_of(db_session, 999999) is None

    def test_a_cycle_answers_none_rather_than_hanging(self, db_session):
        """The guard against making one comes later; this is the net."""
        org = _org(db_session, "Trust")
        a = _under(db_session, org.id, "A", "ward")
        b = _under(db_session, a.id, "B", "room")
        a.parent_id = b.id
        db_session.commit()

        assert root_id_of(db_session, a.id) is None
        assert organisation_place_of_site(db_session, a.id) is None

    def test_a_chain_longer_than_the_cap_gives_up(self, db_session):
        org = _org(db_session, "Trust")
        parent_id = org.id
        for depth in range(MAX_TREE_DEPTH + 2):
            parent_id = _under(
                db_session, parent_id, f"Level {depth}", "ward"
            ).id

        assert root_id_of(db_session, parent_id) is None


class TestWalkingDown:
    def test_a_whole_subtree_comes_back_three_levels_deep(self, db_session):
        org = _org(db_session, "Trust")
        hospital = _under(db_session, org.id, "Hospital", "hospital")
        ward = _under(db_session, hospital.id, "Ward", "ward")
        room = _under(db_session, ward.id, "Room", "room")

        assert descendant_ids(db_session, [org.id]) == {
            hospital.id,
            ward.id,
            room.id,
        }

    def test_a_root_is_not_one_of_its_own_places(self, db_session):
        org = _org(db_session, "Trust")
        ward = _under(db_session, org.id, "Ward", "ward")

        assert descendant_ids(db_session, [org.id]) == {ward.id}

    def test_a_neighbouring_organisation_does_not_leak_in(self, db_session):
        mine = _org(db_session, "My Trust")
        theirs = _org(db_session, "Their Trust")
        my_ward = _under(db_session, mine.id, "My Ward", "ward")
        _under(db_session, theirs.id, "Their Ward", "ward")

        assert descendant_ids(db_session, [mine.id]) == {my_ward.id}

    def test_asking_about_no_organisations_returns_nothing(self, db_session):
        assert descendant_ids(db_session, []) == set()

    def test_a_cycle_below_a_root_does_not_loop(self, db_session):
        org = _org(db_session, "Trust")
        a = _under(db_session, org.id, "A", "ward")
        b = _under(db_session, a.id, "B", "room")
        # B's child is A again, which is already in the subtree.
        c = _under(db_session, b.id, "C", "room")
        c.parent_id = b.id
        db_session.commit()

        found = descendant_ids(db_session, [org.id])
        assert found == {a.id, b.id, c.id}


class TestNamingTheOrganisationForManyPlaces:
    def test_each_place_is_matched_to_its_own_organisation(self, db_session):
        mine = _org(db_session, "My Trust")
        theirs = _org(db_session, "Their Trust")
        my_ward = _under(db_session, mine.id, "My Ward", "ward")
        their_ward = _under(db_session, theirs.id, "Ward", "ward")
        loose = _under(db_session, None, "Loose", "ward")

        assert organisation_places_of_sites(
            db_session, [my_ward.id, their_ward.id, loose.id]
        ) == {
            my_ward.id: mine.id,
            their_ward.id: theirs.id,
        }

    def test_a_detached_ward_is_not_an_organisation(self, db_session):
        """It is its own root, which is not the same thing.

        What makes a place an organisation is its type — the kinds that
        need no parent are the kinds a tree starts with. Reading "root"
        as "organisation" would give a detached ward's members the run
        of somewhere nobody is accountable for.
        """
        loose = _under(db_session, None, "Loose", "ward")

        found = set(
            db_session.execute(organisation_org_unit_ids()).scalars().all()
        )

        assert root_id_of(db_session, loose.id) == loose.id
        assert loose.id not in found

    def test_an_organisations_own_row_is_one(self, db_session):
        org = _org(db_session, "Trust")

        found = set(
            db_session.execute(organisation_org_unit_ids()).scalars().all()
        )

        assert org.id in found


class TestDeletingAnOrganisation:
    def test_its_row_goes_with_it(self, db_session):
        org = _org(db_session, "Trust")
        root_id = org.id

        db_session.delete(org)
        db_session.commit()

        assert db_session.get(OrgUnit, root_id) is None

    def test_its_places_are_detached_rather_than_deleted(self, db_session):
        org = _org(db_session, "Trust")
        ward = _under(db_session, org.id, "Ward", "ward")

        db_session.delete(org)
        db_session.commit()

        db_session.refresh(ward)
        assert ward.parent_id is None
        assert organisation_place_of_site(db_session, ward.id) is None


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
        assert org.id is not None
        root_id = org.id
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
        their_ward_id = _under(db_session, other.id, "Ward", "ward").id

        asked = self._count_queries(
            db_session,
            lambda: organisation_places_of_sites(
                db_session, [room_id, their_ward_id]
            ),
        )

        assert asked == 2
