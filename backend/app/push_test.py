"""Tests for push notification subscription endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import PushSubscription, User
from app.push import is_push_host


def _csrf(client: TestClient) -> dict[str, str]:
    """The header a page sends with a request that changes something."""
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


class TestPushSubscription:
    """Test push notification subscription endpoint."""

    def test_subscribe_requires_auth(self, test_client: TestClient):
        """Test push subscription requires authentication."""
        response = test_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://fcm.googleapis.com/fcm/send/123",
                "expirationTime": None,
                "keys": {
                    "p256dh": "test_p256dh_key",
                    "auth": "test_auth_key",
                },
            },
        )
        assert response.status_code == 401

    def test_subscribe_without_the_csrf_token_is_refused(
        self, authenticated_client: TestClient
    ):
        """Another site must not be able to register a device for
        somebody's notifications."""
        response = authenticated_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://fcm.googleapis.com/fcm/send/123",
                "expirationTime": None,
                "keys": {"p256dh": "test_p256dh_key", "auth": "test_auth_key"},
            },
        )

        assert response.status_code == 403
        assert response.json()["detail"] == "CSRF failed"

    def test_subscribe_success(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test successful push subscription."""
        response = authenticated_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://fcm.googleapis.com/fcm/send/123",
                "expirationTime": None,
                "keys": {
                    "p256dh": "test_p256dh_key",
                    "auth": "test_auth_key",
                },
            },
            headers=_csrf(authenticated_client),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["count"] == 1

        # Verify persisted in DB
        sub = db_session.query(PushSubscription).first()
        assert sub is not None
        assert sub.endpoint == "https://fcm.googleapis.com/fcm/send/123"
        assert sub.user_id == test_user.id
        assert sub.keys_p256dh == "test_p256dh_key"  # gitleaks:allow
        assert sub.keys_auth == "test_auth_key"

    def test_subscribe_duplicate_endpoint(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test subscribing with same endpoint doesn't create duplicate."""
        subscription = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/456",
            "expirationTime": None,
            "keys": {
                "p256dh": "test_p256dh_key",
                "auth": "test_auth_key",
            },
        }

        # Subscribe twice
        response1 = authenticated_client.post(
            "/api/push/subscribe",
            json=subscription,
            headers=_csrf(authenticated_client),
        )
        response2 = authenticated_client.post(
            "/api/push/subscribe",
            json=subscription,
            headers=_csrf(authenticated_client),
        )

        assert response1.status_code == 200
        assert response2.status_code == 200
        # Should only have one subscription
        assert response2.json()["count"] == 1

        # Verify only one row in DB
        count = db_session.query(PushSubscription).count()
        assert count == 1

    def test_subscribe_updates_keys_on_duplicate(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test subscribing with same endpoint updates keys."""
        authenticated_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://fcm.googleapis.com/fcm/send/789",
                "keys": {
                    "p256dh": "old_p256dh",
                    "auth": "old_auth",
                },
            },
            headers=_csrf(authenticated_client),
        )

        # Subscribe again with new keys
        authenticated_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://fcm.googleapis.com/fcm/send/789",
                "keys": {
                    "p256dh": "new_p256dh",
                    "auth": "new_auth",
                },
            },
            headers=_csrf(authenticated_client),
        )

        sub = db_session.query(PushSubscription).first()
        assert sub is not None
        assert sub.keys_p256dh == "new_p256dh"  # gitleaks:allow
        assert sub.keys_auth == "new_auth"

    def test_subscribe_multiple_endpoints(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test subscribing multiple different endpoints."""
        for i in range(3):
            response = authenticated_client.post(
                "/api/push/subscribe",
                json={
                    "endpoint": f"https://fcm.googleapis.com/fcm/send/{i}",
                    "expirationTime": None,
                    "keys": {
                        "p256dh": f"test_p256dh_key_{i}",
                        "auth": f"test_auth_key_{i}",
                    },
                },
                headers=_csrf(authenticated_client),
            )
            assert response.status_code == 200

        # Should have 3 subscriptions in DB
        count = db_session.query(PushSubscription).count()
        assert count == 3

    def test_subscribe_with_expiration(
        self,
        authenticated_client: TestClient,
        test_user: User,
    ):
        """Test subscription with expiration time."""
        response = authenticated_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://fcm.googleapis.com/fcm/send/exp",
                "expirationTime": 1234567890,
                "keys": {
                    "p256dh": "test_p256dh_key",
                    "auth": "test_auth_key",
                },
            },
            headers=_csrf(authenticated_client),
        )

        assert response.status_code == 200
        assert response.json()["ok"] is True

    def test_subscribe_missing_fields(self, authenticated_client: TestClient):
        """Test subscription with missing required fields."""
        response = authenticated_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://fcm.googleapis.com/fcm/send/missing",
                # Missing keys
            },
            headers=_csrf(authenticated_client),
        )
        # Should return validation error
        assert response.status_code == 422


