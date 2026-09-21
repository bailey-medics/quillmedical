"""What the backfill has to reproduce.

The migration that seeds `practising_competency` from membership is
Postgres SQL and cannot run here: the unit database is SQLite, built from
model metadata rather than from the migration chain. What these tests pin
is the thing the SQL has to agree with, which is where the rows come from
in the first place.

The set the backfill has to produce is the one membership used to imply:
the organisations somebody belongs to, plus every place beneath them.
`org_units_administered_by` answered exactly that until the branch above
repointed it at rows, so these ask `get_member_org_unit_ids` and
`descendant_ids` directly instead. Naming the membership resolvers rather
than the helper is what keeps the test meaningful: asking the helper now
would be asking whether rows contain rows.

If this file's expectations and the migration's `WITH RECURSIVE` ever
disagree, the migration is wrong.

The migration itself is exercised against real Postgres by running
`alembic upgrade head`, `downgrade -1` and `upgrade head` again with
`compose.migrate.yml`, which is how the `CAST(NULL AS integer)` it needs
was found.
"""

from __future__ import annotations

import pathlib
import re

import pytest
from sqlalchemy.orm import Session

from app.cbac.base_professions import get_profession_base_competencies
from app.models import OrgUnit, User
from app.org_units.tree import descendant_ids
from app.organisations import (
    add_org_unit_member,
    get_member_org_unit_ids,
    org_units_administered_by,
)
from app.security import hash_password

MIGRATION = (
    pathlib.Path(__file__).parent.parent
    / "alembic"
    / "versions"
    / "2026_09_21_1500-b4c2e7a91f38_backfill_practising_competencies_from_.py"
)


def _membership_implies(db: Session, user: User) -> set[int]:
    """The places membership used to confer administration of.

    What `org_units_administered_by` returned before it was repointed at
    `practising_competency` rows, and therefore what migration
    `b4c2e7a91f38` has to reproduce as rows: direct organisation
    membership, plus every place beneath it at any depth.
    """
    roots = get_member_org_unit_ids(db, user.id)
    return set(roots) | descendant_ids(db, roots)


