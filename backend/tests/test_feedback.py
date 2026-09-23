"""Tests for submitting user feedback."""

import logging
import typing
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, Feedback, User
from app.schemas.feedback import (
    MAX_MESSAGE,
    FeedbackCategory,
    FeedbackStatus,
)

ENDPOINT = "/api/feedback"

#: Unmistakable, so finding it anywhere in the logs means it leaked.
SECRET_MESSAGE = "The case for Mrs Example-Leak shows the wrong dose"

VALID = {
    "category": "inaccurate",
    "message": SECRET_MESSAGE,
    "route": "/teaching/:bankId",
    "release": "abc1234",
    "viewport": "390x844",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "breadcrumbs": [
        {"type": "route", "ms": 1200, "pattern": "/teaching/:bankId"},
        {"type": "auth", "ms": 10, "event": "login"},
    ],
}


@pytest.fixture
def client(authenticated_client: TestClient) -> TestClient:
    """A signed-in client that sends the CSRF header, as the app does."""
    csrf = authenticated_client.cookies.get("XSRF-TOKEN")
    assert csrf
    authenticated_client.headers["X-CSRF-Token"] = csrf
    return authenticated_client


def stored(db: Session) -> list[Feedback]:
    return list(db.scalars(select(Feedback)))


class TestSubmitting:
    def test_stores_the_message_and_its_context(
        self, client: TestClient, db_session: Session
    ) -> None:
        resp = client.post(ENDPOINT, json=VALID)

        assert resp.status_code == 201
        [row] = stored(db_session)
        assert resp.json() == {"id": row.id}
        assert row.message == SECRET_MESSAGE
        assert row.category == "inaccurate"
        assert row.route == "/teaching/:bankId"
        assert row.release == "abc1234"
        assert row.viewport == "390x844"
        assert row.breadcrumbs[0]["pattern"] == "/teaching/:bankId"
        assert row.status == "new"
        assert row.error_name is None
        assert row.error_code is None

    def test_attributes_the_sender_from_the_session(
        self, client: TestClient, db_session: Session, test_user: User
    ) -> None:
        client.post(ENDPOINT, json=VALID)

        [row] = stored(db_session)
        assert row.user_id == test_user.id

    def test_accepts_a_message_alone(
        self, client: TestClient, db_session: Session
    ) -> None:
        """Everything but the message is optional, category included."""
        resp = client.post(ENDPOINT, json={"message": "Captions lag"})

        assert resp.status_code == 201
        [row] = stored(db_session)
        assert row.category is None
        assert row.route == ""

    def test_records_the_error_it_was_sent_from(
        self, client: TestClient, db_session: Session
    ) -> None:
        resp = client.post(
            ENDPOINT,
            json={
                **VALID,
                "error_name": "TypeError",
                "error_code": "BANK_NOT_FOUND",
            },
        )

        assert resp.status_code == 201
        [row] = stored(db_session)
        assert row.error_name == "TypeError"
        assert row.error_code == "BANK_NOT_FOUND"

    def test_trims_the_message(
        self, client: TestClient, db_session: Session
    ) -> None:
        client.post(ENDPOINT, json={"message": "  Captions lag \n"})

        [row] = stored(db_session)
        assert row.message == "Captions lag"

    def test_redacts_an_identifier_in_the_captured_route(
        self, client: TestClient, db_session: Session
    ) -> None:
        """The route gets the error reports' server-side backstop.

        The browser sends the matched pattern, but this end cannot trust
        that, and a resolved URL would carry an NHS number into the table.
        """
        client.post(
            ENDPOINT, json={**VALID, "route": "/patients/943 476 5919"}
        )

        [row] = stored(db_session)
        assert "943" not in row.route


