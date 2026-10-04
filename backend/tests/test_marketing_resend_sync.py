"""Telling Resend what somebody chose, with Resend stubbed."""

import json
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from pydantic import SecretStr

from app.config import settings
from app.marketing import resend_contacts
from app.marketing.resend_contacts import (
    MarketingSyncError,
    remove_contact,
    sync_contact,
)
from app.marketing.sync import sync_unsynced, unsynced_users
from app.models import User
from app.security import create_email_verify_token

SEGMENT = "seg_123"
TOPIC = "top_456"


class FakeResend:
    """Resend's contact routes, answering from a dict of contacts."""

    def __init__(self):
        self.contacts: dict[str, dict] = {}
        self.calls: list[tuple[str, str, object]] = []
        self.fail_with: int | None = None
        self.unreachable = False
        #: How many of the next requests stall before one answers.
        self.stalls = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.unreachable:
            raise httpx.ConnectError("no route", request=request)
        if self.stalls > 0:
            self.stalls -= 1
            raise httpx.ReadTimeout("too slow", request=request)
        body: Any = json.loads(request.content) if request.content else None
        path = request.url.path
        self.calls.append((request.method, path, body))
        assert request.headers["authorization"] == "Bearer re_contacts"
        if self.fail_with is not None:
            return httpx.Response(self.fail_with, json={"message": "no"})

        if request.method == "GET" and path == "/contacts":
            # The list, a page at a time. A contact's id here is its
            # address, which is enough to page by.
            segment = request.url.params.get("segment_id")
            limit = int(request.url.params.get("limit", "100"))
            after = request.url.params.get("after")
            emails = sorted(
                e
                for e, c in self.contacts.items()
                if segment in c.get("segments", [])
            )
            if after is not None:
                emails = [e for e in emails if e > after]
            page = emails[:limit]
            return httpx.Response(
                200,
                json={
                    "object": "list",
                    "has_more": len(emails) > limit,
                    "data": [
                        {
                            "id": e,
                            "email": e,
                            "unsubscribed": self.contacts[e].get(
                                "unsubscribed"
                            )
                            is True,
                        }
                        for e in page
                    ],
                },
            )

        if request.method == "POST" and path == "/contacts":
            self.contacts[body["email"]] = {
                "segments": [s["id"] for s in body["segments"]],
                "topics": {t["id"]: t["subscription"] for t in body["topics"]},
                "unsubscribed": body.get("unsubscribed"),
                "first_name": body.get("first_name"),
                "last_name": body.get("last_name"),
            }
            return httpx.Response(201, json={"id": "c_1"})

        email = path.split("/")[2]
        contact = self.contacts.get(email)
        if request.method == "DELETE":
            if contact is None:
                return httpx.Response(404, json={"message": "not found"})
            del self.contacts[email]
            return httpx.Response(200, json={"deleted": True})
        if contact is None:
            return httpx.Response(404, json={"message": "not found"})
        if request.method == "GET" and path.endswith("/topics"):
            return httpx.Response(
                200,
                json={
                    "object": "list",
                    "data": [
                        {"id": topic, "subscription": subscription}
                        for topic, subscription in contact["topics"].items()
                    ],
                },
            )
        if request.method == "GET":
            return httpx.Response(200, json={"id": "c_1"})
        if request.method == "PATCH" and not path.endswith("/topics"):
            contact.update(body)
            return httpx.Response(200, json={"id": "c_1"})
        if request.method == "POST" and "/segments/" in path:
            contact["segments"].append(path.rsplit("/", 1)[1])
            return httpx.Response(200, json={"id": "c_1"})
        if request.method == "PATCH" and path.endswith("/topics"):
            for topic in body:
                contact["topics"][topic["id"]] = topic["subscription"]
            return httpx.Response(200, json={"id": "c_1"})
        return httpx.Response(500, json={"message": "unexpected"})


@pytest.fixture
def fake_resend(monkeypatch):
    """Resend configured, and answering from memory."""
    fake = FakeResend()
    monkeypatch.setattr(
        settings, "RESEND_CONTACTS_API_KEY", SecretStr("re_contacts\n")
    )
    monkeypatch.setattr(settings, "RESEND_NEWSLETTER_SEGMENT_ID", SEGMENT)
    monkeypatch.setattr(settings, "RESEND_NEWSLETTER_TOPIC_ID", TOPIC)
    monkeypatch.setattr(
        resend_contacts,
        "_client",
        lambda config: httpx.Client(
            base_url=resend_contacts.RESEND_API_URL,
            headers={"Authorization": f"Bearer {config.api_key}"},
            transport=httpx.MockTransport(fake.handler),
        ),
    )
    return fake


