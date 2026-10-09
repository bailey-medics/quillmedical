"""Tests for which org_units a bank's organisation list offers.

A bank is set live for an organisation, and reaches its sites from there:
the settings route refuses anything that is not an organisation the caller
belongs to. The list used to offer every org_unit with teaching switched
on, a site included, so a site with the feature gave a row whose settings
page could only answer "You cannot change settings for that organisation".
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from tests.competencies import hold

BANK = "colonoscopy"


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
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


def _teaching_on(db: Session, org_unit: OrgUnit) -> None:
    db.add(
        OrgUnitFeature(
            org_unit_id=org_unit.id, feature_key="teaching", enabled_by=1
        )
    )
    db.commit()


def _names(client: TestClient) -> list[str]:
    resp = client.get(f"/api/teaching/admin/banks/{BANK}/organisations")
    assert resp.status_code == 200, resp.text

    return [row["organisation_name"] for row in resp.json()]


def test_a_site_with_teaching_switched_on_is_not_listed(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    test_superadmin: User,
) -> None:
    org = _org(db_session, "Trust")
    site = _site_of(db_session, org, "Ward 1")
    _teaching_on(db_session, org)
    _teaching_on(db_session, site)
    add_org_unit_member(db_session, org.id, test_superadmin.id, "staff")
    hold(test_superadmin, "manage_teaching")
    db_session.commit()

    assert _names(authenticated_superadmin_client) == ["Trust"]


def test_an_organisation_whose_site_alone_has_teaching_is_not_listed(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    test_superadmin: User,
) -> None:
    """The feature has to be on the organisation for a bank to be set there."""
    org = _org(db_session, "Trust")
    site = _site_of(db_session, org, "Ward 1")
    _teaching_on(db_session, site)
    add_org_unit_member(db_session, org.id, test_superadmin.id, "staff")
    # At the site too, which is what lets the feature reach the caller:
    # a feature reaches down from an organisation, never up from a site.
    add_org_unit_member(db_session, site.id, test_superadmin.id, "staff")
    hold(test_superadmin, "manage_teaching")
    db_session.commit()

    assert _names(authenticated_superadmin_client) == []
