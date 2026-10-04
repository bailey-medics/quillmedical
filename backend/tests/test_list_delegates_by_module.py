"""Tests for narrowing the all-delegates view to one module.

An organisation may hold more than one module with an assessment, a real
one and a practice one for instance. Read together, a delegate's latest
attempt may be in either, so a practice attempt hid a real pass and
counted against a first-time pass. ``bank_id`` keeps them apart, and
``/admin/delegates/modules`` says which modules there are to choose from.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    Assessment,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import hold

DELEGATES = "/api/teaching/admin/delegates"
MODULES = f"{DELEGATES}/modules"

REAL = "colonoscopy"
PRACTICE = "colonoscopy-practice"


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


def _admin_of(db: Session, org: OrgUnit, user: User) -> None:
    """Put the caller in the organisation, with the gate the route needs."""
    add_org_unit_member(db, org.id, user.id, "trainee")
    hold(user, "manage_teaching")
    db.commit()


def _delegate(db: Session, org: OrgUnit, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db.add(user)
    db.commit()
    add_org_unit_member(db, org.id, user.id, "trainee")
    db.commit()
    return user


def _serve(
    db: Session,
    org: OrgUnit,
    bank_id: str,
    version: int = 1,
    *,
    live: bool = True,
) -> None:
    """Have the organisation serve one version of a module."""
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            is_live=live,
            active_version=version,
        )
    )
    db.commit()


def _module(
    db: Session, org: OrgUnit, bank_id: str, title: str, version: int = 1
) -> None:
    """Sync one version of a module into the organisation."""
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            version=version,
            title=title,
            description="A question bank.",
            type="uniform",
            config_yaml={},
        )
    )
    db.commit()


def _attempt(
    db: Session,
    org: OrgUnit,
    user: User,
    bank_id: str,
    *,
    passed: bool,
    days_ago: int,
) -> None:
    when = datetime.now(UTC) - timedelta(days=days_ago)
    db.add(
        Assessment(
            user_id=user.id,
            org_unit_id=org.id,
            question_bank_id=bank_id,
            bank_version=1,
            time_limit_minutes=60,
            total_items=3,
            is_passed=passed,
            started_at=when,
            completed_at=when,
        )
    )
    db.commit()


def _row(
    client: TestClient, name: str, bank_id: str | None = None
) -> dict[str, object]:
    params = {"bank_id": bank_id} if bank_id else None
    resp = client.get(DELEGATES, params=params)
    assert resp.status_code == 200, resp.text
    return next(d for d in resp.json() if d["name"] == name)


def _names(client: TestClient, bank_id: str | None = None) -> set[str]:
    params = {"bank_id": bank_id} if bank_id else None
    resp = client.get(DELEGATES, params=params)
    assert resp.status_code == 200, resp.text
    return {d["name"] for d in resp.json()}


class TestNarrowingToOneModule:
    def test_a_later_practice_attempt_does_not_hide_a_real_pass(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_superadmin: User,
    ) -> None:
        org = _org(db_session, "Trust")
        _admin_of(db_session, org, test_superadmin)
        delegate = _delegate(db_session, org, "delegate")
        _attempt(db_session, org, delegate, REAL, passed=True, days_ago=5)
        _attempt(db_session, org, delegate, PRACTICE, passed=False, days_ago=1)
        client = authenticated_superadmin_client

        assert _row(client, "delegate", REAL)["assessment_result"] == "pass"
        assert (
            _row(client, "delegate", PRACTICE)["assessment_result"] == "fail"
        )
        # With no module named, the route still reads every module together.
        assert _row(client, "delegate")["assessment_result"] == "fail"

    def test_a_practice_attempt_does_not_cost_a_first_time_pass(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_superadmin: User,
    ) -> None:
        org = _org(db_session, "Trust")
        _admin_of(db_session, org, test_superadmin)
        delegate = _delegate(db_session, org, "delegate")
        _attempt(db_session, org, delegate, PRACTICE, passed=False, days_ago=5)
        _attempt(db_session, org, delegate, REAL, passed=True, days_ago=1)
        client = authenticated_superadmin_client

        assert _row(client, "delegate", REAL)["first_time_pass"] is True
        assert _row(client, "delegate")["first_time_pass"] is False

    def test_somebody_who_has_not_attempted_the_module_is_left_out(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_superadmin: User,
    ) -> None:
        org = _org(db_session, "Trust")
        _admin_of(db_session, org, test_superadmin)
        delegate = _delegate(db_session, org, "delegate")
        _delegate(db_session, org, "newcomer")
        _attempt(db_session, org, delegate, PRACTICE, passed=True, days_ago=1)
        client = authenticated_superadmin_client

        assert _names(client, REAL) == set()
        assert _names(client, PRACTICE) == {"delegate"}
        # With no module named, everybody is still listed.
        assert _names(client) == {"delegate", "newcomer"}

    def test_an_admin_who_attempted_the_module_is_listed_themselves(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_superadmin: User,
    ) -> None:
        """An admin trying the module out is one of its delegates."""
        org = _org(db_session, "Trust")
        _admin_of(db_session, org, test_superadmin)
        _attempt(
            db_session, org, test_superadmin, PRACTICE, passed=True, days_ago=1
        )
        client = authenticated_superadmin_client
        me = test_superadmin.full_name or test_superadmin.username

        assert _names(client, PRACTICE) == {me}
        assert _names(client, REAL) == set()
        # With no module named, the caller still leaves themselves out.
        assert _names(client) == set()

    def test_somebody_who_started_and_did_not_finish_is_listed(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_superadmin: User,
    ) -> None:
        org = _org(db_session, "Trust")
        _admin_of(db_session, org, test_superadmin)
        delegate = _delegate(db_session, org, "delegate")
        db_session.add(
            Assessment(
                user_id=delegate.id,
                org_unit_id=org.id,
                question_bank_id=REAL,
                bank_version=1,
                time_limit_minutes=60,
                total_items=3,
            )
        )
        db_session.commit()

        row = _row(authenticated_superadmin_client, "delegate", REAL)

        assert row["assessment_result"] == "incomplete"

    def test_refuses_an_empty_bank_id(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_superadmin: User,
    ) -> None:
        org = _org(db_session, "Trust")
        _admin_of(db_session, org, test_superadmin)

        resp = authenticated_superadmin_client.get(
            DELEGATES, params={"bank_id": ""}
        )

        assert resp.status_code == 422


class TestListingTheModules:
    def test_lists_each_module_once_by_the_title_being_served(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_superadmin: User,
    ) -> None:
        org = _org(db_session, "Trust")
        _admin_of(db_session, org, test_superadmin)
        _module(db_session, org, REAL, "Old title", version=1)
        _module(db_session, org, REAL, "Colonoscopy", version=2)
        _module(db_session, org, REAL, "Not promoted yet", version=3)
        _serve(db_session, org, REAL, version=2)
        _module(db_session, org, PRACTICE, "Colonoscopy (practice)")
        _serve(db_session, org, PRACTICE)

        resp = authenticated_superadmin_client.get(MODULES)

        assert resp.status_code == 200
        assert resp.json() == [
            {"bank_id": REAL, "title": "Colonoscopy"},
            {"bank_id": PRACTICE, "title": "Colonoscopy (practice)"},
        ]

    def test_leaves_out_a_module_that_was_only_synced(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_superadmin: User,
    ) -> None:
        """A sync brings in modules the organisation was never given."""
        org = _org(db_session, "Trust")
        _admin_of(db_session, org, test_superadmin)
        _module(db_session, org, REAL, "Colonoscopy")
        _serve(db_session, org, REAL)
        _module(db_session, org, "chest-xray", "Chest X-ray")

        resp = authenticated_superadmin_client.get(MODULES)

        assert [m["bank_id"] for m in resp.json()] == [REAL]

    def test_keeps_a_module_closed_to_new_attempts(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_superadmin: User,
    ) -> None:
        org = _org(db_session, "Trust")
        _admin_of(db_session, org, test_superadmin)
        _module(db_session, org, REAL, "Colonoscopy")
        _serve(db_session, org, REAL, live=False)

        resp = authenticated_superadmin_client.get(MODULES)

        assert [m["bank_id"] for m in resp.json()] == [REAL]

    def test_leaves_out_another_organisations_modules(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_superadmin: User,
    ) -> None:
        org = _org(db_session, "Trust")
        other = _org(db_session, "Other trust")
        _admin_of(db_session, org, test_superadmin)
        _module(db_session, org, REAL, "Colonoscopy")
        _serve(db_session, org, REAL)
        _module(db_session, other, "respiratory", "Respiratory")
        _serve(db_session, other, "respiratory")

        resp = authenticated_superadmin_client.get(MODULES)

        assert [m["bank_id"] for m in resp.json()] == [REAL]

    def test_refuses_somebody_who_may_not_manage_teaching(
        self, authenticated_client: TestClient
    ) -> None:
        assert authenticated_client.get(MODULES).status_code in (403, 404)

    def test_refuses_a_signed_out_caller(
        self, test_client: TestClient
    ) -> None:
        assert test_client.get(MODULES).status_code == 401
