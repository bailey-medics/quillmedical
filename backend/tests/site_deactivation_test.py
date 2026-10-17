"""Deactivating a site, through its routes.

A teaching admin deactivates a site of their organisation. Its people
who belong nowhere else are deactivated with it and emailed, and the
site takes nobody new: not through its own page, not through the user
form, and not at registration. See ``app.org_units.deactivation`` for
who counts as belonging somewhere else.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from app.users import closure_notice
from app.users.closure_notice import ClosureNotice

PASSWORD = "Coordinator123!"


def _user(db: Session, username: str, profession: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.commit()

    return user


def _unit(
    db: Session, name: str, unit_type: str, parent: OrgUnit | None = None
) -> OrgUnit:
    unit = OrgUnit(
        name=name,
        type=unit_type,
        parent_id=parent.id if parent is not None else None,
    )
    db.add(unit)
    db.commit()

    return unit


def _is_active(
    db: Session, model: type[User] | type[OrgUnit], row_id: int
) -> bool:
    """Whether the account or org_unit is in use, read afresh."""
    row = db.get(model, row_id)
    assert isinstance(row, (User, OrgUnit))

    return row.is_active


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _unit(db_session, "Teaching Trust", "organisation")


@pytest.fixture
def site(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _unit(db_session, "Ward 9", "ward", trust)


@pytest.fixture
def other_site(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _unit(db_session, "Ward 10", "ward", trust)


@pytest.fixture
def coordinator(db_session: Session, trust: OrgUnit, site: OrgUnit) -> User:
    """A teaching admin, staff at the trust and a member of the site."""
    user = _user(db_session, "coordinator", "teaching_admin")
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    add_org_unit_member(db_session, site.id, user.id, "staff")
    db_session.commit()

    return user


@pytest.fixture
def client(test_client: TestClient, coordinator: User) -> TestClient:
    response = test_client.post(
        "/api/auth/login",
        json={"username": coordinator.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    test_client.headers["X-CSRF-Token"] = test_client.cookies["XSRF-TOKEN"]

    return test_client


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Who each closure email went to, in place of sending it."""
    addresses: list[str] = []

    def record(notice: ClosureNotice) -> None:
        addresses.append(notice.to)

    monkeypatch.setattr(closure_notice, "send_closure_notice", record)
    monkeypatch.setattr("app.org_units.router.send_closure_notice", record)

    return addresses


def _delegate_registered_at(
    db: Session, name: str, trust: OrgUnit, site: OrgUnit
) -> User:
    """A delegate as registering leaves them: a trainee at both."""
    user = _user(db, name, "teaching_delegate")
    add_org_unit_member(db, trust.id, user.id, "trainee")
    add_org_unit_member(db, site.id, user.id, "trainee")
    db.commit()

    return user


class TestWhoIsDeactivated:
    def test_a_delegate_belonging_nowhere_else_is_deactivated_and_emailed(
        self,
        client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        site: OrgUnit,
        sent: list[str],
    ) -> None:
        delegate = _delegate_registered_at(db_session, "dee", trust, site)

        response = client.post(f"/api/org-units/{site.id}/deactivate")

        assert response.status_code == 200, response.text
        assert response.json() == {"accounts": 1}
        db_session.expire_all()
        assert _is_active(db_session, User, delegate.id) is False
        assert _is_active(db_session, OrgUnit, site.id) is False
        assert sent == ["dee@example.test"]

    def test_a_delegate_also_at_another_site_is_spared(
        self,
        client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        site: OrgUnit,
        other_site: OrgUnit,
        sent: list[str],
    ) -> None:
        delegate = _delegate_registered_at(db_session, "dee", trust, site)
        add_org_unit_member(db_session, other_site.id, delegate.id, "trainee")
        db_session.commit()

        response = client.post(f"/api/org-units/{site.id}/deactivate")

        assert response.json() == {"accounts": 0}
        db_session.expire_all()
        assert _is_active(db_session, User, delegate.id) is True
        assert sent == []

    def test_somebody_on_the_organisations_staff_list_is_spared(
        self,
        client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        site: OrgUnit,
        coordinator: User,
    ) -> None:
        """The teaching admin is a member of the site too, and stays."""
        delegate = _user(db_session, "dee", "teaching_delegate")
        add_org_unit_member(db_session, trust.id, delegate.id, "staff")
        add_org_unit_member(db_session, site.id, delegate.id, "trainee")
        db_session.commit()

        response = client.post(f"/api/org-units/{site.id}/deactivate")

        assert response.json() == {"accounts": 0}
        db_session.expire_all()
        assert _is_active(db_session, User, delegate.id) is True
        assert _is_active(db_session, User, coordinator.id) is True

    def test_a_membership_of_another_deactivated_site_does_not_count(
        self,
        client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        site: OrgUnit,
        other_site: OrgUnit,
    ) -> None:
        delegate = _delegate_registered_at(db_session, "dee", trust, site)
        add_org_unit_member(db_session, other_site.id, delegate.id, "trainee")
        other_site.is_active = False
        db_session.commit()

        response = client.post(f"/api/org-units/{site.id}/deactivate")

        assert response.json() == {"accounts": 1}

    def test_the_preview_counts_what_deactivating_does(
        self,
        client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        site: OrgUnit,
        other_site: OrgUnit,
    ) -> None:
        _delegate_registered_at(db_session, "dee", trust, site)
        _delegate_registered_at(db_session, "dan", trust, site)
        spared = _delegate_registered_at(db_session, "sam", trust, site)
        add_org_unit_member(db_session, other_site.id, spared.id, "trainee")
        db_session.commit()

        preview = client.get(f"/api/org-units/{site.id}/deactivation")

        assert preview.status_code == 200
        assert preview.json() == {"accounts": 2}
        db_session.expire_all()
        assert _is_active(db_session, OrgUnit, site.id) is True