def _person(db_session, name, *, wants=True, verified=True, active=True):
    user = User(
        username=name,
        email=f"{name}@example.com",
        full_name="Ada Mary Lovelace",
        password_hash="x",
        email_verified=verified,
        is_active=active,
        marketing_emails=wants,
    )
    db_session.add(user)
    db_session.commit()
    return user


class TestTheConnection:
    """The real client, not the stub: how it reaches Resend."""

    def _real_client(self):
        return resend_contacts._client(
            resend_contacts._Config(
                api_key="re_contacts", segment_id=SEGMENT, topic_id=TOPIC
            )
        )

    def test_connects_over_ipv4_only(self):
        """Cloud Run has no IPv6 route out, and Resend has IPv6 addresses.

        Each one tried is a whole connect timeout spent before an IPv4
        address is reached, which made a Settings save take ten seconds.
        """
        with self._real_client() as client:
            pool = client._transport._pool

        assert pool._local_address == "0.0.0.0"

    def test_gives_up_on_a_connection_sooner_than_on_an_answer(self):
        with self._real_client() as client:
            assert client.timeout.connect == 2.0
            assert client.timeout.read == 5.0


class TestSyncingSomebodyNew:
    def test_creates_the_contact_opted_in(self, db_session, fake_resend):
        user = _person(db_session, "ada")

        assert sync_contact(user) is True

        contact = fake_resend.contacts["ada@example.com"]
        assert contact["segments"] == [SEGMENT]
        assert contact["topics"] == {TOPIC: "opt_in"}
        assert contact["first_name"] == "Ada"
        assert contact["last_name"] == "Mary Lovelace"
        assert user.marketing_synced_at is not None

    def test_somebody_who_opted_out_is_sent_as_opted_out(
        self, db_session, fake_resend
    ):
        """Resend holds the refusal, so an import cannot subscribe them."""
        user = _person(db_session, "ada", wants=False)

        sync_contact(user)

        assert fake_resend.contacts["ada@example.com"]["topics"] == {
            TOPIC: "opt_out"
        }

    def test_sends_nothing_but_the_address_and_name(
        self, db_session, fake_resend
    ):
        user = _person(db_session, "ada")

        sync_contact(user)

        [(_, _, _), (_, _, body)] = fake_resend.calls
        assert set(body) == {
            "email",
            "first_name",
            "last_name",
            "unsubscribed",
            "segments",
            "topics",
        }

    def test_somebody_with_no_name_is_sent_without_one(
        self, db_session, fake_resend
    ):
        user = _person(db_session, "ada")
        user.full_name = None

        sync_contact(user)

        body = fake_resend.calls[-1][2]
        assert "first_name" not in body
        assert "last_name" not in body


class TestTheContactsOwnSwitch:
    """Resend checks this one when a broadcast names no topic."""

    def test_somebody_new_who_wants_news_is_subscribed(
        self, db_session, fake_resend
    ):
        sync_contact(_person(db_session, "ada"))

        assert fake_resend.contacts["ada@example.com"]["unsubscribed"] is False

    def test_somebody_new_who_refused_is_unsubscribed(
        self, db_session, fake_resend
    ):
        sync_contact(_person(db_session, "ada", wants=False))

        assert fake_resend.contacts["ada@example.com"]["unsubscribed"] is True

    def test_follows_a_change_of_mind_both_ways(self, db_session, fake_resend):
        user = _person(db_session, "ada")
        sync_contact(user)

        user.marketing_emails = False
        sync_contact(user)
        contact = fake_resend.contacts["ada@example.com"]
        assert contact["unsubscribed"] is True
        assert contact["topics"] == {TOPIC: "opt_out"}

        user.marketing_emails = True
        sync_contact(user)
        assert contact["unsubscribed"] is False
        assert contact["topics"] == {TOPIC: "opt_in"}


class TestSyncingSomebodyResendAlreadyKnows:
    def test_sets_the_topic_and_the_segment(self, db_session, fake_resend):
        fake_resend.contacts["ada@example.com"] = {
            "segments": [],
            "topics": {TOPIC: "opt_in"},
        }
        user = _person(db_session, "ada", wants=False)

        sync_contact(user)

        contact = fake_resend.contacts["ada@example.com"]
        assert contact["topics"] == {TOPIC: "opt_out"}
        assert contact["segments"] == [SEGMENT]

    def test_repeating_it_changes_nothing(self, db_session, fake_resend):
        user = _person(db_session, "ada")

        sync_contact(user)
        sync_contact(user)

        assert fake_resend.contacts["ada@example.com"]["topics"] == {
            TOPIC: "opt_in"
        }


