"""Tests for the client address the rate limits and access log use."""

import pytest
from starlette.requests import Request

from app.client_address import client_address
from app.config import settings
from app.rate_limit import limiter

HEADER = "X-Quill-Client-IP"


def _request(
    headers: dict[str, str], peer: str | None = "10.0.0.9"
) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/health",
        "headers": [
            (name.lower().encode(), value.encode())
            for name, value in headers.items()
        ],
        "client": (peer, 1234) if peer else None,
    }

    return Request(scope)


@pytest.fixture
def behind_the_load_balancer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TRUSTED_CLIENT_IP_HEADER", HEADER)


class TestBehindTheLoadBalancer:
    @pytest.mark.usefixtures("behind_the_load_balancer")
    def test_the_address_the_load_balancer_wrote_is_used(self) -> None:
        request = _request({HEADER: "203.0.113.7"})

        assert client_address(request) == "203.0.113.7"

    @pytest.mark.usefixtures("behind_the_load_balancer")
    def test_a_forwarded_for_the_client_wrote_is_ignored(self) -> None:
        request = _request(
            {
                "X-Forwarded-For": "198.51.100.1, 203.0.113.7, 34.1.1.1",
                HEADER: "203.0.113.7",
            }
        )

        assert client_address(request) == "203.0.113.7"

    @pytest.mark.usefixtures("behind_the_load_balancer")
    def test_two_requests_from_one_client_share_an_address(self) -> None:
        first = _request(
            {"X-Forwarded-For": "198.51.100.1", HEADER: "203.0.113.7"}
        )
        second = _request(
            {"X-Forwarded-For": "198.51.100.2", HEADER: "203.0.113.7"}
        )

        assert client_address(first) == client_address(second)

    @pytest.mark.usefixtures("behind_the_load_balancer")
    def test_a_call_that_skipped_the_load_balancer_uses_its_peer(
        self,
    ) -> None:
        assert client_address(_request({})) == "10.0.0.9"

    @pytest.mark.usefixtures("behind_the_load_balancer")
    def test_a_value_that_is_not_an_address_falls_back_to_the_peer(
        self,
    ) -> None:
        request = _request({HEADER: "not-an-address"})

        assert client_address(request) == "10.0.0.9"

    @pytest.mark.usefixtures("behind_the_load_balancer")
    def test_an_ipv6_address_is_read_and_normalised(self) -> None:
        request = _request({HEADER: "2001:DB8::1"})

        assert client_address(request) == "2001:db8::1"


class TestWithNoTrustedHeader:
    def test_the_header_is_not_trusted_when_the_setting_is_unset(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "TRUSTED_CLIENT_IP_HEADER", None)

        request = _request({HEADER: "203.0.113.7"})

        assert client_address(request) == "10.0.0.9"

    def test_a_request_with_no_peer_still_has_an_address(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "TRUSTED_CLIENT_IP_HEADER", None)

        assert client_address(_request({}, peer=None)) == "127.0.0.1"


def test_the_limiter_is_keyed_on_the_client_address() -> None:
    assert limiter._key_func is client_address
