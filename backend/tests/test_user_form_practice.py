"""Setting where somebody may practise, from the user form.

``POST /api/users`` and ``PATCH /api/users/{id}`` take ``practising``:
for each org_unit sent, what the person may practise there. It is settled
in the same transaction as the account, so a new starter is never left
created and authorised nowhere. ``GET /api/users/{id}`` answers in the
same shape, for the form to open with.

See ``docs/docs/plans/2026-10-03-user-form-practice-step-plan.md``.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.grants import sync_competency_rows
from app.models import OrgUnit, PractisingCompetency, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

PASSWORD = "Password123!"
#: Two competencies a consultant holds from their profession.
HELD = "perform_venepuncture"
ALSO_HELD = "certify_death"
#: Not held by a consultant.
NOT_HELD = "manage_users"
#: One a teaching admin may grant.
TEACHING = "view_teaching_analytics"


@pytest.fixture
def trust(db_session: Session, test_admin: User) -> OrgUnit:
    org = OrgUnit(name="Own Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    add_org_unit_member(db_session, org.id, test_admin.id, "staff")
    administers(db_session, test_admin.id, org.id)
    db_session.commit()

    return org


@pytest.fixture
def ward(db_session: Session, trust: OrgUnit, test_admin: User) -> OrgUnit:
    unit = OrgUnit(name="Ward A", type="ward", parent_id=trust.id)
    db_session.add(unit)
    db_session.commit()
    administers(db_session, test_admin.id, unit.id)

    return unit


def _person(
    db: Session,
    username: str,
    profession: str = "consultant",
    *units: OrgUnit,
) -> User:
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
    for unit in units:
        add_org_unit_member(db, unit.id, user.id, "staff")
    db.commit()
    db.refresh(user)

    return user


def _rows(db: Session, user_id: int, unit: OrgUnit) -> set[str]:
    return set(
        db.execute(
            select(PractisingCompetency.competency).where(
                PractisingCompetency.user_id == user_id,
                PractisingCompetency.org_unit_id == unit.id,
            )
        )
        .scalars()
        .all()
    )


def _row(db: Session, user: User, unit: OrgUnit, competency: str) -> Any:
    return db.scalar(
        select(PractisingCompetency).where(
            PractisingCompetency.user_id == user.id,
            PractisingCompetency.org_unit_id == unit.id,
            PractisingCompetency.competency == competency,
        )
    )


def _authorise(
    db: Session,
    user: User,
    unit: OrgUnit,
    competency: str,
    by: User | None = None,
) -> None:
    db.add(
        PractisingCompetency(
            user_id=user.id,
            org_unit_id=unit.id,
            competency=competency,
            authorised_by=by.id if by else None,
        )
    )
    db.commit()


def _new_user(*units: OrgUnit, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "New Starter",
        "username": "new.starter",
        "email": "new.starter@example.test",
        "password": "NewStarter123!",
        "base_profession": "consultant",
        "org_unit_ids": [unit.id for unit in units],
    }
    body.update(overrides)

    return body


def _at(unit: OrgUnit, *competencies: str) -> dict[str, Any]:
    return {"org_unit_id": unit.id, "competencies": list(competencies)}


def _log_in(client: TestClient, user: User) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = client.cookies.get("XSRF-TOKEN")

    if csrf:
        client.headers["X-CSRF-Token"] = csrf

    return client


class TestCreatingSomebodyWithPractice:
    def test_the_rows_are_written_with_the_account(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        test_admin: User,
        trust: OrgUnit,
        ward: OrgUnit,
    ) -> None:
        resp = authenticated_admin_client.post(
            "/api/users",
            json=_new_user(
                trust,
                ward,
                practising=[_at(trust, HELD), _at(ward, HELD, ALSO_HELD)],
            ),
        )

        assert resp.status_code == 200, resp.text
        created = resp.json()["id"]
        assert _rows(db_session, created, trust) == {HELD}
        assert _rows(db_session, created, ward) == {HELD, ALSO_HELD}
        row = db_session.scalar(
            select(PractisingCompetency).where(
                PractisingCompetency.user_id == created,
                PractisingCompetency.org_unit_id == trust.id,
            )
        )
        assert row is not None
        assert row.authorised_by == test_admin.id

    def test_without_the_field_nobody_is_authorised_anywhere(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        trust: OrgUnit,
    ) -> None:
        resp = authenticated_admin_client.post(
            "/api/users", json=_new_user(trust)
        )

        assert resp.status_code == 200, resp.text
        assert _rows(db_session, resp.json()["id"], trust) == set()

    def test_a_refusal_leaves_no_account_behind(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        ward: OrgUnit,
    ) -> None:
        """Practice at the ward, for somebody put only at the trust."""
        resp = authenticated_admin_client.post(
            "/api/users",
            json=_new_user(trust, practising=[_at(ward, HELD)]),
        )

        assert resp.status_code == 422
        assert (
            db_session.scalar(
                select(User).where(User.username == "new.starter")
            )
            is None
        )


class TestEditingPractice:
    @pytest.fixture
    def surgeon(
        self, db_session: Session, trust: OrgUnit, ward: OrgUnit
    ) -> User:
        return _person(db_session, "surgeon", "consultant", trust, ward)

    def test_authorises_and_withdraws_in_one_save(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        surgeon: User,
        trust: OrgUnit,
    ) -> None:
        _authorise(db_session, surgeon, trust, HELD)

        resp = authenticated_admin_client.patch(
            f"/api/users/{surgeon.id}",
            json={"practising": [_at(trust, ALSO_HELD)]},
        )

        assert resp.status_code == 200, resp.text
        assert _rows(db_session, surgeon.id, trust) == {ALSO_HELD}

    def test_an_org_unit_left_out_is_not_touched(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        surgeon: User,
        trust: OrgUnit,
        ward: OrgUnit,
    ) -> None:
        _authorise(db_session, surgeon, ward, HELD)

        resp = authenticated_admin_client.patch(
            f"/api/users/{surgeon.id}",
            json={"practising": [_at(trust, HELD)]},
        )

        assert resp.status_code == 200, resp.text
        assert _rows(db_session, surgeon.id, ward) == {HELD}

    def test_a_row_for_something_they_do_not_hold_survives(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        surgeon: User,
        trust: OrgUnit,
    ) -> None:
        """The form has no switch for it, so says nothing about it."""
        _authorise(db_session, surgeon, trust, NOT_HELD)
        _authorise(db_session, surgeon, trust, HELD)

        resp = authenticated_admin_client.patch(
            f"/api/users/{surgeon.id}", json={"practising": [_at(trust)]}
        )

        assert resp.status_code == 200, resp.text
        assert _rows(db_session, surgeon.id, trust) == {NOT_HELD}

    def test_a_row_that_does_not_change_keeps_who_authorised_it(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        surgeon: User,
        trust: OrgUnit,
    ) -> None:
        earlier = _person(db_session, "earlier.admin")
        _authorise(db_session, surgeon, trust, HELD, by=earlier)
        before = _row(db_session, surgeon, trust, HELD).authorised_at

        resp = authenticated_admin_client.patch(
            f"/api/users/{surgeon.id}",
            json={"practising": [_at(trust, HELD, ALSO_HELD)]},
        )

        assert resp.status_code == 200, resp.text
        db_session.expire_all()
        kept = _row(db_session, surgeon, trust, HELD)
        assert kept.authorised_by == earlier.id
        assert kept.authorised_at == before

    def test_without_the_field_nothing_changes(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        surgeon: User,
        trust: OrgUnit,
    ) -> None:
        _authorise(db_session, surgeon, trust, HELD)

        resp = authenticated_admin_client.patch(
            f"/api/users/{surgeon.id}", json={"name": "A Surgeon"}
        )

        assert resp.status_code == 200, resp.text
        assert _rows(db_session, surgeon.id, trust) == {HELD}

    def test_practice_where_they_do_not_belong_is_refused(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        ward: OrgUnit,
    ) -> None:
        visitor = _person(db_session, "visitor", "consultant", trust)

        resp = authenticated_admin_client.patch(
            f"/api/users/{visitor.id}",
            json={"practising": [_at(ward, HELD)]},
        )

        assert resp.status_code == 422
        assert _rows(db_session, visitor.id, ward) == set()

    def test_leaving_an_org_unit_in_the_same_save_is_refused_there(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        surgeon: User,
        trust: OrgUnit,
        ward: OrgUnit,
    ) -> None:
        """Membership is settled first, so the ward is no longer theirs."""
        resp = authenticated_admin_client.patch(
            f"/api/users/{surgeon.id}",
            json={
                "org_unit_ids": [trust.id],
                "practising": [_at(ward, HELD)],
            },
        )

        assert resp.status_code == 422


class TestWhatTheRequestMustLookLike:
    def test_the_same_org_unit_twice_is_refused(
        self,
        authenticated_admin_client: TestClient,
        trust: OrgUnit,
    ) -> None:
        resp = authenticated_admin_client.post(
            "/api/users",
            json=_new_user(
                trust, practising=[_at(trust, HELD), _at(trust, ALSO_HELD)]
            ),
        )

        assert resp.status_code == 422

    def test_a_competency_not_in_the_catalogue_is_refused(
        self,
        authenticated_admin_client: TestClient,
        trust: OrgUnit,
    ) -> None:
        resp = authenticated_admin_client.post(
            "/api/users",
            json=_new_user(trust, practising=[_at(trust, "no_such_thing")]),
        )

        assert resp.status_code == 422


class TestWhoMaySetPractice:
    @pytest.fixture
    def surgeon(self, db_session: Session, trust: OrgUnit) -> User:
        return _person(db_session, "surgeon", "consultant", trust)

    @pytest.fixture
    def without_practice(self, db_session: Session, test_admin: User) -> None:
        """Leave the admin holding ``manage_users`` and not the other."""
        sync_competency_rows(
            test_admin,
            additional=[],
            removed=["manage_practising_competencies"],
            source="admin",
        )
        db_session.commit()

    def test_manage_users_alone_is_not_enough(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        without_practice: None,
        surgeon: User,
        trust: OrgUnit,
    ) -> None:
        resp = authenticated_admin_client.patch(
            f"/api/users/{surgeon.id}",
            json={"practising": [_at(trust, HELD)]},
        )

        assert resp.status_code == 403
        assert _rows(db_session, surgeon.id, trust) == set()

    def test_a_list_that_changes_nothing_is_not_refused(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        without_practice: None,
        surgeon: User,
        trust: OrgUnit,
    ) -> None:
        """The form sends every field on every save."""
        _authorise(db_session, surgeon, trust, HELD)

        resp = authenticated_admin_client.patch(
            f"/api/users/{surgeon.id}",
            json={"name": "A Surgeon", "practising": [_at(trust, HELD)]},
        )

        assert resp.status_code == 200, resp.text
        assert _rows(db_session, surgeon.id, trust) == {HELD}

    def test_a_scoped_manager_is_held_to_its_whitelist(
        self,
        test_client: TestClient,
        db_session: Session,
        surgeon: User,
        trust: OrgUnit,
    ) -> None:
        coordinator = _person(
            db_session, "coordinator", "teaching_admin", trust
        )
        client = _log_in(test_client, coordinator)

        resp = client.patch(
            f"/api/users/{surgeon.id}",
            json={"practising": [_at(trust, HELD)]},
        )

        assert resp.status_code == 403
        assert HELD in resp.json()["detail"]
        assert _rows(db_session, surgeon.id, trust) == set()

    def test_a_scoped_manager_sets_what_is_on_its_whitelist(
        self,
        test_client: TestClient,
        db_session: Session,
        trust: OrgUnit,
    ) -> None:
        coordinator = _person(
            db_session, "coordinator", "teaching_admin", trust
        )
        delegate = _person(db_session, "delegate", "teaching_delegate", trust)
        sync_competency_rows(
            delegate, additional=[TEACHING], removed=[], source="admin"
        )
        db_session.commit()
        client = _log_in(test_client, coordinator)

        resp = client.patch(
            f"/api/users/{delegate.id}",
            json={"practising": [_at(trust, TEACHING)]},
        )

        assert resp.status_code == 200, resp.text
        assert _rows(db_session, delegate.id, trust) == {TEACHING}


class TestReadingItBack:
    def test_get_answers_per_org_unit_in_the_shape_it_takes(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        ward: OrgUnit,
    ) -> None:
        surgeon = _person(db_session, "surgeon", "consultant", trust, ward)
        _authorise(db_session, surgeon, trust, HELD)
        _authorise(db_session, surgeon, trust, NOT_HELD)

        resp = authenticated_admin_client.get(f"/api/users/{surgeon.id}")

        assert resp.status_code == 200, resp.text
        # Narrowed to what they hold, and one entry per org_unit, with
        # an empty list where nothing is authorised.
        assert resp.json()["practising"] == [
            {"org_unit_id": trust.id, "competencies": [HELD]},
            {"org_unit_id": ward.id, "competencies": []},
        ]

    def test_what_get_returns_can_be_sent_straight_back(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        trust: OrgUnit,
    ) -> None:
        surgeon = _person(db_session, "surgeon", "consultant", trust)
        _authorise(db_session, surgeon, trust, HELD)
        _authorise(db_session, surgeon, trust, NOT_HELD)
        read = authenticated_admin_client.get(f"/api/users/{surgeon.id}")

        resp = authenticated_admin_client.patch(
            f"/api/users/{surgeon.id}",
            json={"practising": read.json()["practising"]},
        )

        assert resp.status_code == 200, resp.text
        assert _rows(db_session, surgeon.id, trust) == {HELD, NOT_HELD}
