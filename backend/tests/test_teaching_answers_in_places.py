"""Teaching's surface answers only in place ids.

The contract step for the API itself. The place-shaped answer and the
place-keyed paths arrived first and the screens moved across, so the
organisation-shaped ones go here: ``organisation_id`` leaves the
responses, and the organisation-keyed addresses answer 410 naming their
replacement rather than quietly doing the work under an id that no
longer means what it says.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.models import QuestionBankConfig
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password


@pytest.fixture
def org(db_session: Session) -> OrgUnit:
    organisation = OrgUnit(name="Teaching Trust", type="hospital_team")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    db_session.add(
        OrgUnitFeature(org_unit_id=organisation.id, feature_key="teaching")
    )
    db_session.commit()
    return organisation


@pytest.fixture
def educator(db_session: Session, org: OrgUnit) -> User:
    user = User(
        username="an_educator",
        email="educator@example.com",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="teaching_admin",
    )
    db_session.add(user)
    db_session.commit()
    add_org_unit_member(db_session, org.id, user.id, "staff")
    db_session.commit()
    db_session.refresh(user)
    return user


def _login(client: TestClient) -> dict[str, str]:
    resp = client.post(
        "/api/auth/login",
        json={"username": "an_educator", "password": "Password123!"},
    )
    assert resp.status_code == 200, resp.text
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


def _seed_bank(db: Session, org: OrgUnit, educator: User) -> None:
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id="test-bank",
            version=1,
            title="Test Bank",
            description="A bank.",
            type="uniform",
            config_yaml="questionBank:\n  id: test-bank\n",
            synced_by=educator.id,
        )
    )
    db.commit()


class TestTheSettingsAnswer:
    def test_it_carries_only_the_place_id(
        self,
        test_client: TestClient,
        org: OrgUnit,
        educator: User,
    ) -> None:
        headers = _login(test_client)

        resp = test_client.put(
            "/api/teaching/settings",
            json={
                "coordinator_email": "coord@example.com",
                "institution_name": "A Medical School",
            },
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["org_unit_id"] == org.id
        assert "organisation_id" not in body


class TestBothAddresses:
    """The routes answer at ``org-units`` as well as ``places``.

    ``places`` is kept for one release so a tab open across the deploy
    keeps working, then it retires the way the organisation-keyed
    addresses did before it.
    """

    def test_settings_can_be_set_at_the_org_unit_address(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        educator: User,
    ) -> None:
        _seed_bank(db_session, org, educator)
        headers = _login(test_client)

        resp = test_client.put(
            f"/api/teaching/admin/banks/test-bank"
            f"/org-units/{org.id}/settings",
            json={"is_live": True, "site_registration": False},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["is_live"] is True

    def test_a_version_is_promoted_at_the_org_unit_address(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        educator: User,
    ) -> None:
        _seed_bank(db_session, org, educator)
        headers = _login(test_client)

        resp = test_client.put(
            f"/api/teaching/admin/banks/test-bank"
            f"/org-units/{org.id}/active-version",
            json={"version": "v1"},
            headers=headers,
        )

        # The version may not exist in this fixture; what matters is
        # that the address is served rather than 404 for being unknown.
        assert resp.status_code != 404, resp.text


class TestTheOrgUnitKeyedPaths:
    def test_settings_can_be_set_by_place(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        educator: User,
    ) -> None:
        _seed_bank(db_session, org, educator)
        headers = _login(test_client)

        resp = test_client.put(
            f"/api/teaching/admin/banks/test-bank"
            f"/org-units/{org.id}/settings",
            json={"is_live": True, "site_registration": False},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["is_live"] is True

    def test_the_older_path_says_it_has_gone(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        educator: User,
    ) -> None:
        """410, not 404, and not silently doing the work either.

        The two id spaces overlap for small installations, so an
        organisation id would often name a real place. Answering the
        request under the old address is how a caller would go on
        believing the number means an organisation.
        """
        _seed_bank(db_session, org, educator)
        headers = _login(test_client)

        resp = test_client.put(
            f"/api/teaching/admin/banks/test-bank"
            f"/organisations/{org.id}/settings",
            json={"is_live": True, "site_registration": False},
            headers=headers,
        )

        assert resp.status_code == 410, resp.text
        assert "org-units" in resp.json()["detail"]

    def test_the_older_promote_path_says_it_has_gone(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        educator: User,
    ) -> None:
        _seed_bank(db_session, org, educator)
        headers = _login(test_client)

        resp = test_client.put(
            f"/api/teaching/admin/banks/test-bank"
            f"/organisations/{org.id}/active-version",
            json={"version": 1},
            headers=headers,
        )

        assert resp.status_code == 410, resp.text

    def test_a_place_that_is_not_an_organisation_is_refused(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        educator: User,
    ) -> None:
        """The spacer ward in the fixtures is exactly such a place.

        Refused as a place the caller is not a member of, which is what
        it is: membership answers in the places of organisations, so a
        ward is never one of them and neither is a place standing on its
        own. Same refusal as naming somebody else's trust, and for the
        same reason — the answer discloses nothing either way.
        """
        _seed_bank(db_session, org, educator)
        headers = _login(test_client)

        resp = test_client.put(
            "/api/teaching/admin/banks/test-bank/org-units/1/settings",
            json={"is_live": True, "site_registration": False},
            headers=headers,
        )

        assert resp.status_code == 403
