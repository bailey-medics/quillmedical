"""Belonging to no org_unit is a state of its own, not an error.

Somebody who belongs to no org_unit, a node of the governance tree such
as a trust, a site or a ward, has usually left the place that added
them. They still have an account, and it still works for what is theirs:
they sign in, change their own details, and read and download their own
passport. Every feature is switched on at an org_unit, so no feature
reaches them, and nothing more is open to them.

Mark's decision, 1 November 2026: keep the state and make it a real one,
because it mirrors real life. People leave a trust and still own their
passport. See Phase 10 of
docs/docs/plans/2026-10-31-passport-landing-views-plan.md.

The passport's half is in ``app/features/passport/router_test.py``, as
``TestAnOwnerWhoBelongsNowhereThePassportIsOn``: they read and export
their own passport, are told it is read only, and cannot write to it.
``test_user`` from ``conftest.py`` belongs nowhere, so it is the person
here.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.features.gating import feature_holders_for, user_has_feature
from app.models import OrgUnit, OrgUnitFeature, User, org_unit_member


def _signed_in(client: TestClient) -> str:
    """Sign *client* in as ``test_user``, and return the CSRF token."""
    response = client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "TestPassword123!"},
    )
    assert response.status_code == 200, response.text

    return client.cookies.get("XSRF-TOKEN", "")


def test_the_person_here_belongs_nowhere(
    db_session: Session, test_user: User
) -> None:
    """Every test below depends on it."""
    memberships = db_session.scalars(
        select(org_unit_member.c.org_unit_id).where(
            org_unit_member.c.user_id == test_user.id
        )
    ).all()

    assert memberships == []


def test_they_sign_in(test_client: TestClient, test_user: User) -> None:
    _signed_in(test_client)

    me = test_client.get("/api/auth/me")

    assert me.status_code == 200, me.text
    assert me.json()["username"] == test_user.username


def test_no_feature_is_named_for_them(
    test_client: TestClient, test_user: User
) -> None:
    _signed_in(test_client)

    me = test_client.get("/api/auth/me")

    assert me.json()["enabled_features"] == []


def test_they_change_their_own_name(
    test_client: TestClient, test_user: User, db_session: Session
) -> None:
    csrf = _signed_in(test_client)

    response = test_client.patch(
        "/api/auth/profile",
        json={"full_name": "Dr Left Trust"},
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 200, response.text
    db_session.refresh(test_user)
    assert test_user.full_name == "Dr Left Trust"


def test_a_feature_switched_on_elsewhere_does_not_reach_them(
    db_session: Session, test_user: User
) -> None:
    """A feature is switched on at an org_unit, and they are at none."""
    elsewhere = OrgUnit(name="A trust they left", type="organisation")
    db_session.add(elsewhere)
    db_session.flush()
    db_session.add(
        OrgUnitFeature(
            org_unit_id=elsewhere.id, feature_key="passport", enabled_by=1
        )
    )
    db_session.flush()

    assert feature_holders_for(db_session, test_user.id) == set()
    assert not user_has_feature(db_session, test_user.id, "passport")
