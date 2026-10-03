# cspell:ignore svix whsec
"""Resend telling Quill that a contact changed."""

import base64
import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import SecretStr
from sqlalchemy import select

from app.config import settings
from app.marketing import router as marketing_router
from app.marketing.resend_contacts import MarketingSyncError
from app.models import MarketingPreferenceChange, User

SECRET_BYTES = b"a-signing-secret-for-tests"
SECRET = "whsec_" + base64.b64encode(SECRET_BYTES).decode()
URL = "/api/marketing/resend-webhook"


def _signed(event, *, secret=SECRET_BYTES, at=None):
    """A webhook request body and the headers Resend would sign it with."""
    body = json.dumps(event)
    message_id = "msg_1"
    timestamp = str(int(at if at is not None else time.time()))
    digest = hmac.new(
        secret, f"{message_id}.{timestamp}.{body}".encode(), hashlib.sha256
    ).digest()
    return {
        "content": body,
        "headers": {
            "content-type": "application/json",
            "svix-id": message_id,
            "svix-timestamp": timestamp,
            "svix-signature": "v1," + base64.b64encode(digest).decode(),
        },
    }


def _event(kind, email, *, unsubscribed=False):
    return {
        "type": kind,
        "created_at": "2026-10-03T12:00:00.000Z",
        "data": {
            "id": "c_1",
            "audience_id": "a_1",
            "segment_ids": [],
            "created_at": "2026-10-01T12:00:00.000Z",
            "updated_at": "2026-10-03T12:00:00.000Z",
            "email": email,
            "unsubscribed": unsubscribed,
        },
    }


@pytest.fixture
def webhook(monkeypatch):
    """The webhook configured, with Resend's topics answered from here."""
    state = {
        "subscription": "opt_in",
        "then": [],
        "error": False,
        "asked": 0,
        "waited": 0,
    }

    def topic_subscription(email):
        state["asked"] += 1
        if state["error"]:
            raise MarketingSyncError("Resend refused: HTTP 500")
        # "then" holds later answers, for a read that lags behind a write.
        if state["asked"] > 1 and state["then"]:
            return state["then"].pop(0)
        return state["subscription"]

    def no_wait(seconds):
        state["waited"] += 1

    monkeypatch.setattr(marketing_router.time, "sleep", no_wait)

    monkeypatch.setattr(
        settings, "RESEND_WEBHOOK_SECRET", SecretStr(SECRET + "\n")
    )
    monkeypatch.setattr(marketing_router, "is_configured", lambda: True)
    monkeypatch.setattr(
        marketing_router, "topic_subscription", topic_subscription
    )
    return state


