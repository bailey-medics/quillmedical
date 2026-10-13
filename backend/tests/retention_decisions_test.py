"""Deciding what happens to a closed account's records, through the API.

The rule under test crosses a route, the platform role and the retention
module: only an operator may decide, a deletion is checked again at the
moment it is made, and a row nobody decided is never touched.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    ModuleEnrolment,
)
from app.models import OrgUnit, RetentionReview, User
from app.retention import apply_retention

REVIEWS = "/api/retention/reviews"
DECISIONS = "/api/retention/decisions"
BANK = "colonoscopy-optical-diagnosis"

#: A date to ask again on, well in the future.
LATER = "2099-03-01T00:00:00Z"
LONG_AGO = timedelta(days=2000)


def _org(db: Session, name: str = "Academy") -> OrgUnit:
    """An organisation that keeps records a month after an account closes."""
    org = OrgUnit(
        name=name,
        type="hospital_team",
        records_kept_months_after_closure=1,
    )
    db.add(org)
    db.flush()

    return org


def _closed_with_records(db: Session, org: OrgUnit, name: str) -> User:
    """Somebody closed long ago, with one attempt and one enrolment."""
    user = User(
        username=name,
        email=f"{name}@example.nhs.uk",
        password_hash="x",
        full_name=f"{name.title()} Example",
    )
    db.add(user)
    db.flush()
    user.is_active = False
    user.deactivated_at = datetime.now(UTC) - LONG_AGO
    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        completed_at=datetime.now(UTC) - LONG_AGO,
        time_limit_minutes=60,
        total_items=1,
        is_passed=True,
    )
    db.add(assessment)
    db.flush()
    db.add(
        AssessmentAnswer(
            assessment_id=assessment.id, item_id=1, display_order=0
        )
    )
    db.add(
        ModuleEnrolment(
            user_id=user.id,
            org_unit_id=org.id,
            question_bank_id=BANK,
            starts_on=datetime.now(UTC) - LONG_AGO,
            source="admin",
        )
    )
    db.flush()

    return user


def _listed(db: Session, *names: str) -> dict[str, RetentionReview]:
    """Those people, closed, with records, listed by the nightly run."""
    org = _org(db)
    users = {name: _closed_with_records(db, org, name) for name in names}
    apply_retention(db, datetime.now(UTC), apply=True)
    db.commit()

    return {
        name: db.scalars(
            select(RetentionReview).where(RetentionReview.user_id == user.id)
        ).one()
        for name, user in users.items()
    }


def _count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


class TestListing:
    def test_an_operator_sees_what_is_awaiting_a_decision(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann")

        resp = authenticated_superadmin_client.get(REVIEWS)

        assert resp.status_code == 200
        [review] = resp.json()["reviews"]
        assert review["id"] == rows["ann"].id
        assert review["full_name"] == "Ann Example"
        assert review["email"] == "ann@example.nhs.uk"
        assert review["organisation"] == "Academy"
        assert (review["attempts"], review["enrolments"]) == (1, 1)

    def test_what_has_been_decided_is_not_listed(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann", "bob")
        rows["ann"].decision = "kept"
        db_session.commit()

        resp = authenticated_superadmin_client.get(REVIEWS)

        assert [r["full_name"] for r in resp.json()["reviews"]] == [
            "Bob Example"
        ]

    def test_an_admin_of_a_place_is_refused(
        self, authenticated_admin_client: TestClient, db_session: Session
    ) -> None:
        """``manage_users`` is not enough: these are every sponsor's."""
        _listed(db_session, "ann")

        resp = authenticated_admin_client.get(REVIEWS)

        assert resp.status_code == 403
        assert "ann" not in resp.text.lower()

    def test_a_signed_out_caller_is_refused(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        _listed(db_session, "ann")

        assert test_client.get(REVIEWS).status_code == 401


class TestDeciding:
    def test_delete_removes_the_records_and_records_who_decided(
        self,
        authenticated_superadmin_client: TestClient,
        test_superadmin: User,
        db_session: Session,
    ) -> None:
        rows = _listed(db_session, "ann")

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {"review_id": rows["ann"].id, "decision": "delete"}
                ]
            },
        )

        assert resp.status_code == 200
        assert resp.json() == {
            "deleted": 1,
            "kept": 0,
            "to_empty": 0,
            "refused": [],
        }
        db_session.expire_all()
        assert _count(db_session, Assessment) == 0
        assert _count(db_session, AssessmentAnswer) == 0
        assert _count(db_session, ModuleEnrolment) == 0
        row = db_session.get(RetentionReview, rows["ann"].id)
        assert row is not None
        assert row.decision == "deleted"
        assert row.decided_by == test_superadmin.id
        assert row.decided_at is not None

    def test_a_row_left_out_stays_undecided_and_keeps_its_records(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        """The clear ones are dealt with and the unsure one is left."""
        rows = _listed(db_session, "ann", "bob")

        authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {"review_id": rows["ann"].id, "decision": "delete"}
                ]
            },
        )

        db_session.expire_all()
        bob = db_session.get(RetentionReview, rows["bob"].id)
        assert bob is not None
        assert bob.decision == "undecided"
        assert list(db_session.scalars(select(Assessment.user_id))) == [
            bob.user_id
        ]

    def test_keep_needs_a_note(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann")

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {
                        "review_id": rows["ann"].id,
                        "decision": "keep",
                        "note": "   ",
                        "ask_again_on": LATER,
                    }
                ]
            },
        )

        body = resp.json()
        assert body["kept"] == 0
        assert "why" in body["refused"][0]["reason"]
        db_session.expire_all()
        row = db_session.get(RetentionReview, rows["ann"].id)
        assert row is not None
        assert row.decision == "undecided"

    def test_keep_with_no_date_is_a_422_and_keeps_nothing(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        """A keep with no date to come back to would be a keep for ever."""
        rows = _listed(db_session, "ann")

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {
                        "review_id": rows["ann"].id,
                        "decision": "keep",
                        "note": "The sponsor asked us to hold these.",
                    }
                ]
            },
        )

        assert resp.status_code == 422
        db_session.expire_all()
        row = db_session.get(RetentionReview, rows["ann"].id)
        assert row is not None
        assert row.decision == "undecided"
        assert row.ask_again_on is None

    def test_delete_needs_no_date(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann")

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {"review_id": rows["ann"].id, "decision": "delete"}
                ]
            },
        )

        assert resp.status_code == 200
        assert resp.json()["deleted"] == 1

    def test_keep_asks_again_on_the_date_that_was_chosen(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann")
        chosen = datetime.now(UTC) + timedelta(days=1000)

        authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {
                        "review_id": rows["ann"].id,
                        "decision": "keep",
                        "note": "A dispute that will run for years.",
                        "ask_again_on": chosen.isoformat(),
                    }
                ]
            },
        )

        db_session.expire_all()
        row = db_session.get(RetentionReview, rows["ann"].id)
        assert row is not None
        assert row.ask_again_on is not None
        asked = row.ask_again_on.replace(tzinfo=UTC)
        assert abs(asked - chosen) < timedelta(seconds=1)

    def test_a_date_to_ask_again_in_the_past_is_refused(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann")

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {
                        "review_id": rows["ann"].id,
                        "decision": "keep",
                        "note": "Held.",
                        "ask_again_on": "2020-01-01T00:00:00Z",
                    }
                ]
            },
        )

        assert "future" in resp.json()["refused"][0]["reason"]

    def test_an_account_opened_again_since_is_not_deleted_from(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        """The list was drawn, then the account was reopened."""
        rows = _listed(db_session, "ann")
        user = db_session.get(User, rows["ann"].user_id)
        assert user is not None
        user.is_active = True
        db_session.commit()

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {"review_id": rows["ann"].id, "decision": "delete"}
                ]
            },
        )

        body = resp.json()
        assert body["deleted"] == 0
        assert "no longer past its period" in body["refused"][0]["reason"]
        db_session.expire_all()
        assert _count(db_session, Assessment) == 1

    def test_one_refusal_does_not_hold_back_the_rest(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann", "bob")

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {
                        "review_id": rows["ann"].id,
                        "decision": "keep",
                        "ask_again_on": LATER,
                    },
                    {"review_id": rows["bob"].id, "decision": "delete"},
                ]
            },
        )

        body = resp.json()
        assert (body["deleted"], body["kept"]) == (1, 0)
        assert [r["review_id"] for r in body["refused"]] == [rows["ann"].id]

    def test_what_is_already_decided_cannot_be_decided_again(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann")
        rows["ann"].decision = "kept"
        db_session.commit()

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {"review_id": rows["ann"].id, "decision": "delete"}
                ]
            },
        )

        assert "already been decided" in resp.json()["refused"][0]["reason"]
        db_session.expire_all()
        assert _count(db_session, Assessment) == 1

    def test_a_row_that_does_not_exist_is_refused(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={"decisions": [{"review_id": 99999, "decision": "delete"}]},
        )

        assert resp.status_code == 200
        assert "no such" in resp.json()["refused"][0]["reason"]

    def test_the_same_row_twice_is_carried_out_once(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann")
        one = {"review_id": rows["ann"].id, "decision": "delete"}

        resp = authenticated_superadmin_client.post(
            DECISIONS, json={"decisions": [one, one]}
        )

        body = resp.json()
        assert body["deleted"] == 1
        assert "twice" in body["refused"][0]["reason"]

    def test_an_unknown_decision_is_a_422(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann")

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {"review_id": rows["ann"].id, "decision": "undecided"}
                ]
            },
        )

        assert resp.status_code == 422

    def test_no_decisions_at_all_is_a_422(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        resp = authenticated_superadmin_client.post(
            DECISIONS, json={"decisions": []}
        )

        assert resp.status_code == 422

    def test_an_admin_of_a_place_cannot_delete(
        self, authenticated_admin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann")

        resp = authenticated_admin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {"review_id": rows["ann"].id, "decision": "delete"}
                ]
            },
        )

        assert resp.status_code == 403
        db_session.expire_all()
        assert _count(db_session, Assessment) == 1

    def test_a_request_with_no_csrf_token_is_refused(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        rows = _listed(db_session, "ann")
        del authenticated_superadmin_client.headers["X-CSRF-Token"]

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {"review_id": rows["ann"].id, "decision": "delete"}
                ]
            },
        )

        assert resp.status_code == 403
        db_session.expire_all()
        assert _count(db_session, Assessment) == 1