class TestWhatIsRefused:
    def test_a_teaching_admin_cannot_deactivate_their_organisation(
        self, client: TestClient, trust: OrgUnit
    ) -> None:
        response = client.post(f"/api/org-units/{trust.id}/deactivate")

        assert response.status_code == 403

    def test_a_site_already_deactivated_is_refused(
        self, client: TestClient, db_session: Session, site: OrgUnit
    ) -> None:
        site.is_active = False
        db_session.commit()

        response = client.post(f"/api/org-units/{site.id}/deactivate")

        assert response.status_code == 409
        assert response.json() == {
            "detail": "This site is already deactivated."
        }

    def test_a_site_of_another_trust_is_not_found(
        self, client: TestClient, db_session: Session
    ) -> None:
        elsewhere = _unit(db_session, "Another Trust", "organisation")
        theirs = _unit(db_session, "Their ward", "ward", elsewhere)

        response = client.post(f"/api/org-units/{theirs.id}/deactivate")

        assert response.status_code == 404
        db_session.expire_all()
        assert _is_active(db_session, OrgUnit, theirs.id) is True

    def test_switching_a_site_off_without_deactivating_is_refused(
        self, client: TestClient, db_session: Session, site: OrgUnit
    ) -> None:
        response = client.patch(
            f"/api/org-units/{site.id}/active", json={"is_active": False}
        )

        assert response.status_code == 409
        db_session.expire_all()
        assert _is_active(db_session, OrgUnit, site.id) is True


class TestADeactivatedSite:
    @pytest.fixture
    def deactivated(
        self, client: TestClient, db_session: Session, site: OrgUnit
    ) -> OrgUnit:
        response = client.post(f"/api/org-units/{site.id}/deactivate")
        assert response.status_code == 200, response.text
        db_session.expire_all()

        return site

    def test_nobody_can_be_added_through_its_page(
        self, client: TestClient, db_session: Session, deactivated: OrgUnit
    ) -> None:
        newcomer = _user(db_session, "newcomer", "teaching_delegate")

        response = client.post(
            f"/api/org-units/{deactivated.id}/members",
            json={"user_id": newcomer.id, "capacity": "trainee"},
        )

        assert response.status_code == 409
        assert "deactivated" in response.json()["detail"]

    def test_nobody_can_be_made_there_through_the_user_form(
        self, client: TestClient, deactivated: OrgUnit
    ) -> None:
        response = client.post(
            "/api/users",
            json={
                "name": "New Starter",
                "username": "starter",
                "email": "starter@example.test",
                "password": "Password123!",
                "base_profession": "teaching_delegate",
                "org_unit_ids": [deactivated.id],
            },
        )

        assert response.status_code == 409
        assert "deactivated" in response.json()["detail"]

    def test_making_it_active_again_brings_no_account_back(
        self,
        client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        site: OrgUnit,
    ) -> None:
        delegate = _delegate_registered_at(db_session, "dee", trust, site)
        client.post(f"/api/org-units/{site.id}/deactivate")

        response = client.patch(
            f"/api/org-units/{site.id}/active", json={"is_active": True}
        )

        assert response.status_code == 200
        db_session.expire_all()
        assert _is_active(db_session, OrgUnit, site.id) is True
        assert _is_active(db_session, User, delegate.id) is False
