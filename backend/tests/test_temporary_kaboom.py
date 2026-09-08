"""Tests for the temporary /api/kaboom endpoint.

Delete this file together with the endpoint. The name says temporary so that
a search for it finds both halves, rather than leaving a test asserting the
behaviour of something that no longer exists.
"""

from fastapi.testclient import TestClient

ENDPOINT = "/api/kaboom"


class TestKaboom:
    """What the alert needs from it, and nothing more."""

    def test_returns_500(self, test_client: TestClient) -> None:
        assert test_client.get(ENDPOINT).status_code == 500

    def test_needs_no_session(self, test_client: TestClient) -> None:
        """Signed out, so it can be driven with curl from anywhere.

        `test_client` carries no authentication cookie, so a 500 here is the
        assertion: an endpoint behind the usual guard would answer 401.
        """
        response = test_client.get(ENDPOINT)

        assert response.status_code == 500
        assert response.status_code != 401

    def test_returns_an_empty_body(self, test_client: TestClient) -> None:
        """Nothing is read or written, so there is nothing to leak.

        Worth asserting rather than assuming: the point of this endpoint is to
        be inert apart from its status code, and a stray body would be the
        first sign it had grown into something else.
        """
        assert test_client.get(ENDPOINT).content == b""

    def test_is_absent_from_the_published_schema(
        self, test_client: TestClient
    ) -> None:
        """`include_in_schema=False`, so it is not part of the API contract.

        This keeps it out of the generated client and out of the compatibility
        diff, which would otherwise record adding and removing it as two
        breaking changes to review.
        """
        schema = test_client.get("/api/openapi.json")

        if schema.status_code == 200:
            assert ENDPOINT not in schema.json().get("paths", {})