def _body(endpoint: str, **extra: object) -> dict[str, object]:
    """A subscription as the frontend sends it, at a given address."""
    return {
        "endpoint": endpoint,
        "expirationTime": None,
        "keys": {"p256dh": "test_p256dh_key", "auth": "test_auth_key"},
        **extra,
    }


class TestTheEndpointMustBeAPushService:
    """The sender calls whatever address is stored, so only a push
    service's address may be stored."""

    @pytest.mark.parametrize(
        "endpoint",
        [
            "https://fcm.googleapis.com/fcm/send/abc:def",
            "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
            "https://web.push.apple.com/QGuQyavXutnMH",
            "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAC",
            "https://FCM.googleapis.com/fcm/send/abc",
            "https://fcm.googleapis.com:443/fcm/send/abc",
        ],
    )
    def test_a_push_service_address_is_stored(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        endpoint: str,
    ):
        response = authenticated_client.post(
            "/api/push/subscribe",
            json=_body(endpoint),
            headers=_csrf(authenticated_client),
        )

        assert response.status_code == 200
        assert db_session.query(PushSubscription).one().endpoint == endpoint

    @pytest.mark.parametrize(
        "endpoint",
        [
            # Somebody else's server, and this one's own neighbours.
            "https://example.com/hook",
            "https://localhost/admin",
            "https://169.254.169.254/latest/meta-data/",
            "https://10.0.0.5/internal",
            # Not HTTPS.
            "http://fcm.googleapis.com/fcm/send/abc",
            "ftp://fcm.googleapis.com/fcm/send/abc",
            # A push service's name used to dress up another host.
            "https://fcm.googleapis.com.example.com/fcm/send/abc",
            "https://web.push.apple.com.example/abc",
            "https://notify.windows.com.example.org/w/",
            "https://example.com/?next=https://fcm.googleapis.com/",
            "https://fcm.googleapis.com@example.com/fcm/send/abc",
            "https://user:pass@fcm.googleapis.com/fcm/send/abc",
            # The bare domain is not one of its hosts.
            "https://push.apple.com.evil.test/abc",
            "https://my-push.apple.com/abc",
            # A host the check and the sender would read differently:
            # to one it ends in a push service's domain, to the other
            # it stops at the backslash.
            "https://example.com\\.push.apple.com/abc",
            "https://10.0.0.5\\.notify.windows.com/w/",
            "https://example.com\\@fcm.googleapis.com/fcm/send/abc",
            "https://example.com%2e.push.apple.com/abc",
            "https://example.com%00.push.apple.com/abc",
            "https://example.com\t.push.apple.com/abc",
            "https://example.com .push.apple.com/abc",
            "https://example.com\n.push.apple.com/abc",
            "https://exаmple.push.apple.com/abc",
            "https://[::1]\\.push.apple.com/abc",
            # Another port on the right host.
            "https://fcm.googleapis.com:8443/fcm/send/abc",
            "https://fcm.googleapis.com:notaport/fcm/send/abc",
            # Not an address at all.
            "fcm.googleapis.com/fcm/send/abc",
            "",
        ],
    )
    def test_any_other_address_is_refused_and_nothing_is_stored(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        endpoint: str,
    ):
        response = authenticated_client.post(
            "/api/push/subscribe",
            json=_body(endpoint),
            headers=_csrf(authenticated_client),
        )

        assert response.status_code == 422
        assert db_session.query(PushSubscription).count() == 0

    def test_an_address_longer_than_any_real_one_is_refused(
        self, authenticated_client: TestClient
    ):
        endpoint = "https://fcm.googleapis.com/fcm/send/" + "a" * 2000

        response = authenticated_client.post(
            "/api/push/subscribe",
            json=_body(endpoint),
            headers=_csrf(authenticated_client),
        )

        assert response.status_code == 422

    def test_a_refusal_logs_the_host_and_not_the_address(
        self,
        authenticated_client: TestClient,
        caplog: pytest.LogCaptureFixture,
    ):
        """The host is how a push service's new address gets noticed.
        The rest of the address identifies one browser."""
        with caplog.at_level("WARNING", logger="app.push"):
            authenticated_client.post(
                "/api/push/subscribe",
                json=_body("https://new-push.example.net/secret-token-123"),
                headers=_csrf(authenticated_client),
            )

        assert "host=new-push.example.net" in caplog.text
        assert "secret-token-123" not in caplog.text


