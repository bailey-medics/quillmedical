"""A feature switched on at a site reaches that site's members only.

Before 1 October 2026 only the top of a tree could carry features, so the
passport could not be switched on for Cheltenham oncology without the
whole of Gloucestershire Hospitals. A site may now carry them. A feature
on at the organisation still reaches every site beneath it. See
``docs/docs/plans/2026-09-30-passport-professions-plan.md``.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, OrgUnitFeature, User
from app.org_units.types import ORG_UNIT_TYPE_IDS, ROOT_TYPE_IDS
from app.organisations import add_org_unit_member, feature_holder_ids_of
from app.security import hash_password

PASSWORD = "SiteFeature123!"

#: Every type that sits under an organisation, read from the YAML so a
#: type added there is covered here without being named.
CHILD_TYPE_IDS = set(ORG_UNIT_TYPE_IDS) - set(ROOT_TYPE_IDS)

#: A passport route a consultant reaches once the feature is on. It also
#: asks for ``assess_clinician_passport``, which a consultant holds.
INBOX = "/api/passport/requests/inbox"


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Gloucestershire Hospitals", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


def _site(db: Session, trust: OrgUnit, name: str) -> OrgUnit:
    site = OrgUnit(name=name, type="site", parent_id=trust.id)
    db.add(site)
    db.commit()
    db.refresh(site)

    return site


@pytest.fixture
def oncology(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _site(db_session, trust, "Cheltenham oncology")


@pytest.fixture
def cardiology(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _site(db_session, trust, "Gloucester cardiology")


def _member(db: Session, username: str, unit: OrgUnit) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.flush()
    add_org_unit_member(db, unit.id, user.id, "staff")
    db.commit()
    db.refresh(user)

    return user


def _switch_on(db: Session, unit: OrgUnit, key: str = "passport") -> None:
    db.add(OrgUnitFeature(org_unit_id=unit.id, feature_key=key))
    db.commit()


def _signed_in(client: TestClient, user: User) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200

    return client


class TestTheGate:
    def test_a_site_feature_reaches_its_own_members(
        self,
        test_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
    ) -> None:
        doctor = _member(db_session, "oncologist", oncology)
        _switch_on(db_session, oncology)

        client = _signed_in(test_client, doctor)

        assert client.get(INBOX).status_code == 200
        features = client.get("/api/auth/me").json()["enabled_features"]
        assert "passport" in features

    def test_a_site_feature_does_not_reach_another_site(
        self,
        test_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
        cardiology: OrgUnit,
    ) -> None:
        cardiologist = _member(db_session, "cardiologist", cardiology)
        _switch_on(db_session, oncology)

        client = _signed_in(test_client, cardiologist)

        assert client.get(INBOX).status_code == 403
        features = client.get("/api/auth/me").json()["enabled_features"]
        assert "passport" not in features

    def test_a_site_feature_does_not_reach_the_trust(
        self,
        test_client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        oncology: OrgUnit,
    ) -> None:
        manager = _member(db_session, "trust_staff", trust)
        _switch_on(db_session, oncology)

        client = _signed_in(test_client, manager)

        assert client.get(INBOX).status_code == 403

    def test_a_trust_feature_still_reaches_every_site(
        self,
        test_client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        cardiology: OrgUnit,
    ) -> None:
        cardiologist = _member(db_session, "cardiologist", cardiology)
        _switch_on(db_session, trust)

        client = _signed_in(test_client, cardiologist)

        assert client.get(INBOX).status_code == 200


class TestFeatureHolders:
    def test_a_site_and_the_organisation_above_it(
        self, db_session: Session, trust: OrgUnit, oncology: OrgUnit
    ) -> None:
        assert feature_holder_ids_of(db_session, [oncology.id]) == {
            oncology.id,
            trust.id,
        }

    def test_nothing_for_no_memberships(self, db_session: Session) -> None:
        assert feature_holder_ids_of(db_session, []) == set()


class TestSwitchingItOn:
    def test_a_site_accepts_a_feature(
        self,
        oncology: OrgUnit,
        authenticated_superadmin_client: TestClient,
    ) -> None:
        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{oncology.id}/features/passport",
            json={"enabled": True},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "enabled"

    @pytest.mark.parametrize("type_id", sorted(CHILD_TYPE_IDS))
    def test_an_org_unit_of_any_type_accepts_one(
        self,
        type_id: str,
        db_session: Session,
        trust: OrgUnit,
        authenticated_superadmin_client: TestClient,
    ) -> None:
        """Type does not decide it: the site screens offer every one of
        these as a kind of site, and a feature may go on at any of them.
        """
        place = OrgUnit(name="Oncology", type=type_id, parent_id=trust.id)
        db_session.add(place)
        db_session.commit()

        resp = authenticated_superadmin_client.put(
            f"/api/org-units/{place.id}/features/passport",
            json={"enabled": True},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "enabled"