def _admin(
    db: Session,
    username: str,
    *,
    profession: str = "system_administrator",
    platform_role: str = "standard",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
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


def _below(db: Session, parent: OrgUnit, name: str, kind: str) -> OrgUnit:
    unit = OrgUnit(name=name, type=kind, parent_id=parent.id)
    db.add(unit)
    db.commit()
    return unit


class TestTheProfessionsTheMigrationNames:
    """The literals in the migration, checked against the catalogue.

    A migration must not import application code, so the four professions
    granting `manage_users` are frozen in it as literals. That is correct
    and it is also a copy, so it can drift. This is the test that notices.
    """

    def test_the_migration_names_every_profession_granting_manage_users(
        self,
    ) -> None:
        listed = set(
            re.findall(r'^\s+"([a-z_]+)",$', MIGRATION.read_text(), re.M)
        )

        from app.cbac.base_professions import PROFESSION_IDS

        granting = {
            profession
            for profession in PROFESSION_IDS
            if "manage_users" in get_profession_base_competencies(profession)
        }

        assert granting, "no profession grants manage_users any more"
        assert granting <= listed, (
            "shared/base-professions.yaml grants manage_users to a "
            f"profession the backfill does not name: {granting - listed}. "
            "A new administrator profession needs authorising by hand, or "
            "the migration is incomplete."
        )

    def test_the_migration_names_every_root_type(self) -> None:
        """The other list of literals the migration carries.

        Membership only confers administration at an organisation, and
        what makes a place one is its type. A new root type that the
        backfill does not name would leave its members with no rows.
        """
        from app.org_units.types import ORG_UNIT_TYPE_IDS, type_requires_parent

        text = MIGRATION.read_text()
        roots = {
            type_id
            for type_id in ORG_UNIT_TYPE_IDS
            if not type_requires_parent(type_id)
        }

        assert roots, "no type can start a tree any more"
        missing = {r for r in roots if f'"{r}"' not in text}
        assert not missing, (
            "shared/org-unit-types.yaml has a root type the backfill does "
            f"not name: {missing}. Members of that kind of organisation "
            "would be left without rows."
        )


class TestWhatTheBackfillMustReproduce:
    """The set of rows, expressed against the helper the routes use."""

    def test_an_organisation_member_administers_it(
        self, db_session: Session
    ) -> None:
        admin = _admin(db_session, "org-admin")
        org = _org(db_session, "Trust")
        add_org_unit_member(db_session, org.id, admin.id, "staff")
        db_session.commit()

        assert _membership_implies(db_session, admin) == {org.id}

    def test_everything_beneath_comes_too(self, db_session: Session) -> None:
        """At any depth, which is why the migration recurses."""
        admin = _admin(db_session, "deep-admin")
        org = _org(db_session, "Trust")
        ward = _below(db_session, org, "Ward A", "ward")
        room = _below(db_session, ward, "Room 4", "room")
        add_org_unit_member(db_session, org.id, admin.id, "staff")
        db_session.commit()

        assert _membership_implies(db_session, admin) == {
            org.id,
            ward.id,
            room.id,
        }

    def test_a_ward_membership_administers_nothing(
        self, db_session: Session
    ) -> None:
        """Only membership of an organisation confers administration.

        Not the ward either. A membership of a ward is a fact about the
        ward, and reach runs downward only, so it reaches neither the
        trust above nor the ward itself. The backfill therefore joins
        membership to an organisation-typed place, and would write rows
        for somebody who should have none if it did not.
        """
        admin = _admin(db_session, "ward-admin")
        org = _org(db_session, "Trust")
        ward = _below(db_session, org, "Ward A", "ward")
        add_org_unit_member(db_session, ward.id, admin.id, "staff")
        db_session.commit()

        assert _membership_implies(db_session, admin) == set()

    def test_a_detached_ward_is_not_an_organisation(
        self, db_session: Session
    ) -> None:
        """What makes a place an organisation is its type, not its parent.

        A ward with no parent has no parent exactly as an organisation
        does. If the backfill asked `parent_id IS NULL` instead of asking
        the type, its members would get the run of somewhere nobody is
        accountable for.
        """
        admin = _admin(db_session, "detached-admin")
        stray = OrgUnit(name="Stray Ward", type="ward")
        db_session.add(stray)
        db_session.commit()
        add_org_unit_member(db_session, stray.id, admin.id, "staff")
        db_session.commit()

        assert _membership_implies(db_session, admin) == set()

    def test_another_organisation_is_not_included(
        self, db_session: Session
    ) -> None:
        admin = _admin(db_session, "one-org-admin")
        mine = _org(db_session, "My Trust")
        _org(db_session, "Their Trust")
        add_org_unit_member(db_session, mine.id, admin.id, "staff")
        db_session.commit()

        assert _membership_implies(db_session, admin) == {mine.id}

    def test_an_administrator_with_no_membership_administers_nothing(
        self, db_session: Session
    ) -> None:
        """Holding the competency is not reaching anywhere with it."""
        admin = _admin(db_session, "homeless-admin")
        _org(db_session, "Trust")

        assert _membership_implies(db_session, admin) == set()

    def test_an_operator_is_not_backfilled(self, db_session: Session) -> None:
        """Rows would add nothing to what an operator already has.

        `org_units_administered_by` returns None for an operator, meaning
        "all of them", and a row cannot improve on that. The migration
        excludes them by name for this reason, which is what this asserts:
        membership would otherwise have implied a row, so the exclusion
        has to be deliberate rather than incidental.
        """
        operator = _admin(db_session, "operator", platform_role="superadmin")
        org = _org(db_session, "Trust")
        add_org_unit_member(db_session, org.id, operator.id, "staff")
        db_session.commit()

        # Membership alone would have implied one.
        assert _membership_implies(db_session, operator) == {org.id}
        # The helper still answers "all of them", so the row is redundant.
        assert org_units_administered_by(db_session, operator) is None


@pytest.mark.parametrize(
    "profession",
    [
        "clinic_manager",
        "system_administrator",
        "superadmin_profession",
        "teaching_manager",
    ],
)
def test_each_named_profession_still_grants_manage_users(
    profession: str,
) -> None:
    """Named individually, so a failure says which one changed."""
    assert "manage_users" in get_profession_base_competencies(profession)
