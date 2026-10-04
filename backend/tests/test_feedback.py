"""Tests for submitting user feedback."""

import logging
import typing
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, Feedback, User
from app.schemas.feedback import (
    MAX_COMMENT,
    MAX_MESSAGE,
    FeedbackCategory,
    FeedbackStatus,
    FeedbackUpdateIn,
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


class TestTellingAnOperator:
    """The configured address is told, with a link and without the words."""

    @pytest.fixture
    def sent(self, monkeypatch: pytest.MonkeyPatch) -> list[dict[str, object]]:
        """Capture what would be sent, in place of sending it."""
        calls: list[dict[str, object]] = []
        monkeypatch.setattr(
            "app.feedback.router.send_email",
            lambda **kwargs: calls.append(kwargs),
        )
        return calls

    def test_tells_the_configured_address(
        self,
        client: TestClient,
        test_user: User,
        sent: list[dict[str, object]],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            "app.feedback.router.settings.FEEDBACK_NOTIFY_EMAIL",
            "ops@example.test",
        )

        resp = client.post(ENDPOINT, json=VALID)

        assert resp.status_code == 201
        assert len(sent) == 1
        email = sent[0]
        assert email["to"] == "ops@example.test"
        assert test_user.username in str(email["subject"])
        text = str(email["text_body"])
        assert f"/admin/feedback/{resp.json()['id']}" in text
        assert "Something is wrong or inaccurate" in text
        assert "/teaching/:bankId" in text

    def test_the_email_never_carries_the_message(
        self,
        client: TestClient,
        sent: list[dict[str, object]],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Not in the subject, the HTML or the plain text."""
        monkeypatch.setattr(
            "app.feedback.router.settings.FEEDBACK_NOTIFY_EMAIL",
            "ops@example.test",
        )

        resp = client.post(ENDPOINT, json=VALID)

        assert resp.status_code == 201
        assert len(sent) == 1
        for value in sent[0].values():
            assert SECRET_MESSAGE not in str(value)
            assert "Example-Leak" not in str(value)

    def test_tells_nobody_when_no_address_is_set(
        self, client: TestClient, sent: list[dict[str, object]]
    ) -> None:
        resp = client.post(ENDPOINT, json=VALID)

        assert resp.status_code == 201
        assert sent == []

    def test_a_failure_to_send_leaves_the_feedback_stored(
        self,
        client: TestClient,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        monkeypatch.setattr(
            "app.feedback.router.settings.FEEDBACK_NOTIFY_EMAIL",
            "ops@example.test",
        )

        def fail(**kwargs: object) -> None:
            raise RuntimeError("mail service down")

        monkeypatch.setattr("app.feedback.router.send_email", fail)

        with caplog.at_level(logging.DEBUG):
            resp = client.post(ENDPOINT, json=VALID)

        assert resp.status_code == 201
        assert len(stored(db_session)) == 1
        for record in caplog.records:
            assert SECRET_MESSAGE not in record.getMessage()
            assert SECRET_MESSAGE not in str(record.__dict__)


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


def test_update_schema_still_lists_the_statuses() -> None:
    """``status`` is optional, but its statuses stay a plain list.

    The breaking-change check compares this schema with the one on
    ``main``. A nullable ``status`` would hide the list inside an anyOf,
    which it reports as every status having been removed.
    """
    schema = FeedbackUpdateIn.model_json_schema()

    assert schema["properties"]["status"]["enum"] == list(FEEDBACK_STATUSES)
    assert "status" not in schema.get("required", [])


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

    def test_refuses_a_null_status(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        row = add_feedback(db_session, None, "x")

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}", json={"status": None}
        )

        assert resp.status_code == 422

    def test_refuses_a_body_that_changes_nothing(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        row = add_feedback(db_session, None, "x")

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}", json={}
        )

        assert resp.status_code == 422

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


class TestCommenting:
    def test_saves_a_comment_and_leaves_the_status_alone(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        row = add_feedback(
            db_session, test_user, "Captions lag", status="acknowledged"
        )

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}",
            json={"comment": "  Fixed in the next release.  "},
        )

        assert resp.status_code == 200
        assert resp.json()["comment"] == "Fixed in the next release."
        assert resp.json()["status"] == "acknowledged"
        db_session.refresh(row)
        assert row.operator_comment == "Fixed in the next release."
        assert row.status == "acknowledged"
        assert row.message == "Captions lag"

    def test_keeps_the_line_breaks_inside_a_comment(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        """An update is added as a new line, so the lines are the content."""
        row = add_feedback(db_session, None, "x")
        comment = "We will look into this.\nUpdate 05/10/26: fixed."

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}", json={"comment": f"{comment}\n"}
        )

        assert resp.status_code == 200
        assert resp.json()["comment"] == comment

    def test_changing_the_status_leaves_the_comment_alone(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        row = add_feedback(db_session, None, "x")
        row.operator_comment = "Looking into it."
        db_session.commit()

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}", json={"status": "resolved"}
        )

        assert resp.status_code == 200
        assert resp.json()["comment"] == "Looking into it."

    def test_saves_a_status_and_a_comment_together(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        row = add_feedback(db_session, None, "x")

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}",
            json={"status": "wont_fix", "comment": "Works as designed."},
        )

        assert resp.status_code == 200
        db_session.refresh(row)
        assert row.status == "wont_fix"
        assert row.operator_comment == "Works as designed."

    @pytest.mark.parametrize("blank", [None, "", "   "])
    def test_a_blank_comment_removes_it(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        blank: str | None,
    ) -> None:
        row = add_feedback(db_session, None, "x")
        row.operator_comment = "Looking into it."
        db_session.commit()

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}", json={"comment": blank}
        )

        assert resp.status_code == 200
        assert resp.json()["comment"] is None
        db_session.refresh(row)
        assert row.operator_comment is None

    def test_refuses_a_comment_that_is_too_long(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        row = add_feedback(db_session, None, "x")

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}", json={"comment": "x" * (MAX_COMMENT + 1)}
        )

        assert resp.status_code == 422

    def test_refuses_somebody_who_is_not_an_operator(
        self, client: TestClient, db_session: Session
    ) -> None:
        row = add_feedback(db_session, None, "x")

        resp = client.patch(
            f"{ENDPOINT}/{row.id}", json={"comment": "Not mine to write"}
        )

        assert resp.status_code == 403
        db_session.refresh(row)
        assert row.operator_comment is None

    def test_never_logs_the_comment(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        row = add_feedback(db_session, None, "x")

        with caplog.at_level(logging.DEBUG):
            resp = authenticated_superadmin_client.patch(
                f"{ENDPOINT}/{row.id}", json={"comment": SECRET_MESSAGE}
            )

        assert resp.status_code == 200
        for record in caplog.records:
            assert SECRET_MESSAGE not in record.getMessage()
            assert SECRET_MESSAGE not in str(record.__dict__)

    def test_the_sender_sees_the_comment(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        row = add_feedback(db_session, test_user, "x")
        row.operator_comment = "Fixed in the next release."
        db_session.commit()

        resp = authenticated_client.get(f"{ENDPOINT}/mine")

        assert resp.json()["items"][0]["comment"] == (
            "Fixed in the next release."
        )


class TestReadingYourOwn:
    MINE = f"{ENDPOINT}/mine"

    def test_returns_only_the_callers_own_newest_first(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
        test_admin: User,
    ) -> None:
        older = add_feedback(
            db_session, test_user, "older", created_at=datetime(2026, 1, 1)
        )
        newer = add_feedback(
            db_session,
            test_user,
            "newer",
            status="resolved",
            created_at=datetime(2026, 2, 1),
        )
        add_feedback(db_session, test_admin, "somebody else's")

        resp = authenticated_client.get(self.MINE)

        assert resp.status_code == 200
        items = resp.json()["items"]
        assert [i["id"] for i in items] == [newer.id, older.id]
        assert items[0]["status"] == "resolved"
        assert items[0]["message"] == "newer"

    def test_leaves_out_the_captured_context(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        add_feedback(db_session, test_user, "x")

        resp = authenticated_client.get(self.MINE)

        assert set(resp.json()["items"][0]) == {
            "id",
            "status",
            "comment",
            "category",
            "message",
            "created_at",
        }

    def test_is_empty_for_somebody_who_has_sent_nothing(
        self, authenticated_client: TestClient
    ) -> None:
        resp = authenticated_client.get(self.MINE)

        assert resp.json() == {"items": []}

    def test_refuses_a_signed_out_caller(
        self, test_client: TestClient
    ) -> None:
        assert test_client.get(self.MINE).status_code == 401

    def test_is_not_mistaken_for_an_id(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        """Even an operator, who may read by id, gets their own list."""
        resp = authenticated_superadmin_client.get(self.MINE)

        assert resp.status_code == 200
        assert "items" in resp.json()


class TestRepliesWaitingOnTheSender:
    """A reply waits from when it is written until the sender looks."""

    MINE_SEEN = f"{ENDPOINT}/mine/seen"
    INBOX = "/api/inbox"

    @pytest.fixture
    def sent(self, monkeypatch: pytest.MonkeyPatch) -> list[dict[str, object]]:
        calls: list[dict[str, object]] = []
        monkeypatch.setattr(
            "app.feedback.router.send_email",
            lambda **kwargs: calls.append(kwargs),
        )
        return calls

    def _reply(
        self, db: Session, row: Feedback, text: str = "Fixed, thank you."
    ) -> None:
        """Write a reply the way the route does, without signing in twice."""
        row.operator_comment = text
        row.operator_comment_at = datetime.now(UTC)
        db.commit()

    def _waiting(self, client: TestClient) -> int:
        body = client.get(self.INBOX).json()
        return sum(
            item["count"]
            for item in body["items"]
            if item["source"] == "feedback_reply"
        )

    def test_saving_a_comment_stamps_it_and_emails_the_sender(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
        sent: list[dict[str, object]],
    ) -> None:
        row = add_feedback(db_session, test_user, SECRET_MESSAGE)

        resp = authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}", json={"comment": "Fixed: Example-Reply"}
        )

        assert resp.status_code == 200
        db_session.refresh(row)
        assert row.operator_comment_at is not None
        assert len(sent) == 1
        assert sent[0]["to"] == test_user.email
        assert "/feedback" in str(sent[0]["text_body"])
        for value in sent[0].values():
            assert "Example-Reply" not in str(value)
            assert "Example-Leak" not in str(value)

    def test_saving_the_same_comment_again_tells_nobody(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
        sent: list[dict[str, object]],
    ) -> None:
        row = add_feedback(db_session, test_user, "x")
        for _ in range(2):
            authenticated_superadmin_client.patch(
                f"{ENDPOINT}/{row.id}", json={"comment": "Fixed."}
            )

        assert len(sent) == 1

    def test_a_change_of_status_alone_tells_nobody(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
        sent: list[dict[str, object]],
    ) -> None:
        row = add_feedback(db_session, test_user, "x")

        authenticated_superadmin_client.patch(
            f"{ENDPOINT}/{row.id}", json={"status": "resolved"}
        )

        assert sent == []
        db_session.refresh(row)
        assert row.operator_comment_at is None

    def test_a_reply_waits_until_the_sender_looks(
        self, client: TestClient, db_session: Session, test_user: User
    ) -> None:
        row = add_feedback(db_session, test_user, "x")
        assert self._waiting(client) == 0

        self._reply(db_session, row)
        assert self._waiting(client) == 1

        resp = client.post(self.MINE_SEEN)

        assert resp.status_code == 200
        assert resp.json() == {"seen": 1}
        assert self._waiting(client) == 0

    def test_a_reply_changed_afterwards_waits_again(
        self, client: TestClient, db_session: Session, test_user: User
    ) -> None:
        row = add_feedback(db_session, test_user, "x")
        self._reply(db_session, row)
        client.post(self.MINE_SEEN)
        assert self._waiting(client) == 0

        db_session.refresh(row)
        row.operator_comment = "Fixed.\nUpdate: released today."
        row.operator_comment_at = datetime.now(UTC) + timedelta(seconds=5)
        db_session.commit()

        assert self._waiting(client) == 1

    def test_looking_stamps_only_the_callers_own(
        self,
        client: TestClient,
        db_session: Session,
        test_user: User,
        test_superadmin: User,
    ) -> None:
        theirs = add_feedback(db_session, test_superadmin, "x")
        self._reply(db_session, theirs)

        resp = client.post(self.MINE_SEEN)

        assert resp.json() == {"seen": 0}
        db_session.refresh(theirs)
        assert theirs.comment_seen_at is None

    def test_the_lines_say_there_is_a_reply_and_never_what_it_says(
        self, client: TestClient, db_session: Session, test_user: User
    ) -> None:
        row = add_feedback(db_session, test_user, SECRET_MESSAGE, "resolved")
        self._reply(db_session, row, "Fixed: Example-Reply")

        waiting = client.get(f"{self.INBOX}/items")

        items = waiting.json()["items"]
        assert [item["source"] for item in items] == ["feedback_reply"]
        assert items[0]["title"] == "Reply to your feedback"
        assert items[0]["status"] == "Fixed"
        assert "Example-Reply" not in waiting.text
        assert "Example-Leak" not in waiting.text

        client.post(self.MINE_SEEN)

        assert client.get(f"{self.INBOX}/items").json() == {"items": []}
        done = client.get(f"{self.INBOX}/items", params={"done": True})
        assert [item["id"] for item in done.json()["items"]] == [row.id]

    def test_looking_needs_a_csrf_token(
        self, authenticated_client: TestClient
    ) -> None:
        assert authenticated_client.post(self.MINE_SEEN).status_code == 403

    def test_looking_refuses_a_signed_out_caller(
        self, test_client: TestClient
    ) -> None:
        assert test_client.post(self.MINE_SEEN).status_code == 401