class TestWhenResendCannotBeTold:
    def test_a_refusal_raises_and_leaves_the_mark_empty(
        self, db_session, fake_resend
    ):
        fake_resend.fail_with = 500
        user = _person(db_session, "ada")

        with pytest.raises(MarketingSyncError, match="HTTP 500"):
            sync_contact(user)

        assert user.marketing_synced_at is None

    def test_an_unreachable_resend_raises_without_the_address(
        self, db_session, fake_resend
    ):
        fake_resend.unreachable = True
        user = _person(db_session, "ada")

        with pytest.raises(MarketingSyncError) as caught:
            sync_contact(user)

        assert "ada" not in str(caught.value)
        assert user.marketing_synced_at is None

    def test_unset_settings_send_nothing(
        self, db_session, fake_resend, monkeypatch
    ):
        monkeypatch.setattr(settings, "RESEND_NEWSLETTER_TOPIC_ID", None)
        user = _person(db_session, "ada")

        assert sync_contact(user) is False
        assert fake_resend.calls == []
        assert user.marketing_synced_at is None


class TestWhenResendStalls:
    """Seen in production: one request in thirty takes too long, once."""

    def test_one_stall_is_tried_again_and_the_sync_succeeds(
        self, db_session, fake_resend
    ):
        user = _person(db_session, "ada", wants=False)
        fake_resend.stalls = 1

        assert sync_contact(user) is True

        contact = fake_resend.contacts["ada@example.com"]
        assert contact["topics"] == {TOPIC: "opt_out"}
        assert contact["unsubscribed"] is True
        assert user.marketing_synced_at is not None

    def test_a_stall_part_way_through_starts_again_from_the_top(
        self, db_session, fake_resend, monkeypatch
    ):
        """The second try looks first, so nothing is done twice over."""
        user = _person(db_session, "ada")
        sync_contact(user)
        user.marketing_emails = False
        fake_resend.calls.clear()

        # Let the look-up and the segment through, then stall once.
        answered = {"count": 0}
        real = fake_resend.handler

        def stall_on_the_third(request):
            answered["count"] += 1
            if answered["count"] == 3:
                raise httpx.ReadTimeout("too slow", request=request)
            return real(request)

        monkeypatch.setattr(
            resend_contacts,
            "_client",
            lambda config: httpx.Client(
                base_url=resend_contacts.RESEND_API_URL,
                headers={"Authorization": f"Bearer {config.api_key}"},
                transport=httpx.MockTransport(stall_on_the_third),
            ),
        )

        assert sync_contact(user) is True

        contact = fake_resend.contacts["ada@example.com"]
        assert contact["topics"] == {TOPIC: "opt_out"}
        assert contact["unsubscribed"] is True
        assert contact["segments"].count(SEGMENT) >= 1

    def test_two_stalls_give_up(self, db_session, fake_resend):
        user = _person(db_session, "ada")
        fake_resend.stalls = 2

        with pytest.raises(MarketingSyncError, match="ReadTimeout"):
            sync_contact(user)

        assert user.marketing_synced_at is None

    def test_a_refusal_is_not_tried_again(self, db_session, fake_resend):
        fake_resend.fail_with = 500
        user = _person(db_session, "ada")

        with pytest.raises(MarketingSyncError, match="HTTP 500"):
            sync_contact(user)

        assert len(fake_resend.calls) == 1

    def test_a_connection_that_cannot_be_made_is_not_tried_again(
        self, db_session, fake_resend, monkeypatch
    ):
        fake_resend.unreachable = True
        attempts = {"count": 0}
        real = fake_resend.handler

        def counting(request):
            attempts["count"] += 1
            return real(request)

        monkeypatch.setattr(
            resend_contacts,
            "_client",
            lambda config: httpx.Client(
                base_url=resend_contacts.RESEND_API_URL,
                transport=httpx.MockTransport(counting),
            ),
        )
        user = _person(db_session, "ada")

        with pytest.raises(MarketingSyncError, match="ConnectError"):
            sync_contact(user)

        assert attempts["count"] == 1

    def test_reading_a_topic_is_tried_again_too(self, fake_resend):
        from app.marketing.resend_contacts import topic_subscription

        fake_resend.contacts["ada@example.com"] = {
            "segments": [SEGMENT],
            "topics": {TOPIC: "opt_out"},
        }
        fake_resend.stalls = 1

        assert topic_subscription("ada@example.com") == "opt_out"

    def test_removing_a_contact_is_tried_again_too(
        self, db_session, fake_resend
    ):
        user = _person(db_session, "ada")
        sync_contact(user)
        fake_resend.stalls = 1

        assert remove_contact(user.email) is True
        assert fake_resend.contacts == {}


