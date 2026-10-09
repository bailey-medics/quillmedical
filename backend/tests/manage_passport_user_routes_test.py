"""A passport admin manages passport accounts through ``/api/users``.

``manage_passport`` is the second scoped manager, after
``manage_teaching``. It opens the user routes alongside ``manage_users``
and limits them to its whitelist: ``assess_clinician_passport``, itself,
the four passport professions, and ``passport_write`` for members of
their own org units, which otherwise comes by entitlement. See
``docs/docs/plans/2026-09-30-passport-professions-plan.md``.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import (
    add_org_unit_member,
    get_member_org_unit_ids,
    org_units_run_by_scoped_manager,
)
from app.security import hash_password

PASSWORD = "PassportAdmin123!"


def _user(db: Session, username: str, profession: str, org: OrgUnit) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.flush()
    add_org_unit_member(db, org.id, user.id, "staff")
    db.commit()
    db.refresh(user)

    return user


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Passport Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


@pytest.fixture
def admin(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "passport_admin", "passport_admin", trust)


@pytest.fixture
def delegate(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "delegate", "passport_delegate", trust)


@pytest.fixture
def consultant(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "consultant", "consultant", trust)


@pytest.fixture
def teaching_delegate(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "learner", "teaching_delegate", trust)


@pytest.fixture
def client(test_client: TestClient, admin: User) -> TestClient:
    response = test_client.post(
        "/api/auth/login",
        json={"username": admin.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")

    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf

    return test_client


def _new_user(org: OrgUnit, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "New Delegate",
        "username": "new_delegate",
        "email": "new_delegate@example.test",
        "password": "NewDelegate123!",
        "base_profession": "passport_delegate",
        "org_unit_ids": [org.id],
    }
    body.update(overrides)

    return body


class TestWhatAPassportAdminMayDo:
    def test_create_a_delegate_at_their_trust(
        self, client: TestClient, trust: OrgUnit, db_session: Session
    ) -> None:
        resp = client.post("/api/users", json=_new_user(trust))

        assert resp.status_code == 200, resp.text
        created = db_session.get(User, resp.json()["id"])
        assert created is not None
        assert created.base_profession == "passport_delegate"
        assert "assess_clinician_passport" in (
            created.get_final_competencies()
        )
        assert get_member_org_unit_ids(db_session, created.id) == [trust.id]

    @pytest.mark.parametrize(
        "profession",
        [
            "passport_clinical_lead",
            "passport_admin",
            "passport_external_assessor",
        ],
    )
    def test_create_each_passport_profession(
        self, client: TestClient, trust: OrgUnit, profession: str
    ) -> None:
        resp = client.post(
            "/api/users",
            json=_new_user(trust, base_profession=profession),
        )
        assert resp.status_code == 200, resp.text

    def test_give_a_clinician_the_passport_sign_off(
        self, client: TestClient, consultant: User, db_session: Session
    ) -> None:
        """Granting within the whitelist works on any account.

        The consultant already holds it through their profession, so the
        save is a no-op change to the competency and must still pass.
        """
        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"additional_competencies": ["assess_clinician_passport"]},
        )
        assert resp.status_code == 200, resp.text

    def test_move_a_delegate_to_clinical_lead(
        self, client: TestClient, delegate: User, db_session: Session
    ) -> None:
        resp = client.patch(
            f"/api/users/{delegate.id}",
            json={"base_profession": "passport_clinical_lead"},
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(delegate)
        assert delegate.base_profession == "passport_clinical_lead"

    def test_deactivate_a_delegate(
        self, client: TestClient, delegate: User
    ) -> None:
        resp = client.post(f"/api/users/{delegate.id}/deactivate")
        assert resp.status_code == 200, resp.text


class TestAPassportAdminOfOneSite:
    """Belonging to a site and nowhere else: they run that site."""

    @pytest.fixture
    def site(self, db_session: Session, trust: OrgUnit) -> OrgUnit:
        site = OrgUnit(name="Oncology", type="hospital", parent_id=trust.id)
        db_session.add(site)
        db_session.commit()
        db_session.refresh(site)

        return site

    @pytest.fixture
    def site_client(
        self, test_client: TestClient, db_session: Session, site: OrgUnit
    ) -> TestClient:
        admin = _user(db_session, "site_admin", "passport_admin", site)
        response = test_client.post(
            "/api/auth/login",
            json={"username": admin.username, "password": PASSWORD},
        )
        assert response.status_code == 200
        csrf = test_client.cookies.get("XSRF-TOKEN")

        if csrf:
            test_client.headers["X-CSRF-Token"] = csrf

        return test_client

    def test_create_a_delegate_at_their_site(
        self, site_client: TestClient, site: OrgUnit, db_session: Session
    ) -> None:
        resp = site_client.post("/api/users", json=_new_user(site))

        assert resp.status_code == 200, resp.text
        assert site.id in org_units_run_by_scoped_manager(
            db_session, resp.json()["id"]
        )

    def test_not_at_the_trust_above(
        self, site_client: TestClient, site: OrgUnit, trust: OrgUnit
    ) -> None:
        resp = site_client.post("/api/users", json=_new_user(trust))

        assert resp.status_code == 404

    def test_lists_the_people_at_their_site(
        self, site_client: TestClient, site: OrgUnit, db_session: Session
    ) -> None:
        colleague = _user(db_session, "colleague", "passport_delegate", site)

        names = {
            u["username"]
            for u in site_client.get("/api/users").json()["users"]
        }

        assert colleague.username in names

    def test_does_not_list_the_people_at_the_trust_above(
        self, site_client: TestClient, delegate: User
    ) -> None:
        names = {
            u["username"]
            for u in site_client.get("/api/users").json()["users"]
        }

        assert delegate.username not in names

    def test_edits_somebody_at_their_site(
        self, site_client: TestClient, site: OrgUnit, db_session: Session
    ) -> None:
        colleague = _user(db_session, "colleague", "passport_delegate", site)

        resp = site_client.patch(
            f"/api/users/{colleague.id}",
            json={"base_profession": "passport_clinical_lead"},
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(colleague)
        assert colleague.base_profession == "passport_clinical_lead"

    def test_cannot_edit_somebody_at_the_trust_above(
        self, site_client: TestClient, delegate: User
    ) -> None:
        resp = site_client.patch(
            f"/api/users/{delegate.id}",
            json={"base_profession": "passport_clinical_lead"},
        )

        assert resp.status_code == 404


class TestLookingSomebodyUpToAddThem:
    """A site's admin cannot see beyond the site, so they ask by email."""

    @pytest.fixture
    def site(self, db_session: Session, trust: OrgUnit) -> OrgUnit:
        site = OrgUnit(name="Oncology", type="hospital", parent_id=trust.id)
        db_session.add(site)
        db_session.commit()
        db_session.refresh(site)

        return site

    @pytest.fixture
    def site_client(
        self, test_client: TestClient, db_session: Session, site: OrgUnit
    ) -> TestClient:
        admin = _user(db_session, "site_admin", "passport_admin", site)
        response = test_client.post(
            "/api/auth/login",
            json={"username": admin.username, "password": PASSWORD},
        )
        assert response.status_code == 200
        csrf = test_client.cookies.get("XSRF-TOKEN")

        if csrf:
            test_client.headers["X-CSRF-Token"] = csrf

        return test_client

    @staticmethod
    def _look_up(client: TestClient, unit: OrgUnit, term: str) -> Any:
        return client.post(
            f"/api/org-units/{unit.id}/member-lookup", json={"term": term}
        )

    def test_finds_somebody_they_cannot_otherwise_see(
        self, site_client: TestClient, site: OrgUnit, delegate: User
    ) -> None:
        resp = self._look_up(site_client, site, delegate.email)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "found"
        assert body["user"]["id"] == delegate.id
        assert body["user"]["username"] == delegate.username
        assert "email" not in body["user"]

    def test_ignores_case_and_surrounding_space(
        self, site_client: TestClient, site: OrgUnit, delegate: User
    ) -> None:
        resp = self._look_up(site_client, site, f"  {delegate.email.upper()} ")

        assert resp.json()["status"] == "found"

    def test_finds_somebody_by_their_username(
        self, site_client: TestClient, site: OrgUnit, delegate: User
    ) -> None:
        resp = self._look_up(site_client, site, delegate.username.upper())

        assert resp.json()["status"] == "found"
        assert resp.json()["user"]["id"] == delegate.id

    def test_does_not_match_part_of_a_username(
        self, site_client: TestClient, site: OrgUnit, delegate: User
    ) -> None:
        resp = self._look_up(site_client, site, delegate.username[:-1])

        assert resp.json() == {"status": "not_found", "user": None}

    def test_does_not_match_a_name(
        self, site_client: TestClient, site: OrgUnit, delegate: User
    ) -> None:
        resp = self._look_up(site_client, site, "New Delegate")

        assert resp.status_code == 422

    def test_does_not_match_part_of_an_address(
        self, site_client: TestClient, site: OrgUnit, delegate: User
    ) -> None:
        resp = self._look_up(site_client, site, "delegate@example")

        assert resp.json() == {"status": "not_found", "user": None}

    def test_says_when_nobody_has_the_address(
        self, site_client: TestClient, site: OrgUnit
    ) -> None:
        resp = self._look_up(site_client, site, "nobody@example.test")

        assert resp.json() == {"status": "not_found", "user": None}

    def test_says_when_they_are_here_already(
        self, site_client: TestClient, site: OrgUnit, db_session: Session
    ) -> None:
        colleague = _user(db_session, "colleague", "passport_delegate", site)

        resp = self._look_up(site_client, site, colleague.email)

        assert resp.json()["status"] == "already_member"

    def test_finds_a_clinician_too(
        self, site_client: TestClient, site: OrgUnit, consultant: User
    ) -> None:
        """Anybody may be added, whatever their profession."""
        resp = self._look_up(site_client, site, consultant.email)

        assert resp.json()["status"] == "found"
        assert resp.json()["user"]["id"] == consultant.id

    def test_names_nothing_about_a_deactivated_account(
        self,
        site_client: TestClient,
        site: OrgUnit,
        delegate: User,
        db_session: Session,
    ) -> None:
        delegate.is_active = False
        db_session.commit()

        resp = self._look_up(site_client, site, delegate.email)

        assert resp.json() == {"status": "not_addable", "user": None}

    def test_not_at_an_org_unit_they_do_not_run(
        self, site_client: TestClient, trust: OrgUnit, delegate: User
    ) -> None:
        resp = self._look_up(site_client, trust, delegate.email)

        assert resp.status_code == 404

    def test_refuses_half_an_address(
        self, site_client: TestClient, site: OrgUnit
    ) -> None:
        resp = self._look_up(site_client, site, "delegate@")

        assert resp.status_code == 422

    def test_what_it_finds_can_be_added(
        self,
        site_client: TestClient,
        site: OrgUnit,
        delegate: User,
        db_session: Session,
    ) -> None:
        found = self._look_up(site_client, site, delegate.email).json()

        resp = site_client.post(
            f"/api/org-units/{site.id}/members",
            json={"user_id": found["user"]["id"], "capacity": "trainee"},
        )

        assert resp.status_code == 200, resp.text
        assert site.id in org_units_run_by_scoped_manager(
            db_session, delegate.id
        )


