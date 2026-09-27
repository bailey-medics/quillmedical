"""Tests for an organisation's lead specialties, and the order they make.

``specialty_order_for`` decides the order a holder is offered specialties
in, and ``GET /api/passport/specialties`` hands it to the create step and
the settings card. The ordering is tested directly, one rule per test, and
the route once for its shape and once for who may call it. See Phase 10 of
docs/docs/plans/2026-09-26-passport-specialties-plan.md.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.passport.models import OrgUnitPassportSpecialty
from app.features.passport.specialties import (
    SPECIALTIES,
    specialty_order_for,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import withhold
from tests.registrations import declare

ALPHABETICAL = ["general_medicine", "general_surgery", "oncology"]


def _make_user(db: Session, username: str) -> User:
    """A consultant, who holds ``assess_clinician_passport`` by profession."""
    user = User(
        username=username,
        email=f"{username}@example.nhs.uk",
        full_name=f"Dr {username.title()}",
        password_hash=hash_password("PassportPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    declare(user, {"GMC": "1234567"})
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _organisation(
    db: Session, name: str, *leads: str, members: tuple[User, ...] = ()
) -> OrgUnit:
    """An organisation with the passport on, these leads, and these members."""
    org = OrgUnit(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add(OrgUnitFeature(org_unit_id=org.id, feature_key="passport"))
    for position, specialty_id in enumerate(leads, start=1):
        db.add(
            OrgUnitPassportSpecialty(
                org_unit_id=org.id,
                specialty_id=specialty_id,
                position=position,
            )
        )
    for member in members:
        add_org_unit_member(db, org.id, member.id, "staff")
    db.commit()
    return org


def _ids(db: Session, user: User) -> list[str]:
    return [c.specialty.id for c in specialty_order_for(db, user.id)]


def _leads(db: Session, user: User) -> list[bool]:
    return [c.lead for c in specialty_order_for(db, user.id)]


class TestTheOrder:
    def test_no_leads_is_alphabetical(self, db_session: Session) -> None:
        holder = _make_user(db_session, "holder")
        _organisation(db_session, "Plain Trust", members=(holder,))

        assert _ids(db_session, holder) == ALPHABETICAL
        assert _leads(db_session, holder) == [False, False, False]

    def test_somebody_in_no_organisation_is_alphabetical(
        self, db_session: Session
    ) -> None:
        loner = _make_user(db_session, "loner")

        assert _ids(db_session, loner) == ALPHABETICAL

    def test_an_organisations_leads_come_first(
        self, db_session: Session
    ) -> None:
        """The case this exists for: an oncology department."""
        holder = _make_user(db_session, "holder")
        _organisation(
            db_session, "Oncology Department", "oncology", members=(holder,)
        )

        assert _ids(db_session, holder) == [
            "oncology",
            "general_medicine",
            "general_surgery",
        ]
        assert _leads(db_session, holder) == [True, False, False]

    def test_leads_keep_the_order_the_organisation_gave(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")
        _organisation(
            db_session,
            "Surgical Trust",
            "general_surgery",
            "oncology",
            members=(holder,),
        )

        assert _ids(db_session, holder) == [
            "general_surgery",
            "oncology",
            "general_medicine",
        ]

    def test_two_organisations_combine_in_name_order_without_repeats(
        self, db_session: Session
    ) -> None:
        """Names compare without case, so "alpha" comes before "Beta"."""
        holder = _make_user(db_session, "holder")
        _organisation(
            db_session, "Beta Trust", "general_surgery", members=(holder,)
        )
        _organisation(
            db_session,
            "alpha Trust",
            "oncology",
            "general_surgery",
            members=(holder,),
        )

        assert _ids(db_session, holder) == [
            "oncology",
            "general_surgery",
            "general_medicine",
        ]
        assert _leads(db_session, holder) == [True, True, False]

    def test_a_removed_specialty_is_skipped(self, db_session: Session) -> None:
        """A lead naming a file that has gone orders nothing."""
        holder = _make_user(db_session, "holder")
        _organisation(
            db_session,
            "Old Trust",
            "cardiology",
            "oncology",
            members=(holder,),
        )

        ids = _ids(db_session, holder)

        assert ids[0] == "oncology"
        assert "cardiology" not in ids
        assert len(ids) == len(SPECIALTIES)

    def test_an_organisation_they_do_not_reach_is_ignored(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")
        stranger = _make_user(db_session, "stranger")
        _organisation(db_session, "Their Trust", members=(holder,))
        _organisation(
            db_session, "Other Trust", "oncology", members=(stranger,)
        )

        assert _ids(db_session, holder) == ALPHABETICAL


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "PassportPassword123!"},
    )
    assert response.status_code == 200, response.text
    return client


class TestTheRoute:
    def test_returns_the_order_with_each_lead_marked(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        holder = _make_user(db_session, "holder")
        _organisation(
            db_session, "Oncology Department", "oncology", members=(holder,)
        )
        client = _login(test_client, "holder")

        response = client.get("/api/passport/specialties")

        assert response.status_code == 200, response.text
        assert response.json() == [
            {"id": "oncology", "display_name": "Oncology", "lead": True},
            {
                "id": "general_medicine",
                "display_name": "General medicine",
                "lead": False,
            },
            {
                "id": "general_surgery",
                "display_name": "General surgery",
                "lead": False,
            },
        ]

    def test_needs_the_passport_competency(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        user = _make_user(db_session, "outsider")
        withhold(user, "assess_clinician_passport")
        db_session.commit()
        _organisation(db_session, "Plain Trust", members=(user,))
        client = _login(test_client, "outsider")

        response = client.get("/api/passport/specialties")

        assert response.status_code == 403, response.text
