"""Who administers a place, now that rows answer it.

`org_units_administered_by` used to answer from membership: the
organisations somebody belonged to, plus every place beneath them at any
depth. It reads `practising_competency` rows carrying `manage_users`
instead, which is what makes "administer this ward but not the trust
above it" expressible at all.

These pin the difference, because it is a change to live authorisation
and the two answers disagree in both directions. A member with no row
administers nothing where they used to administer everything beneath
their trust; somebody with a row at one ward administers that ward and
nothing else, where membership could only ever have given them the whole
tree or none of it.

Migration `b4c2e7a91f38` seeds the rows from the memberships they
replace, so the answer on the day it deploys is the answer the day
before. `test_practising_competency_backfill.py` covers that.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import OrgUnit, PractisingCompetency, User
from app.organisations import add_org_unit_member, org_units_administered_by
from app.security import hash_password

ADMINISTERS = "manage_users"


def _admin(
    db: Session,
    username: str,
    *,
    platform_role: str = "standard",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="system_administrator",
        platform_role=platform_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    return org


def _ward(db: Session, parent: OrgUnit, name: str) -> OrgUnit:
    ward = OrgUnit(name=name, type="ward", parent_id=parent.id)
    db.add(ward)
    db.commit()
    return ward


def _authorise(
    db: Session,
    user: User,
    place: OrgUnit,
    competency: str = ADMINISTERS,
) -> None:
    db.add(
        PractisingCompetency(
            user_id=user.id,
            org_unit_id=place.id,
            competency=competency,
        )
    )
    db.commit()


class TestARowIsWhatConfersAdministration:
    def test_a_row_administers_that_place(self, db_session: Session) -> None:
        admin = _admin(db_session, "has-row")
        org = _org(db_session, "Trust")
        _authorise(db_session, admin, org)

        assert org_units_administered_by(db_session, admin) == {org.id}

    def test_membership_alone_administers_nothing(
        self, db_session: Session
    ) -> None:
        """The change this unit makes, stated directly.

        Being at a trust used to mean administering it and everything
        beneath it. It now means nothing on its own, which is why the
        backfill has to deploy first.
        """
        admin = _admin(db_session, "member-only")
        org = _org(db_session, "Trust")
        add_org_unit_member(db_session, org.id, admin.id, "staff")
        db_session.commit()

        assert org_units_administered_by(db_session, admin) == set()

    def test_the_ceiling_alone_administers_nothing(
        self, db_session: Session
    ) -> None:
        """Holding `manage_users` is not holding it anywhere."""
        admin = _admin(db_session, "ceiling-only")
        _org(db_session, "Trust")

        assert ADMINISTERS in admin.get_final_competencies()
        assert org_units_administered_by(db_session, admin) == set()


class TestNothingIsInherited:
    def test_a_row_at_a_trust_does_not_reach_its_wards(
        self, db_session: Session
    ) -> None:
        """Membership used to walk down the tree. Rows do not."""
        admin = _admin(db_session, "trust-row")
        org = _org(db_session, "Trust")
        _ward(db_session, org, "Ward A")
        _authorise(db_session, admin, org)

        assert org_units_administered_by(db_session, admin) == {org.id}

    def test_a_row_at_a_ward_does_not_reach_its_trust(
        self, db_session: Session
    ) -> None:
        """The case the whole change exists for.

        A ward manager administers their ward without trust-wide
        authority, which membership could not express: it gave the whole
        tree or none of it.
        """
        admin = _admin(db_session, "ward-row")
        org = _org(db_session, "Trust")
        ward = _ward(db_session, org, "Ward A")
        _authorise(db_session, admin, ward)

        assert org_units_administered_by(db_session, admin) == {ward.id}

    def test_rows_at_several_places_are_all_returned(
        self, db_session: Session
    ) -> None:
        admin = _admin(db_session, "two-rows")
        org = _org(db_session, "Trust")
        ward = _ward(db_session, org, "Ward A")
        _ward(db_session, org, "Ward B")
        _authorise(db_session, admin, org)
        _authorise(db_session, admin, ward)

        assert org_units_administered_by(db_session, admin) == {
            org.id,
            ward.id,
        }


class TestTheCompetencyOnTheRowMatters:
    def test_another_competency_does_not_confer_administration(
        self, db_session: Session
    ) -> None:
        """A row authorises one competency, not the place in general."""
        admin = _admin(db_session, "wrong-competency")
        org = _org(db_session, "Trust")
        _authorise(db_session, admin, org, competency="certify_death")

        assert org_units_administered_by(db_session, admin) == set()

    def test_another_persons_row_does_not_count(
        self, db_session: Session
    ) -> None:
        admin = _admin(db_session, "no-row")
        other = _admin(db_session, "other-admin")
        org = _org(db_session, "Trust")
        _authorise(db_session, other, org)

        assert org_units_administered_by(db_session, admin) == set()


class TestOperators:
    def test_an_operator_administers_everything(
        self, db_session: Session
    ) -> None:
        """None means "all of them", and stays true as the table grows."""
        operator = _admin(db_session, "operator", platform_role="superadmin")
        _org(db_session, "Trust")

        assert org_units_administered_by(db_session, operator) is None

    def test_an_operator_needs_no_row(self, db_session: Session) -> None:
        """Which is why the backfill writes none for them."""
        operator = _admin(
            db_session, "operator-with-no-row", platform_role="superadmin"
        )
        org = _org(db_session, "Trust")
        add_org_unit_member(db_session, org.id, operator.id, "staff")
        db_session.commit()

        assert org_units_administered_by(db_session, operator) is None
