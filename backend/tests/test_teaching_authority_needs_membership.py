"""Administering a bank for an organisation needs membership of it.

Teaching has two kinds of question, and they take different answers:

- **Delivery flows downward.** A trainee at a ward receives what the
  trust made available there, so content visibility asks *reach*. That is
  deliberate and tested in ``TestLearningContentGate``.
- **Authority does not flow anywhere.** Deciding which version a trust's
  candidates receive, or setting a bank live or closed for it, is not
  something a ward membership confers.

Both authority routes asked reach, through ``_get_user_org_ids``. So a
``teaching_admin`` whose only membership was a site linked to the trust
passed the ``org_id not in ...`` check and could promote a version, or
close a bank, for the whole organisation above them. They now ask
``get_member_org_unit_ids``.

**This narrows, which is the opposite direction to the rest of the
walk.** The plan names the walk's risk as widening — reach adds
site-linked organisations to a set that held only direct memberships — so
a narrowing needs its own evidence that nobody legitimate is locked out.
That is what ``TestAnOrganisationMemberIsUnaffected`` is for.

``update_bank_org_settings`` already said so in its own docstring: "the
caller must belong to the organisation named in the path". Reaching a
trust from a ward is not belonging to it, so this is the code catching up
with its stated intent.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import (
    OrgUnit,
    OrgUnitFeature,
    User,
    org_unit_member,
)
from app.organisations import add_org_unit_member
from app.security import hash_password


def _teaching_org(db: Session, name: str = "Trust") -> OrgUnit:
    org = OrgUnit(name=name, type="hospital_team")
    db.add(org)
    db.flush()
    db.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db.commit()
    db.refresh(org)
    return org


def _teaching_admin(db: Session, username: str) -> User:
    """Holds ``manage_teaching_content`` and no membership yet."""
    user = User(
        username=username,
        email=f"{username}@test.local",
        password_hash=hash_password("Educator123!"),
        is_active=True,
        email_verified=True,
        base_profession="teaching_admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _join_org(db: Session, org: OrgUnit, user: User) -> None:
    add_org_unit_member(db, org.id, user.id, "staff")
    db.commit()


def _join_linked_site(db: Session, org: OrgUnit, user: User) -> OrgUnit:
    """Put the user on a ward of the trust, and in no organisation.

    This is the shape that reach admits and membership does not.
    """
    site = OrgUnit(name="Ward 9", type="ward")
    db.add(site)
    db.flush()
    db.execute(
        update(OrgUnit).where(OrgUnit.id == site.id).values(parent_id=org.id)
    )
    db.execute(
        org_unit_member.insert().values(
            org_unit_id=site.id,
            user_id=user.id,
            capacity="staff",
        )
    )
    db.commit()
    return site


def _login(client: TestClient, username: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Educator123!"},
    )
    assert response.status_code == 200, response.text
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


def _promote_url(org: OrgUnit) -> str:
    return (
        "/api/teaching/admin/banks/test-bank"
        f"/places/{org.id}/active-version"
    )


def _settings_url(org: OrgUnit) -> str:
    return "/api/teaching/admin/banks/test-bank" f"/places/{org.id}/settings"


@pytest.fixture
def org(db_session: Session) -> OrgUnit:
    return _teaching_org(db_session)


class TestReachingATrustIsNotAuthorityOverIt:
    """The hole this closes.

    The caller holds ``manage_teaching_content``, so the competency gate
    admits them. What must refuse them is the place check.
    """

    @pytest.fixture
    def ward_admin(self, db_session: Session, org: OrgUnit) -> User:
        user = _teaching_admin(db_session, "ward_admin")
        _join_linked_site(db_session, org, user)
        return user

    def test_they_cannot_promote_a_version_for_the_trust(
        self,
        test_client: TestClient,
        org: OrgUnit,
        ward_admin: User,
    ) -> None:
        headers = _login(test_client, "ward_admin")
        response = test_client.put(
            _promote_url(org), headers=headers, json={"version": 2}
        )

        assert response.status_code == 403, response.text

    def test_they_cannot_close_a_bank_for_the_trust(
        self,
        test_client: TestClient,
        org: OrgUnit,
        ward_admin: User,
    ) -> None:
        """Closing mid-cohort locks candidates out part-way through."""
        headers = _login(test_client, "ward_admin")
        response = test_client.put(
            _settings_url(org),
            headers=headers,
            json={"is_live": False},
        )

        assert response.status_code == 403, response.text


class TestAnOrganisationMemberIsUnaffected:
    """The narrowing must refuse only the people it is about.

    Neither route reaches its 403 for a member, so a refusal here would
    mean the place check had become too strict. What happens afterwards —
    a missing bank, a missing version — is not this test's business, so
    only the 403 is asserted against.
    """

    @pytest.fixture
    def trust_admin(self, db_session: Session, org: OrgUnit) -> User:
        user = _teaching_admin(db_session, "trust_admin")
        _join_org(db_session, org, user)
        return user

    def test_the_place_check_admits_them_to_promote(
        self,
        test_client: TestClient,
        org: OrgUnit,
        trust_admin: User,
    ) -> None:
        headers = _login(test_client, "trust_admin")
        response = test_client.put(
            _promote_url(org), headers=headers, json={"version": 2}
        )

        assert response.status_code != 403, response.text

    def test_the_place_check_admits_them_to_settings(
        self,
        test_client: TestClient,
        org: OrgUnit,
        trust_admin: User,
    ) -> None:
        headers = _login(test_client, "trust_admin")
        response = test_client.put(
            _settings_url(org),
            headers=headers,
            json={"is_live": False},
        )

        assert response.status_code != 403, response.text