class TestRefusing:
    def test_refuses_a_signed_out_caller(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        resp = test_client.post(ENDPOINT, json=VALID)

        assert resp.status_code == 401
        assert stored(db_session) == []

    def test_refuses_a_missing_csrf_token(
        self, authenticated_client: TestClient, db_session: Session
    ) -> None:
        resp = authenticated_client.post(ENDPOINT, json=VALID)

        assert resp.status_code == 403
        assert stored(db_session) == []

    @pytest.mark.parametrize(
        "body",
        [
            pytest.param({}, id="no message"),
            pytest.param({"message": ""}, id="empty message"),
            pytest.param({"message": "   \n "}, id="blank message"),
            pytest.param(
                {"message": "x" * (MAX_MESSAGE + 1)}, id="over-long message"
            ),
            pytest.param(
                {"message": "hi", "category": "complaint"},
                id="unknown category",
            ),
            pytest.param(
                {"message": "hi", "route": "/" + "a" * 300},
                id="over-long route",
            ),
            pytest.param(
                {"message": "hi", "error_code": "CODE 1974-03-02"},
                id="error code with separators",
            ),
        ],
    )
    def test_refuses_an_invalid_body(
        self,
        client: TestClient,
        db_session: Session,
        body: dict[str, object],
    ) -> None:
        resp = client.post(ENDPOINT, json=body)

        assert resp.status_code == 422
        assert stored(db_session) == []

    def test_refuses_a_caller_supplied_user_id(
        self, client: TestClient, db_session: Session
    ) -> None:
        """Rejected outright, not ignored: see ``FeedbackIn``."""
        resp = client.post(ENDPOINT, json={**VALID, "user_id": 999})

        assert resp.status_code == 422
        assert stored(db_session) == []


class TestLogging:
    def test_never_logs_the_message(
        self, client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Every logger, every level, every structured field."""
        with caplog.at_level(logging.DEBUG):
            resp = client.post(ENDPOINT, json=VALID)

        assert resp.status_code == 201
        for record in caplog.records:
            assert SECRET_MESSAGE not in record.getMessage()
            assert SECRET_MESSAGE not in str(record.__dict__)

    def test_does_not_log_the_message_when_refused(
        self, client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """A validation failure must not echo the body into the logs."""
        with caplog.at_level(logging.DEBUG):
            resp = client.post(
                ENDPOINT, json={**VALID, "category": "complaint"}
            )

        assert resp.status_code == 422
        for record in caplog.records:
            assert SECRET_MESSAGE not in str(record.__dict__)


def test_schema_categories_match_the_model() -> None:
    assert set(typing.get_args(FeedbackCategory)) == set(FEEDBACK_CATEGORIES)


def test_schema_statuses_match_the_model() -> None:
    assert set(typing.get_args(FeedbackStatus)) == set(FEEDBACK_STATUSES)


def add_feedback(
    db: Session,
    user: User | None,
    message: str,
    status: str = "new",
    created_at: datetime | None = None,
) -> Feedback:
    row = Feedback(
        user_id=user.id if user else None,
        category="broken",
        message=message,
        route="/teaching",
        release="abc1234",
        viewport="390x844",
        user_agent="Mozilla/5.0",
        breadcrumbs=[],
        status=status,
    )
    if created_at is not None:
        row.created_at = created_at
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestListing:
    def test_lists_newest_first_with_the_sender(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        older = add_feedback(
            db_session, test_user, "older", created_at=datetime(2026, 1, 1)
        )
        newer = add_feedback(
            db_session, test_user, "newer", created_at=datetime(2026, 2, 1)
        )

        resp = authenticated_superadmin_client.get(ENDPOINT)

        assert resp.status_code == 200
        items = resp.json()["items"]
        assert [i["id"] for i in items] == [newer.id, older.id]
        assert items[0]["message"] == "newer"
        assert items[0]["sender"] == test_user.username
        assert items[0]["status"] == "new"

    def test_filters_by_status(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        add_feedback(db_session, test_user, "open")
        add_feedback(db_session, test_user, "done", status="resolved")

        resp = authenticated_superadmin_client.get(
            ENDPOINT, params={"status": "resolved"}
        )

        assert [i["message"] for i in resp.json()["items"]] == ["done"]

    def test_shows_no_sender_once_they_are_deleted(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        add_feedback(db_session, None, "orphaned")

        resp = authenticated_superadmin_client.get(ENDPOINT)

        assert resp.json()["items"][0]["sender"] is None

    def test_refuses_an_unknown_status_filter(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        resp = authenticated_superadmin_client.get(
            ENDPOINT, params={"status": "closed"}
        )

        assert resp.status_code == 422

    def test_refuses_somebody_who_is_not_an_operator(
        self, authenticated_admin_client: TestClient, db_session: Session
    ) -> None:
        """``manage_users`` is not enough: it is scoped to a place."""
        add_feedback(db_session, None, "private")

        resp = authenticated_admin_client.get(ENDPOINT)

        assert resp.status_code == 403
        assert "private" not in resp.text

    def test_refuses_a_signed_out_caller(
        self, test_client: TestClient
    ) -> None:
        assert test_client.get(ENDPOINT).status_code == 401


class TestReadingOne:
    def test_returns_one_in_full(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        row = add_feedback(db_session, test_user, "Captions lag")

        resp = authenticated_superadmin_client.get(f"{ENDPOINT}/{row.id}")

        assert resp.status_code == 200
        assert resp.json()["message"] == "Captions lag"
        assert resp.json()["user_agent"] == "Mozilla/5.0"

    def test_says_not_found_for_a_missing_id(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        resp = authenticated_superadmin_client.get(f"{ENDPOINT}/9999")

        assert resp.status_code == 404

    def test_refuses_somebody_who_is_not_an_operator(
        self, authenticated_admin_client: TestClient, db_session: Session
    ) -> None:
        row = add_feedback(db_session, None, "private")

        resp = authenticated_admin_client.get(f"{ENDPOINT}/{row.id}")

        assert resp.status_code == 403


class TestChangingStatus:
    def test_changes_the_status_and_nothing_else(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        row = add_feedback(db_session, test_user, "Captions lag")

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}", json={"status": "resolved"}
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "resolved"
        db_session.refresh(row)
        assert row.status == "resolved"
        assert row.message == "Captions lag"

    def test_refuses_an_unknown_status(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        row = add_feedback(db_session, None, "x")

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}", json={"status": "closed"}
        )

        assert resp.status_code == 422

    def test_refuses_changing_anything_but_the_status(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        row = add_feedback(db_session, None, "original")

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}",
            json={"status": "resolved", "message": "edited"},
        )

        assert resp.status_code == 422
        db_session.refresh(row)
        assert row.message == "original"

    def test_says_not_found_for_a_missing_id(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/9999", json={"status": "resolved"}
        )

        assert resp.status_code == 404

    def test_refuses_somebody_who_is_not_an_operator(
        self, authenticated_admin_client: TestClient, db_session: Session
    ) -> None:
        row = add_feedback(db_session, None, "x")

        resp = authenticated_admin_client.patch(
            f"{ENDPOINT}/{row.id}", json={"status": "resolved"}
        )

        assert resp.status_code == 403
        db_session.refresh(row)
        assert row.status == "new"