@pytest.fixture
def subscriber(db_session):
    user = User(
        username="ada",
        email="ada@example.com",
        password_hash="x",
        email_verified=True,
        marketing_emails=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


def _changes(db_session, user):
    return list(
        db_session.execute(
            select(MarketingPreferenceChange).where(
                MarketingPreferenceChange.user_id == user.id
            )
        )
        .scalars()
        .all()
    )


class TestAnUnsubscribe:
    def test_from_the_topic_switches_the_person_off(
        self, test_client, db_session, webhook, subscriber
    ):
        webhook["subscription"] = "opt_out"

        response = test_client.post(
            URL, **_signed(_event("contact.updated", "ada@example.com"))
        )

        assert response.status_code == 200
        assert response.json() == {"status": "updated"}
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is False
        assert subscriber.marketing_synced_at is not None
        [row] = _changes(db_session, subscriber)
        assert row.source == "resend"
        assert row.wants_marketing is False
        assert row.wording_version is None

    def test_from_everything_needs_no_second_question(
        self, test_client, db_session, webhook, subscriber
    ):
        """Globally unsubscribed is an answer by itself."""
        response = test_client.post(
            URL,
            **_signed(
                _event("contact.updated", "ada@example.com", unsubscribed=True)
            ),
        )

        assert response.json() == {"status": "updated"}
        assert webhook["asked"] == 0
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is False

    def test_finds_the_person_whatever_the_case_of_the_address(
        self, test_client, db_session, webhook, subscriber
    ):
        webhook["subscription"] = "opt_out"

        response = test_client.post(
            URL, **_signed(_event("contact.updated", "Ada@Example.com"))
        )

        assert response.json() == {"status": "updated"}

    def test_a_repeat_writes_no_second_row(
        self, test_client, db_session, webhook, subscriber
    ):
        webhook["subscription"] = "opt_out"
        request = _signed(_event("contact.updated", "ada@example.com"))

        test_client.post(URL, **request)
        response = test_client.post(URL, **request)

        # The first event recorded that Resend and Quill agree, so a
        # repeat straight after it is taken as an echo and not read.
        assert response.json() == {"status": "ignored"}
        assert len(_changes(db_session, subscriber)) == 1


class TestAResubscribe:
    def test_switches_the_person_back_on(
        self, test_client, db_session, webhook, subscriber
    ):
        subscriber.marketing_emails = False
        db_session.commit()

        response = test_client.post(
            URL, **_signed(_event("contact.updated", "ada@example.com"))
        )

        assert response.json() == {"status": "updated"}
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True


class TestADeletedContact:
    def test_switches_the_person_off_and_asks_for_a_resync(
        self, test_client, db_session, webhook, subscriber
    ):
        """The retry puts them back, opted out, so the refusal is held."""
        response = test_client.post(
            URL, **_signed(_event("contact.deleted", "ada@example.com"))
        )

        assert response.json() == {"status": "updated"}
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is False
        assert subscriber.marketing_synced_at is None


class TestWhatIsIgnored:
    def test_an_address_with_no_account(
        self, test_client, db_session, webhook, subscriber
    ):
        response = test_client.post(
            URL, **_signed(_event("contact.updated", "visitor@example.com"))
        )

        assert response.status_code == 200
        assert response.json() == {"status": "ignored"}
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True

    def test_an_event_about_something_else(
        self, test_client, db_session, webhook, subscriber
    ):
        response = test_client.post(
            URL, **_signed(_event("email.delivered", "ada@example.com"))
        )

        assert response.json() == {"status": "ignored"}
        assert _changes(db_session, subscriber) == []

    def test_a_topic_resend_holds_no_answer_for(
        self, test_client, db_session, webhook, subscriber
    ):
        webhook["subscription"] = None

        response = test_client.post(
            URL, **_signed(_event("contact.updated", "ada@example.com"))
        )

        assert response.json() == {"status": "ignored"}
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True


class TestWhenResendsReadIsBehindItsWrite:
    """Found against the real service: a read lags a write by a second."""

    def test_an_unsubscribe_the_first_read_missed_is_caught_by_the_second(
        self, test_client, db_session, webhook, subscriber
    ):
        webhook["subscription"] = "opt_in"
        webhook["then"] = ["opt_out"]

        response = test_client.post(
            URL, **_signed(_event("contact.updated", "ada@example.com"))
        )

        assert response.json() == {"status": "updated"}
        assert webhook["asked"] == 2
        assert webhook["waited"] == 1
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is False

    def test_a_first_read_that_shows_the_change_is_not_asked_again(
        self, test_client, db_session, webhook, subscriber
    ):
        webhook["subscription"] = "opt_out"

        test_client.post(
            URL, **_signed(_event("contact.updated", "ada@example.com"))
        )

        assert webhook["asked"] == 1
        assert webhook["waited"] == 0

    def test_resend_repeating_back_what_quill_just_sent_changes_nothing(
        self, test_client, db_session, webhook, subscriber
    ):
        """Somebody opts in; the echo must not read a stale 'out'."""
        subscriber.marketing_synced_at = datetime.now(UTC)
        db_session.commit()
        webhook["subscription"] = "opt_out"

        response = test_client.post(
            URL, **_signed(_event("contact.updated", "ada@example.com"))
        )

        assert response.json() == {"status": "ignored"}
        assert webhook["asked"] == 0
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True
        assert _changes(db_session, subscriber) == []

    def test_an_event_long_after_the_last_sync_is_acted_on(
        self, test_client, db_session, webhook, subscriber
    ):
        subscriber.marketing_synced_at = datetime.now(UTC) - timedelta(
            minutes=5
        )
        db_session.commit()
        webhook["subscription"] = "opt_out"

        response = test_client.post(
            URL, **_signed(_event("contact.updated", "ada@example.com"))
        )

        assert response.json() == {"status": "updated"}

    def test_a_full_unsubscribe_just_after_a_sync_is_still_acted_on(
        self, test_client, db_session, webhook, subscriber
    ):
        """Quill never unsubscribes a contact from everything itself."""
        subscriber.marketing_synced_at = datetime.now(UTC)
        db_session.commit()

        response = test_client.post(
            URL,
            **_signed(
                _event("contact.updated", "ada@example.com", unsubscribed=True)
            ),
        )

        assert response.json() == {"status": "updated"}

    def test_a_deletion_just_after_a_sync_is_still_acted_on(
        self, test_client, db_session, webhook, subscriber
    ):
        subscriber.marketing_synced_at = datetime.now(UTC)
        db_session.commit()

        response = test_client.post(
            URL, **_signed(_event("contact.deleted", "ada@example.com"))
        )

        assert response.json() == {"status": "updated"}


class TestTheSignature:
    def test_a_wrong_one_is_refused_and_changes_nothing(
        self, test_client, db_session, webhook, subscriber
    ):
        webhook["subscription"] = "opt_out"

        response = test_client.post(
            URL,
            **_signed(
                _event("contact.updated", "ada@example.com"),
                secret=b"somebody-else",
            ),
        )

        assert response.status_code == 401
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True
        assert webhook["asked"] == 0

    def test_a_missing_one_is_refused(self, test_client, webhook, subscriber):
        response = test_client.post(
            URL, json=_event("contact.updated", "ada@example.com")
        )

        assert response.status_code == 401

    def test_an_old_one_is_refused(self, test_client, webhook, subscriber):
        """A captured request cannot be played back later."""
        response = test_client.post(
            URL,
            **_signed(
                _event("contact.updated", "ada@example.com"),
                at=time.time() - 3600,
            ),
        )

        assert response.status_code == 401

    def test_a_changed_body_is_refused(self, test_client, webhook, subscriber):
        request = _signed(_event("contact.updated", "ada@example.com"))
        request["content"] = request["content"].replace("ada@", "eve@")

        response = test_client.post(URL, **request)

        assert response.status_code == 401


class TestWhenItCannotAnswer:
    def test_no_secret_is_a_503(
        self, test_client, webhook, subscriber, monkeypatch
    ):
        monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", None)

        response = test_client.post(
            URL, **_signed(_event("contact.updated", "ada@example.com"))
        )

        assert response.status_code == 503

    def test_resend_not_answering_is_a_502_so_it_is_sent_again(
        self, test_client, db_session, webhook, subscriber
    ):
        webhook["error"] = True

        response = test_client.post(
            URL, **_signed(_event("contact.updated", "ada@example.com"))
        )

        assert response.status_code == 502
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True
        assert _changes(db_session, subscriber) == []
