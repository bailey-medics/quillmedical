"""Tests for how a delegate's site and clinical lead are resolved.

``list_delegates`` had no test, and it reads the site membership table
twice: once for the capacity that marks someone a delegate at a site, and
once to name that site's clinical lead. Both were about to change - the
first by the ``site_member``/``capacity`` rename, the second by moving the
lead onto the post - so this describes the behaviour first.

It also pins a bug worth not reintroducing: the lead used to be matched by
``Site.name``, so two sites sharing a name in different organisations
cross-matched.
"""

from __future__ import annotations

from sqlalchemy import insert, update
from sqlalchemy.orm import Session

from app.cbac.positions import set_clinical_lead
from app.models import (
    OrgUnit,
    OrgUnitFeature,
    User,
    org_unit_member,
)
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import hold


def _user(
    db: Session, username: str, *, profession: str = "teaching_admin"
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.commit()
    return user


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()
    db.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db.commit()
    return org


def _site_of(db: Session, org: OrgUnit, name: str) -> OrgUnit:
    site = OrgUnit(name=name, type="ward")
    db.add(site)
    db.commit()
    db.execute(
        update(OrgUnit).where(OrgUnit.id == site.id).values(parent_id=org.id)
    )
    db.commit()
    return site


def _member(db: Session, site: OrgUnit, user: User, capacity: str) -> None:
    db.execute(
        insert(org_unit_member).values(
            org_unit_id=site.id,
            user_id=user.id,
            capacity=capacity,
        )
    )
    db.commit()


def _in_org(db: Session, org: OrgUnit, user: User) -> None:
    """Put the caller in the organisation, with the gate the route needs."""
    add_org_unit_member(db, org.id, user.id, "trainee")
    hold(user, "manage_teaching")
    db.commit()


def _delegates(client) -> list[dict[str, object]]:
    resp = client.get("/api/teaching/admin/delegates")
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestTheDelegatesSite:
    """Which site a delegate belongs to comes from their membership."""

    def test_a_delegate_is_placed_at_their_site(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        org = _org(db_session, "Trust")
        _in_org(db_session, org, test_superadmin)
        site = _site_of(db_session, org, "Ward 1")
        delegate = _user(
            db_session, "delegate", profession="teaching_delegate"
        )
        _member(db_session, site, delegate, "trainee")

        found = {
            d["name"]: d["site_name"]
            for d in _delegates(authenticated_superadmin_client)
        }
        assert found.get("delegate") == "Ward 1"

    def test_a_member_in_another_capacity_is_placed_at_their_site(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """Staff who sit a module are at a site too.

        Only the trainee capacity used to place somebody, so an admin or
        a nurse who sat an assessment was listed with no site and no
        clinical lead.
        """
        org = _org(db_session, "Trust")
        _in_org(db_session, org, test_superadmin)
        site = _site_of(db_session, org, "Ward 1")
        nurse = _user(db_session, "nurse", profession="registered_nurse")
        _member(db_session, site, nurse, "staff")

        found = {
            d["name"]: d["site_name"]
            for d in _delegates(authenticated_superadmin_client)
        }
        assert found.get("nurse") == "Ward 1"

    def test_the_site_they_train_at_wins_over_one_they_staff(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        org = _org(db_session, "Trust")
        _in_org(db_session, org, test_superadmin)
        staffed = _site_of(db_session, org, "Ward 1")
        trained = _site_of(db_session, org, "Ward 2")
        delegate = _user(
            db_session, "delegate", profession="teaching_delegate"
        )
        _member(db_session, staffed, delegate, "staff")
        _member(db_session, trained, delegate, "trainee")

        found = {
            d["name"]: d["site_name"]
            for d in _delegates(authenticated_superadmin_client)
        }
        assert found.get("delegate") == "Ward 2"

    def test_a_member_of_the_organisation_alone_has_no_site(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """An organisation is not a site."""
        org = _org(db_session, "Trust")
        _in_org(db_session, org, test_superadmin)
        manager = _user(db_session, "manager")
        add_org_unit_member(db_session, org.id, manager.id, "staff")
        db_session.commit()

        found = {
            d["name"]: d["site_name"]
            for d in _delegates(authenticated_superadmin_client)
        }
        assert "manager" in found
        assert found["manager"] is None


class TestTheClinicalLeadShown:
    """The lead named against a delegate is the holder of that site's post."""

    def test_the_lead_of_the_delegates_site_is_named(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        org = _org(db_session, "Trust")
        _in_org(db_session, org, test_superadmin)
        site = _site_of(db_session, org, "Ward 1")
        delegate = _user(
            db_session, "delegate", profession="teaching_delegate"
        )
        _member(db_session, site, delegate, "trainee")

        lead = _user(db_session, "dr_lead", profession="consultant")
        lead.full_name = "Dr Ada Lead"
        db_session.commit()
        set_clinical_lead(db_session, site, lead)
        db_session.commit()

        found = {
            d["name"]: d["clinical_lead"]
            for d in _delegates(authenticated_superadmin_client)
        }
        assert found.get("delegate") == "Dr Ada Lead"

    def test_a_vacant_post_names_nobody(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """A site with no lead must show none, not the wrong person."""
        org = _org(db_session, "Trust")
        _in_org(db_session, org, test_superadmin)
        site = _site_of(db_session, org, "Ward 1")
        delegate = _user(
            db_session, "delegate", profession="teaching_delegate"
        )
        _member(db_session, site, delegate, "trainee")

        found = {
            d["name"]: d["clinical_lead"]
            for d in _delegates(authenticated_superadmin_client)
        }
        assert found.get("delegate") is None

    def test_a_same_named_site_elsewhere_is_not_borrowed_from(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """The bug this pins: the lead used to be matched by site name.

        Two organisations may each have a "Ward 1". Naming the other
        organisation's lead against this delegate would be wrong, and is
        exactly what matching on name produced.
        """
        org = _org(db_session, "Trust")
        _in_org(db_session, org, test_superadmin)
        site = _site_of(db_session, org, "Ward 1")
        delegate = _user(
            db_session, "delegate", profession="teaching_delegate"
        )
        _member(db_session, site, delegate, "trainee")

        elsewhere = _org(db_session, "Other Trust")
        their_ward = _site_of(db_session, elsewhere, "Ward 1")
        their_lead = _user(db_session, "dr_other", profession="consultant")
        their_lead.full_name = "Dr Someone Else"
        db_session.commit()
        set_clinical_lead(db_session, their_ward, their_lead)
        db_session.commit()

        found = {
            d["name"]: d["clinical_lead"]
            for d in _delegates(authenticated_superadmin_client)
        }
        assert found.get("delegate") is None
