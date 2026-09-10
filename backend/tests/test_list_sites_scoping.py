"""`GET /api/sites` lists the caller's sites, not the whole estate.

The route checked that the caller was an admin and then returned every
site in the deployment. Unlike the by-id holes, this one needed no id at
all: an admin at one trust could read the ward and department structure of
every other trust by calling the endpoint.

Filtered the way `list_organisations` is filtered — superadmins see
everything, admins see the sites of organisations they belong to.

**This is a visible behaviour change.** Anyone who relied on seeing the
whole estate will read it as a regression, which is why the tests below
say plainly what each caller should now see.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    Site,
    User,
    organisation_member,
    organisation_site,
)


def _org(db: Session, name: str) -> Organisation:
    org = Organisation(name=name, type="hospital")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _site(db: Session, name: str, org: Organisation | None = None) -> Site:
    site = Site(name=name, type="ward")
    db.add(site)
    db.commit()
    if org is not None:
        db.execute(
            insert(organisation_site).values(
                organisation_id=org.id, site_id=site.id
            )
        )
        db.commit()
    db.refresh(site)
    return site


def _join(db: Session, org: Organisation, user: User) -> None:
    db.execute(
        insert(organisation_member).values(
            organisation_id=org.id, user_id=user.id, capacity="staff"
        )
    )
    db.commit()


@pytest.fixture
def two_trusts(db_session: Session, test_admin: User) -> dict[str, object]:
    """The admin belongs to one trust; a second trust has its own ward."""
    own = _org(db_session, "Own Trust")
    other = _org(db_session, "Other Trust")
    _join(db_session, own, test_admin)

    return {
        "own": own,
        "other": other,
        "own_site": _site(db_session, "Own Ward", own),
        "other_site": _site(db_session, "Other Ward", other),
    }


def _names(resp) -> set[str]:
    return {s["name"] for s in resp.json()["sites"]}


class TestAnAdminSeesOnlyTheirOwnSites:
    """The hole: no id was needed to read another trust's structure."""

    def test_another_trusts_site_is_not_listed(
        self,
        authenticated_admin_client: TestClient,
        two_trusts: dict[str, object],
    ):
        resp = authenticated_admin_client.get("/api/sites")

        assert resp.status_code == 200
        assert "Other Ward" not in _names(resp)

    def test_their_own_site_is_listed(
        self,
        authenticated_admin_client: TestClient,
        two_trusts: dict[str, object],
    ):
        """A filter that returned nothing would pass the test above."""
        resp = authenticated_admin_client.get("/api/sites")

        assert resp.status_code == 200
        assert "Own Ward" in _names(resp)


class TestSuperadminsSeeTheEstate:
    """Reach from the rank, not from where they happen to be."""

    def test_a_superadmin_sees_every_trusts_sites(
        self,
        authenticated_superadmin_client: TestClient,
        two_trusts: dict[str, object],
    ):
        resp = authenticated_superadmin_client.get("/api/sites")

        assert resp.status_code == 200
        assert {"Own Ward", "Other Ward"} <= _names(resp)


class TestAnAdminWithNowhereToStandSeesNothing:
    """An empty organisation list must not invert into "everything"."""

    def test_an_admin_in_no_organisation_sees_no_sites(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
    ):
        """`IN ()` is the classic way a filter turns into its opposite.

        The admin here joins no organisation, so the filter is built from
        an empty list. The answer must be nothing, not everything.
        """
        _site(db_session, "Unreachable Ward", _org(db_session, "Some Trust"))

        resp = authenticated_admin_client.get("/api/sites")

        assert resp.status_code == 200
        assert resp.json()["sites"] == []


class TestAnUnlinkedSiteIsNotShared:
    """A site belonging to no organisation is an anomaly, not a commons."""

    def test_a_site_with_no_organisation_is_not_listed(
        self,
        authenticated_admin_client: TestClient,
        two_trusts: dict[str, object],
        db_session: Session,
    ):
        _site(db_session, "Orphan Ward")

        resp = authenticated_admin_client.get("/api/sites")

        assert resp.status_code == 200
        assert "Orphan Ward" not in _names(resp)


class TestTheRouteStillRefusesNonAdmins:
    """The existing gate is unchanged; the filter sits behind it."""

    def test_a_non_admin_is_refused(self, authenticated_client: TestClient):
        resp = authenticated_client.get("/api/sites")

        assert resp.status_code == 403
