"""A teaching link lets people reach, and nothing more.

A medical school teaching on a trust's wards is a relationship and not
ownership, so it is a link rather than a parent. The point of recording it
is that people at the school can then reach the trust's teaching content —
and the point of it being a link is that they gain nothing else.

Covers:
- A teaching link adds the place it points at to what a person reaches
- A link belongs to the place that made it, not to the whole organisation
- Other relations add nothing
- Reach is not membership, and is not authority to administer
- Links are followed one hop, and only away from where you already are
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import (
    OrgUnit,
    OrgUnitLink,
    User,
    org_unit_member,
)
from app.organisations import (
    add_org_unit_member,
    get_member_org_unit_ids,
    get_reachable_org_unit_ids,
)
from app.security import hash_password


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _ward(db: Session, org: OrgUnit, name: str) -> OrgUnit:
    place = OrgUnit(name=name, type="ward", parent_id=org.id)
    db.add(place)
    db.commit()
    db.refresh(place)
    return place


def _person(db: Session, username: str) -> User:
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


def _link(db: Session, source: int, target: int, relation: str) -> OrgUnitLink:
    row = OrgUnitLink(source_id=source, target_id=target, relation=relation)
    db.add(row)
    db.commit()
    return row


class TestATeachingLinkGrantsReach:
    def test_the_place_it_points_at_becomes_reachable(self, db_session):
        school = _org(db_session, "Medical School")
        trust = _org(db_session, "Trust")
        student = _person(db_session, "student")
        add_org_unit_member(db_session, school.id, student.id, "trainee")
        _link(db_session, school.id, trust.id, "teaches_at")

        assert get_reachable_org_unit_ids(db_session, student.id) == sorted(
            [school.id, trust.id]
        )

    def test_a_link_from_a_ward_reaches_for_that_ward_s_members(
        self, db_session
    ):
        """Reach starts from the places the person is actually at."""
        school = _org(db_session, "Medical School")
        trust = _org(db_session, "Trust")
        classroom = _ward(db_session, school, "Classroom")
        student = _person(db_session, "student")
        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=classroom.id,
                user_id=student.id,
                capacity="trainee",
            )
        )
        db_session.commit()
        _link(db_session, classroom.id, trust.id, "teaches_at")

        assert trust.id in get_reachable_org_unit_ids(db_session, student.id)

    def test_a_link_one_ward_made_is_not_the_whole_organisation_s(
        self, db_session
    ):
        """A link belongs to the place that made it.

        Otherwise one ward recording a relationship would quietly open it
        to everybody at the trust, which is a wider promise than the ward
        made.
        """
        school = _org(db_session, "Medical School")
        trust = _org(db_session, "Trust")
        classroom = _ward(db_session, school, "Classroom")
        student = _person(db_session, "student")
        add_org_unit_member(db_session, school.id, student.id, "trainee")
        _link(db_session, classroom.id, trust.id, "teaches_at")

        assert get_reachable_org_unit_ids(db_session, student.id) == [
            school.id
        ]

    def test_other_relations_add_nothing(self, db_session):
        school = _org(db_session, "Medical School")
        trust = _org(db_session, "Trust")
        student = _person(db_session, "student")
        add_org_unit_member(db_session, school.id, student.id, "trainee")
        _link(db_session, school.id, trust.id, "hosts")

        assert get_reachable_org_unit_ids(db_session, student.id) == [
            school.id
        ]

    def test_a_link_pointing_the_other_way_does_not_let_you_in(
        self, db_session
    ):
        """A link is a claim its source makes about itself.

        Following it backwards would let anybody name a school and be let
        into it.
        """
        school = _org(db_session, "Medical School")
        trust = _org(db_session, "Trust")
        consultant = _person(db_session, "consultant")
        add_org_unit_member(db_session, trust.id, consultant.id, "staff")
        _link(db_session, school.id, trust.id, "teaches_at")

        assert get_reachable_org_unit_ids(db_session, consultant.id) == [
            trust.id
        ]

    def test_reach_does_not_chain(self, db_session):
        """One hop. Two would make reach depend on a path nobody drew."""
        school = _org(db_session, "Medical School")
        trust = _org(db_session, "Trust")
        further = _org(db_session, "Another Trust")
        student = _person(db_session, "student")
        add_org_unit_member(db_session, school.id, student.id, "trainee")
        _link(db_session, school.id, trust.id, "teaches_at")
        _link(db_session, trust.id, further.id, "teaches_at")

        reachable = get_reachable_org_unit_ids(db_session, student.id)
        assert trust.id in reachable
        assert further.id not in reachable


class TestALinkConfersNothingElse:
    def test_it_does_not_make_you_a_member(self, db_session):
        school = _org(db_session, "Medical School")
        trust = _org(db_session, "Trust")
        student = _person(db_session, "student")
        add_org_unit_member(db_session, school.id, student.id, "trainee")
        _link(db_session, school.id, trust.id, "teaches_at")

        assert get_member_org_unit_ids(db_session, student.id) == [school.id]

    def test_it_does_not_let_you_administer_the_other_place(
        self, authenticated_admin_client, db_session, test_admin
    ):
        """The admin checks ask about membership, which does not follow
        links. That separation is why the two lookups exist."""
        school = _org(db_session, "Medical School")
        trust = _org(db_session, "Trust")
        add_org_unit_member(db_session, school.id, test_admin.id, "staff")
        _link(db_session, school.id, trust.id, "teaches_at")

        resp = authenticated_admin_client.get(f"/api/org-units/{trust.id}")

        assert resp.status_code == 404

    def test_no_link_means_no_extra_reach(self, db_session):
        school = _org(db_session, "Medical School")
        _org(db_session, "Trust")
        student = _person(db_session, "student")
        add_org_unit_member(db_session, school.id, student.id, "trainee")

        assert get_reachable_org_unit_ids(db_session, student.id) == [
            school.id
        ]
