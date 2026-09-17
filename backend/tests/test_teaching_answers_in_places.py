"""Teaching's surface learns place ids beside its organisation ids.

The expand step for the API itself. Teaching publishes organisation ids
— in responses, and in paths shaped
``/admin/banks/{bank}/organisations/{org}/settings`` — and the screens
put them straight back into URLs. Changing what that number means while
keeping its name is the silent break this plan refuses everywhere else,
so a place-shaped answer arrives beside the older one and the screens
move across before it goes.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.models import QuestionBankConfig
from app.models import Organisation, OrgUnitFeature, User
from app.organisations import add_organisation_member
from app.security import hash_password


@pytest.fixture
def org(db_session: Session) -> Organisation:
    organisation = Organisation(name="Teaching Trust", type="hospital_team")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    db_session.add(
        OrgUnitFeature(
            org_unit_id=organisation.org_unit_id, feature_key="teaching"
        )
    )
    db_session.commit()
    return organisation


@pytest.fixture
def educator(db_session: Session, org: Organisation) -> User:
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
    add_organisation_member(db_session, org.id, user.id, "staff")
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


def _seed_bank(db: Session, org: Organisation, educator: User) -> None:
    db.add(
        QuestionBankConfig(
            org_unit_id=org.org_unit_id,
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
    def test_it_carries_both_ids(
        self,
        test_client: TestClient,
        org: Organisation,
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
        assert body["organisation_id"] == org.id
        assert body["org_unit_id"] == org.org_unit_id


class TestThePlaceKeyedPaths:
    def test_settings_can_be_set_by_place(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        educator: User,
    ) -> None:
        _seed_bank(db_session, org, educator)
        headers = _login(test_client)

        resp = test_client.put(
            f"/api/teaching/admin/banks/test-bank"
            f"/places/{org.org_unit_id}/settings",
            json={"is_live": True, "site_registration": False},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["is_live"] is True

    def test_the_older_path_still_works(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        educator: User,
    ) -> None:
        """A tab left open across the deploy keeps working."""
        _seed_bank(db_session, org, educator)
        headers = _login(test_client)

        resp = test_client.put(
            f"/api/teaching/admin/banks/test-bank"
            f"/organisations/{org.id}/settings",
            json={"is_live": True, "site_registration": False},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text

    def test_a_place_that_is_not_an_organisation_is_not_found(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        educator: User,
    ) -> None:
        """The spacer ward in the fixtures is exactly such a place."""
        _seed_bank(db_session, org, educator)
        headers = _login(test_client)

        resp = test_client.put(
            "/api/teaching/admin/banks/test-bank/places/1/settings",
            json={"is_live": True, "site_registration": False},
            headers=headers,
        )

        assert resp.status_code == 404
