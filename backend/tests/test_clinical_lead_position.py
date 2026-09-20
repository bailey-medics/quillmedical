"""The organisation page reads the clinical lead from the post.

Leading a place is a post, which can be vacant. It used to be a value in
a column on the membership row, which could not be: a vacancy and a
missing row looked the same.

Everything about appointing now happens on `/api/org-units` and is
tested there. What is left here is the organisation surface's own
reading of it, which stays until that surface goes.
"""

from __future__ import annotations

from sqlalchemy import insert, update
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    OrgUnit,
    User,
    org_unit_member,
)
from app.organisations import add_organisation_member
from app.security import hash_password


def _user(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.commit()
    return user


def _org_with_site(db: Session, admin: User) -> tuple[Organisation, OrgUnit]:
    org = Organisation(name="Trust", type="hospital")
    site = OrgUnit(name="Ward 1", type="ward")
    db.add_all([org, site])
    db.commit()
    db.execute(
        update(OrgUnit)
        .where(OrgUnit.id == site.id)
        .values(parent_id=org.org_unit_id)
    )
    add_organisation_member(db, org.id, admin.id, "trainee")
    db.commit()
    return org, site


class TestTheReadsAnswerFromThePost:
    """Both read paths moved across, so the post is what they report."""

    def test_the_organisation_listing_names_the_lead(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        org, site = _org_with_site(db_session, test_superadmin)
        lead = _user(db_session, "dr_lead")
        lead.full_name = "Dr Ada Lead"
        db_session.commit()

        authenticated_superadmin_client.post(
            f"/api/org-units/{site.id}/members",
            json={"user_id": lead.id, "capacity": "staff"},
        )
        authenticated_superadmin_client.put(
            f"/api/org-units/{site.id}/clinical-lead",
            json={"user_id": lead.id},
        )

        resp = authenticated_superadmin_client.get(
            f"/api/organisations/{org.id}"
        )
        assert resp.status_code == 200
        listed = {s["id"]: s for s in resp.json()["sites"]}
        assert listed[site.id]["clinical_lead"] == "Dr Ada Lead"

    def test_a_lead_written_only_to_the_column_is_not_reported(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """Proves the read really moved.

        Writing the column directly, as the pre-migration code did, no
        longer makes someone the clinical lead — only the post does.
        """
        org, site = _org_with_site(db_session, test_superadmin)
        impostor = _user(db_session, "dr_column_only")
        db_session.execute(
            insert(org_unit_member).values(
                org_unit_id=site.id,
                user_id=impostor.id,
                capacity="staff",
            )
        )
        db_session.commit()

        resp = authenticated_superadmin_client.get(
            f"/api/organisations/{org.id}"
        )
        listed = {s["id"]: s for s in resp.json()["sites"]}
        assert listed[site.id]["clinical_lead"] == ""
