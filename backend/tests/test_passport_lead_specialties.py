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
from tests.places import administers
from tests.registrations import declare

ALPHABETICAL = ["general_medicine", "general_surgery", "oncology"]


def _make_user(
    db: Session, username: str, *, profession: str = "consultant"
) -> User:
    """By default a consultant, who holds ``assess_clinician_passport``."""
    user = User(
        username=username,
        email=f"{username}@example.nhs.uk",
        full_name=f"Dr {username.title()}",
        password_hash=hash_password("PassportPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
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
    """Sign in and carry the CSRF token on every later request."""
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "PassportPassword123!"},
    )
    assert response.status_code == 200, response.text
    csrf = client.cookies.get("XSRF-TOKEN")
    if csrf:
        client.headers["X-CSRF-Token"] = csrf
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


def _admin_of(db: Session, org: OrgUnit, username: str = "admin") -> User:
    """Somebody with ``manage_users``, authorised to administer *org*."""
    admin = _make_user(db, username, profession="system_administrator")
    add_org_unit_member(db, org.id, admin.id, "staff")
    administers(db, admin.id, org.id)
    db.commit()
    return admin


def _leads_url(org: OrgUnit) -> str:
    return f"/api/org-units/{org.id}/passport-specialties"


class TestTheOrganisationRoutes:
    def test_an_admin_sets_the_leads_and_reads_them_back(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(db_session, "Oncology Department")
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        put = client.put(_leads_url(org), json={"specialty_ids": ["oncology"]})
        got = client.get(_leads_url(org))

        assert put.status_code == 200, put.text
        assert put.json() == {"specialty_ids": ["oncology"]}
        assert got.json() == {"specialty_ids": ["oncology"]}

    def test_what_an_admin_sets_leads_their_peoples_list(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        """The whole point, end to end."""
        holder = _make_user(db_session, "holder")
        org = _organisation(
            db_session, "Oncology Department", members=(holder,)
        )
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        client.put(_leads_url(org), json={"specialty_ids": ["oncology"]})

        assert _ids(db_session, holder)[0] == "oncology"

    def test_a_new_list_replaces_the_old_one(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(
            db_session, "Surgical Trust", "oncology", "general_surgery"
        )
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        response = client.put(
            _leads_url(org),
            json={"specialty_ids": ["general_surgery", "general_medicine"]},
        )

        assert response.json() == {
            "specialty_ids": ["general_surgery", "general_medicine"]
        }

    def test_an_empty_list_clears_them(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(db_session, "Oncology Department", "oncology")
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        response = client.put(_leads_url(org), json={"specialty_ids": []})

        assert response.json() == {"specialty_ids": []}
        assert client.get(_leads_url(org)).json() == {"specialty_ids": []}

    def test_an_admin_elsewhere_is_told_nothing(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        """404, not 403, so a refusal does not confirm the place exists."""
        theirs = _organisation(db_session, "Their Trust")
        other = _organisation(db_session, "Other Trust")
        _admin_of(db_session, theirs)
        client = _login(test_client, "admin")

        put = client.put(
            _leads_url(other), json={"specialty_ids": ["oncology"]}
        )
        got = client.get(_leads_url(other))

        assert put.status_code == 404, put.text
        assert got.status_code == 404, got.text

    def test_somebody_without_manage_users_is_refused(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        member = _make_user(db_session, "member")
        org = _organisation(db_session, "Plain Trust", members=(member,))
        client = _login(test_client, "member")

        put = client.put(_leads_url(org), json={"specialty_ids": ["oncology"]})

        assert put.status_code == 403, put.text

    def test_a_ward_is_refused(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        """Leads sit where features do: an organisation, never a ward."""
        org = _organisation(db_session, "Plain Trust")
        ward = OrgUnit(name="Ward 9", type="ward", parent_id=org.id)
        db_session.add(ward)
        db_session.commit()
        admin = _admin_of(db_session, org)
        administers(db_session, admin.id, ward.id)
        db_session.commit()
        client = _login(test_client, "admin")

        response = client.put(
            _leads_url(ward), json={"specialty_ids": ["oncology"]}
        )

        assert response.status_code == 422, response.text
        assert "does not carry features" in response.json()["detail"]

    def test_the_change_needs_csrf(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(db_session, "Oncology Department")
        _admin_of(db_session, org)
        client = _login(test_client, "admin")
        del client.headers["X-CSRF-Token"]

        response = client.put(
            _leads_url(org), json={"specialty_ids": ["oncology"]}
        )

        assert response.status_code == 403, response.text

    def test_an_unknown_specialty_is_refused(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(db_session, "Oncology Department")
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        response = client.put(
            _leads_url(org), json={"specialty_ids": ["cardiology"]}
        )

        assert response.status_code == 422, response.text
        assert "Unknown specialty" in response.json()["detail"]
        # The caller's own text is not echoed back
        assert "cardiology" not in response.json()["detail"]

    def test_a_specialty_named_twice_is_refused(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(db_session, "Oncology Department")
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        response = client.put(
            _leads_url(org), json={"specialty_ids": ["oncology", "oncology"]}
        )

        assert response.status_code == 422, response.text
        assert client.get(_leads_url(org)).json() == {"specialty_ids": []}
