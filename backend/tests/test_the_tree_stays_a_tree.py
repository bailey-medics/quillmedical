"""A place cannot be moved inside itself.

A tree is one parent each *and* no cycles. The column gives the first for
nothing, because one column cannot hold two parents. The second has to be
checked on every move, or the tree quietly stops being one — and until
scoping walked the column, nothing noticed: a place under its own ward
was accepted and simply never followed.

Covers the guard and the walk it depends on. What the route does with
the answer is tested on the place surface, where the route lives.

Covers:
- A place cannot be its own parent
- A place cannot be moved under its own child, or a deeper descendant
- The walk itself: ancestors, and what a broken chain does
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import OrgUnit
from app.org_units.tree import (
    MAX_TREE_DEPTH,
    ancestor_ids,
    would_make_a_cycle,
)


def _org(db: Session, name: str = "Trust") -> OrgUnit:
    org = OrgUnit(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _under(db: Session, parent_id: int | None, name: str) -> OrgUnit:
    site = OrgUnit(name=name, type="ward", parent_id=parent_id)
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


class TestTheGuardItself:
    def test_a_place_is_not_its_own_parent(self, db_session):
        org = _org(db_session)
        ward = _under(db_session, org.id, "Ward")

        assert would_make_a_cycle(db_session, ward.id, ward.id)

    def test_its_own_child_is_refused(self, db_session):
        org = _org(db_session)
        ward = _under(db_session, org.id, "Ward")
        room = _under(db_session, ward.id, "Room")

        assert would_make_a_cycle(db_session, ward.id, room.id)

    def test_a_deeper_descendant_is_refused(self, db_session):
        """The walk goes the whole way up, not one level."""
        org = _org(db_session)
        hospital = _under(db_session, org.id, "Hospital")
        ward = _under(db_session, hospital.id, "Ward")
        room = _under(db_session, ward.id, "Room")

        assert would_make_a_cycle(db_session, hospital.id, room.id)

    def test_a_sibling_subtree_is_allowed(self, db_session):
        org = _org(db_session)
        first = _under(db_session, org.id, "Building A")
        second = _under(db_session, org.id, "Building B")

        assert not would_make_a_cycle(db_session, first.id, second.id)


class TestWalkingUp:
    def test_ancestors_come_back_nearest_first(self, db_session):
        org = _org(db_session)
        hospital = _under(db_session, org.id, "Hospital")
        ward = _under(db_session, hospital.id, "Ward")
        room = _under(db_session, ward.id, "Room")

        assert ancestor_ids(db_session, room.id) == [
            ward.id,
            hospital.id,
            org.id,
        ]

    def test_a_root_has_none(self, db_session):
        org = _org(db_session)

        assert ancestor_ids(db_session, org.id) == []

    def test_a_chain_that_never_ends_stops_at_the_cap(self, db_session):
        """A wrong answer beats a request that never finishes."""
        first = _under(db_session, None, "A")
        second = _under(db_session, first.id, "B")
        first.parent_id = second.id
        db_session.commit()

        assert len(ancestor_ids(db_session, first.id)) <= MAX_TREE_DEPTH