class TestRemovingAContact:
    def test_takes_them_off_the_list(self, db_session, fake_resend):
        user = _person(db_session, "ada")
        sync_contact(user)

        assert remove_contact(user.email) is True

        assert fake_resend.contacts == {}

    def test_somebody_resend_never_had_is_not_an_error(self, fake_resend):
        assert remove_contact("nobody@example.com") is True

    def test_unset_settings_send_nothing(self, fake_resend, monkeypatch):
        monkeypatch.setattr(settings, "RESEND_CONTACTS_API_KEY", None)

        assert remove_contact("ada@example.com") is False
        assert fake_resend.calls == []


class TestVerifyingAnAddress:
    def test_syncs_the_person(self, test_client, db_session, fake_resend):
        user = _person(db_session, "ada", verified=False)

        response = test_client.post(
            "/api/auth/verify-email",
            json={"token": create_email_verify_token(user.email)},
        )

        assert response.status_code == 200
        assert "ada@example.com" in fake_resend.contacts
        db_session.refresh(user)
        assert user.marketing_synced_at is not None

    def test_still_verifies_when_resend_is_down(
        self, test_client, db_session, fake_resend
    ):
        fake_resend.fail_with = 503
        user = _person(db_session, "ada", verified=False)

        response = test_client.post(
            "/api/auth/verify-email",
            json={"token": create_email_verify_token(user.email)},
        )

        assert response.status_code == 200
        db_session.refresh(user)
        assert user.email_verified is True
        assert user.marketing_synced_at is None

    def test_an_unverified_person_is_never_sent(
        self, test_client, db_session, fake_resend
    ):
        _person(db_session, "ada", verified=False)

        test_client.post("/api/auth/verify-email", json={"token": "forged"})

        assert fake_resend.calls == []


class TestTheRetry:
    def test_picks_up_only_verified_active_unsynced_people(
        self, db_session, fake_resend
    ):
        waiting = _person(db_session, "waiting")
        _person(db_session, "unverified", verified=False)
        _person(db_session, "closed", active=False)
        done = _person(db_session, "done")
        done.marketing_synced_at = datetime.now(UTC)
        db_session.commit()

        assert unsynced_users(db_session) == [waiting]

    def test_syncs_them_and_counts(self, db_session, fake_resend):
        _person(db_session, "one")
        _person(db_session, "two", wants=False)

        assert sync_unsynced(db_session) == (2, 0)
        assert unsynced_users(db_session) == []
        assert set(fake_resend.contacts) == {
            "one@example.com",
            "two@example.com",
        }

    def test_carries_on_past_a_failure(self, db_session, fake_resend):
        _person(db_session, "one")
        fake_resend.fail_with = 500

        assert sync_unsynced(db_session) == (0, 1)
        assert len(unsynced_users(db_session)) == 1


class TestClosingAnAccount:
    def test_takes_the_person_off_the_list(
        self, authenticated_superadmin_client, db_session, fake_resend
    ):
        user = _person(db_session, "ada")
        sync_contact(user)
        db_session.commit()

        response = authenticated_superadmin_client.post(
            f"/api/users/{user.id}/deactivate"
        )

        assert response.status_code == 200
        assert fake_resend.contacts == {}
        db_session.refresh(user)
        assert user.marketing_synced_at is None

    def test_still_closes_when_resend_is_down(
        self, authenticated_superadmin_client, db_session, fake_resend
    ):
        user = _person(db_session, "ada")
        fake_resend.fail_with = 503

        response = authenticated_superadmin_client.post(
            f"/api/users/{user.id}/deactivate"
        )

        assert response.status_code == 200
        db_session.refresh(user)
        assert user.is_active is False


class TestReadingATopic:
    def test_says_what_resend_holds(self, db_session, fake_resend):
        from app.marketing.resend_contacts import topic_subscription

        fake_resend.contacts["ada@example.com"] = {
            "segments": [SEGMENT],
            "topics": {TOPIC: "opt_out", "top_other": "opt_in"},
        }

        assert topic_subscription("ada@example.com") == "opt_out"

    def test_is_none_for_somebody_resend_does_not_have(self, fake_resend):
        from app.marketing.resend_contacts import topic_subscription

        assert topic_subscription("nobody@example.com") is None

    def test_is_none_when_the_topic_is_not_listed(self, fake_resend):
        from app.marketing.resend_contacts import topic_subscription

        fake_resend.contacts["ada@example.com"] = {
            "segments": [],
            "topics": {"top_other": "opt_in"},
        }

        assert topic_subscription("ada@example.com") is None