class TestGrantingWriting:
    """A Passport admin may give and take ``passport_write`` in their units.

    Writing otherwise comes by entitlement. Before 1 October 2026 this class
    asserted the opposite: that a passport admin was refused it. The plan
    changed that deliberately, so these cases replaced the refusals.
    """

    def test_give_a_delegate_writing(
        self, client: TestClient, delegate: User, db_session: Session
    ) -> None:
        resp = client.patch(
            f"/api/users/{delegate.id}",
            json={"additional_competencies": ["passport_write"]},
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(delegate)
        assert "passport_write" in delegate.get_final_competencies()

    def test_take_a_delegates_writing_away(
        self, client: TestClient, delegate: User, db_session: Session
    ) -> None:
        client.patch(
            f"/api/users/{delegate.id}",
            json={"additional_competencies": ["passport_write"]},
        )
        resp = client.patch(
            f"/api/users/{delegate.id}",
            json={"additional_competencies": []},
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(delegate)
        assert "passport_write" not in delegate.get_final_competencies()

    def test_create_a_delegate_who_can_write(
        self, client: TestClient, trust: OrgUnit, db_session: Session
    ) -> None:
        resp = client.post(
            "/api/users",
            json=_new_user(trust, additional_competencies=["passport_write"]),
        )

        assert resp.status_code == 200, resp.text
        created = db_session.get(User, resp.json()["id"])
        assert created is not None
        assert "passport_write" in created.get_final_competencies()

    def test_not_to_somebody_at_another_trust(
        self, client: TestClient, db_session: Session
    ) -> None:
        elsewhere = OrgUnit(name="Elsewhere Trust", type="organisation")
        db_session.add(elsewhere)
        db_session.commit()
        stranger = _user(
            db_session, "stranger", "passport_delegate", elsewhere
        )

        resp = client.patch(
            f"/api/users/{stranger.id}",
            json={"additional_competencies": ["passport_write"]},
        )

        assert resp.status_code == 404
        db_session.refresh(stranger)
        assert "passport_write" not in stranger.get_final_competencies()

    def test_a_teaching_admin_cannot(
        self,
        test_client: TestClient,
        trust: OrgUnit,
        delegate: User,
        db_session: Session,
    ) -> None:
        teacher = _user(db_session, "teacher", "teaching_admin", trust)
        test_client.post(
            "/api/auth/login",
            json={"username": teacher.username, "password": PASSWORD},
        )
        csrf = test_client.cookies.get("XSRF-TOKEN")

        if csrf:
            test_client.headers["X-CSRF-Token"] = csrf

        resp = test_client.patch(
            f"/api/users/{delegate.id}",
            json={"additional_competencies": ["passport_write"]},
        )

        assert resp.status_code == 403


class TestWhatAPassportAdminMayNotDo:
    @pytest.mark.parametrize(
        "competency",
        ["manage_users", "prescribe_non_controlled", "take_teaching_modules"],
    )
    def test_grant_outside_the_passport(
        self, client: TestClient, delegate: User, competency: str
    ) -> None:
        resp = client.patch(
            f"/api/users/{delegate.id}",
            json={"additional_competencies": [competency]},
        )
        assert resp.status_code == 403

    @pytest.mark.parametrize("profession", ["consultant", "teaching_admin"])
    def test_create_outside_the_passport(
        self, client: TestClient, trust: OrgUnit, profession: str
    ) -> None:
        resp = client.post(
            "/api/users",
            json=_new_user(trust, base_profession=profession),
        )
        assert resp.status_code == 403

    def test_change_a_clinicians_profession(
        self, client: TestClient, consultant: User
    ) -> None:
        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"base_profession": "passport_delegate"},
        )
        assert resp.status_code == 403

    def test_change_a_teaching_delegates_profession(
        self, client: TestClient, teaching_delegate: User
    ) -> None:
        """Teaching accounts belong to ``manage_teaching``, not to here."""
        resp = client.patch(
            f"/api/users/{teaching_delegate.id}",
            json={"base_profession": "passport_delegate"},
        )
        assert resp.status_code == 403

    @pytest.mark.parametrize("action", ["deactivate", "send-invite"])
    def test_act_on_a_clinicians_account(
        self, client: TestClient, consultant: User, action: str
    ) -> None:
        resp = client.post(f"/api/users/{consultant.id}/{action}")
        assert resp.status_code == 403