class TestTheBodyHoldsOnlyWhatIsNamed:
    def test_a_field_the_model_does_not_name_is_refused(
        self, authenticated_client: TestClient, db_session: Session
    ):
        response = authenticated_client.post(
            "/api/push/subscribe",
            json=_body(
                "https://fcm.googleapis.com/fcm/send/abc", options={"x": 1}
            ),
            headers=_csrf(authenticated_client),
        )

        assert response.status_code == 422
        assert db_session.query(PushSubscription).count() == 0

    def test_a_key_the_model_does_not_name_is_refused(
        self, authenticated_client: TestClient
    ):
        body = _body("https://fcm.googleapis.com/fcm/send/abc")
        body["keys"] = {"p256dh": "a", "auth": "b", "extra": "c"}

        response = authenticated_client.post(
            "/api/push/subscribe",
            json=body,
            headers=_csrf(authenticated_client),
        )

        assert response.status_code == 422

    @pytest.mark.parametrize(
        "keys",
        [
            {"p256dh": "a" * 101, "auth": "b"},
            {"p256dh": "a", "auth": "b" * 41},
            {"p256dh": "", "auth": "b"},
            {"p256dh": "not base64!", "auth": "b"},
            {"p256dh": "a", "auth": "<script>"},
        ],
    )
    def test_a_key_of_the_wrong_size_or_shape_is_refused(
        self, authenticated_client: TestClient, keys: dict[str, str]
    ):
        body = _body("https://fcm.googleapis.com/fcm/send/abc")
        body["keys"] = keys

        response = authenticated_client.post(
            "/api/push/subscribe",
            json=body,
            headers=_csrf(authenticated_client),
        )

        assert response.status_code == 422

    def test_keys_of_the_size_a_browser_sends_are_taken(
        self, authenticated_client: TestClient
    ):
        body = _body("https://fcm.googleapis.com/fcm/send/abc")
        body["keys"] = {"p256dh": "B" * 87, "auth": "c" * 22}

        response = authenticated_client.post(
            "/api/push/subscribe",
            json=body,
            headers=_csrf(authenticated_client),
        )

        assert response.status_code == 200


class TestIsPushHost:
    @pytest.mark.parametrize(
        "host",
        [
            "fcm.googleapis.com",
            "updates.push.services.mozilla.com",
            "web.push.apple.com",
            "wns2-par02p.notify.windows.com",
            "FCM.GoogleAPIs.com",
        ],
    )
    def test_knows_the_push_services(self, host: str):
        assert is_push_host(host)

    @pytest.mark.parametrize(
        "host",
        [
            "",
            "example.com",
            "googleapis.com",
            "storage.googleapis.com",
            "push.apple.com",
            "notify.windows.com",
            "my-push.apple.com",
            "fcm.googleapis.com.example.com",
            "example.com\\.push.apple.com",
            "example.com%2e.push.apple.com",
            "example.com/.push.apple.com",
            "example.com .push.apple.com",
            ".push.apple.com",
        ],
    )
    def test_refuses_everything_else(self, host: str):
        assert not is_push_host(host)


class TestTheSenderAgreesOnTheHost:
    """The check is only worth having if the client that sends the
    notification reads the same host out of the address as the check
    did. This asks that client's own parser."""

    @pytest.mark.parametrize(
        "endpoint",
        [
            "https://fcm.googleapis.com/fcm/send/abc:def",
            "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
            "https://web.push.apple.com/QGuQyavXutnMH",
            "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAC%2F",
        ],
    )
    def test_for_every_address_the_check_lets_through(self, endpoint: str):
        from urllib.parse import urlsplit

        from urllib3.util import parse_url

        ours = urlsplit(endpoint).hostname

        assert is_push_host(ours or "")
        assert parse_url(endpoint).host == ours