def _closed_account(db: Session, name: str) -> RetentionReview:
    """Somebody closed long ago with no records, listed by the run."""
    user = User(
        username=name,
        email=f"{name}@example.nhs.uk",
        password_hash="x",
        full_name=f"{name.title()} Example",
    )
    db.add(user)
    db.flush()
    user.is_active = False
    user.deactivated_at = datetime.now(UTC) - LONG_AGO
    apply_retention(db, datetime.now(UTC), apply=True)
    db.commit()

    return db.scalars(
        select(RetentionReview).where(RetentionReview.user_id == user.id)
    ).one()


class TestAccounts:
    """A closed account with no records left, awaiting a decision."""

    def test_it_is_listed_apart_from_the_records(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        _listed(db_session, "ann")
        row = _closed_account(db_session, "cat")

        body = authenticated_superadmin_client.get(REVIEWS).json()

        assert [r["full_name"] for r in body["reviews"]] == ["Ann Example"]
        [account] = body["accounts"]
        assert account["id"] == row.id
        assert account["full_name"] == "Cat Example"
        assert account["email"] == "cat@example.nhs.uk"
        assert "organisation" not in account

    def test_delete_marks_it_and_empties_nothing(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        row = _closed_account(db_session, "cat")

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={"decisions": [{"review_id": row.id, "decision": "delete"}]},
        )

        assert resp.json() == {
            "deleted": 0,
            "kept": 0,
            "to_empty": 1,
            "refused": [],
        }
        db_session.expire_all()
        assert row.decision == "deleted"
        user = db_session.get(User, row.user_id)
        assert user is not None
        assert user.email == "cat@example.nhs.uk"
        assert user.full_name == "Cat Example"

    def test_once_marked_it_leaves_the_list(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        row = _closed_account(db_session, "cat")
        authenticated_superadmin_client.post(
            DECISIONS,
            json={"decisions": [{"review_id": row.id, "decision": "delete"}]},
        )

        body = authenticated_superadmin_client.get(REVIEWS).json()

        assert body["accounts"] == []

    def test_one_opened_again_since_is_refused(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        row = _closed_account(db_session, "cat")
        user = db_session.get(User, row.user_id)
        assert user is not None
        user.is_active = True
        user.deactivated_at = None
        db_session.commit()

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={"decisions": [{"review_id": row.id, "decision": "delete"}]},
        )

        body = resp.json()
        assert body["to_empty"] == 0
        [refusal] = body["refused"]
        assert "no longer due" in refusal["reason"]

    def test_keep_needs_a_note_as_records_do(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        row = _closed_account(db_session, "cat")

        resp = authenticated_superadmin_client.post(
            DECISIONS,
            json={
                "decisions": [
                    {
                        "review_id": row.id,
                        "decision": "keep",
                        "ask_again_on": LATER,
                    }
                ]
            },
        )

        assert resp.json()["kept"] == 0
        assert len(resp.json()["refused"]) == 1

    def test_an_admin_of_a_place_cannot_mark_one(
        self, authenticated_admin_client: TestClient, db_session: Session
    ) -> None:
        row = _closed_account(db_session, "cat")

        resp = authenticated_admin_client.post(
            DECISIONS,
            json={"decisions": [{"review_id": row.id, "decision": "delete"}]},
        )

        assert resp.status_code == 403
        db_session.expire_all()
        assert row.decision == "undecided"


def _period(org_unit_id: int) -> str:
    return f"/api/retention/periods/{org_unit_id}"


class TestThePeriod:
    """Reading and setting how long an organisation's records are kept."""

    def test_an_operator_reads_it_for_any_organisation(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        """One with no teaching settings, as most have none."""
        org = OrgUnit(name="No Teaching Here", type="hospital_team")
        db_session.add(org)
        db_session.commit()

        resp = authenticated_superadmin_client.get(_period(org.id))

        assert resp.status_code == 200
        assert resp.json() == {
            "org_unit_id": org.id,
            "organisation": "No Teaching Here",
            "months": None,
        }

    def test_an_operator_sets_it(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        org = OrgUnit(name="Academy", type="hospital_team")
        db_session.add(org)
        db_session.commit()

        resp = authenticated_superadmin_client.put(
            _period(org.id), json={"months": 42}
        )

        assert resp.status_code == 200
        assert resp.json()["months"] == 42
        db_session.expire_all()
        assert org.records_kept_months_after_closure == 42

    def test_null_clears_it(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        org = _org(db_session)
        db_session.commit()

        resp = authenticated_superadmin_client.put(
            _period(org.id), json={"months": None}
        )

        assert resp.json()["months"] is None
        db_session.expire_all()
        assert org.records_kept_months_after_closure is None

    def test_setting_it_deletes_nothing(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        org = _org(db_session)
        _closed_with_records(db_session, org, "ann")
        db_session.commit()

        authenticated_superadmin_client.put(
            _period(org.id), json={"months": 1}
        )

        db_session.expire_all()
        assert _count(db_session, Assessment) == 1
        assert _count(db_session, RetentionReview) == 0

    def test_a_period_out_of_range_is_a_422(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        org = _org(db_session)
        db_session.commit()

        for months in (0, -1, 601, "soon", 3.5):
            resp = authenticated_superadmin_client.put(
                _period(org.id), json={"months": months}
            )

            assert resp.status_code == 422, months

        db_session.expire_all()
        assert org.records_kept_months_after_closure == 1

    def test_a_body_with_no_months_is_a_422(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        """Leaving it out must not clear the period by accident."""
        org = _org(db_session)
        db_session.commit()

        resp = authenticated_superadmin_client.put(_period(org.id), json={})

        assert resp.status_code == 422
        db_session.expire_all()
        assert org.records_kept_months_after_closure == 1

    def test_an_org_unit_that_does_not_exist_is_a_404(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        assert (
            authenticated_superadmin_client.get(_period(99999)).status_code
            == 404
        )
        assert (
            authenticated_superadmin_client.put(
                _period(99999), json={"months": 12}
            ).status_code
            == 404
        )

    def test_an_admin_of_the_organisation_can_neither_read_nor_set_it(
        self, authenticated_admin_client: TestClient, db_session: Session
    ) -> None:
        """``manage_users`` is not enough: the period is not theirs."""
        org = _org(db_session)
        db_session.commit()

        assert (
            authenticated_admin_client.get(_period(org.id)).status_code == 403
        )
        resp = authenticated_admin_client.put(
            _period(org.id), json={"months": 600}
        )

        assert resp.status_code == 403
        db_session.expire_all()
        assert org.records_kept_months_after_closure == 1

    def test_a_request_with_no_csrf_token_is_refused(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        org = _org(db_session)
        db_session.commit()
        del authenticated_superadmin_client.headers["X-CSRF-Token"]

        resp = authenticated_superadmin_client.put(
            _period(org.id), json={"months": 600}
        )

        assert resp.status_code == 403
        db_session.expire_all()
        assert org.records_kept_months_after_closure == 1
