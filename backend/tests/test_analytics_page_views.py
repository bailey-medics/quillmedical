"""Tests for the page view ingest endpoint.

Counts sessions rather than people, and carries a matched route pattern
rather than a URL. The browser builds that pattern from the router's own
params, so an identifier is removed because the router said it was one; these
tests check the bound that holds if a caller is not the application.
"""

import logging

import pytest
from fastapi.testclient import TestClient

from app.analytics.router import PAGE_VIEW_TYPE
from app.main import limiter
from app.models import User

ENDPOINT = "/api/analytics/page-views"

VALID_VIEW = {"page": "/patients/:id", "session_id": "s7f3a9b2c1d4e5f6"}


class TestAcceptsPageViews:
    def test_accepts_a_matched_pattern(self, test_client: TestClient) -> None:
        resp = test_client.post(ENDPOINT, json=VALID_VIEW)

        assert resp.status_code == 204

    def test_accepts_without_authentication(
        self, test_client: TestClient
    ) -> None:
        """Public pages are worth counting too."""
        resp = test_client.post(ENDPOINT, json={"page": "/login"})

        assert resp.status_code == 204

    @pytest.mark.parametrize(
        "page",
        ["/", "/admin/users", "/patients/:id/letters/:letterId", "/:splat"],
    )
    def test_accepts_the_shapes_the_router_produces(
        self, test_client: TestClient, page: str
    ) -> None:
        resp = test_client.post(ENDPOINT, json={"page": page})

        assert resp.status_code == 204


class TestRejectsAnythingThatIsNotAPattern:
    """A pattern has had its captured values replaced by their names.

    Anything still carrying one is not a pattern, and is refused rather than
    scrubbed — the browser has no legitimate reason to send it.
    """

    @pytest.mark.parametrize(
        "page",
        [
            "/patients/abc123",
            "/patients/943 476 5919",
            "https://teaching.quill-medical.com/patients/42",
            "/search?nhs=9434765919",
            "/patients/Jane_Doe",
            "Patient record",
            "",
        ],
    )
    def test_rejects_a_page_that_is_not_pattern_shaped(
        self, test_client: TestClient, page: str
    ) -> None:
        resp = test_client.post(ENDPOINT, json={"page": page})

        assert resp.status_code == 422

    def test_rejects_an_unknown_field(self, test_client: TestClient) -> None:
        resp = test_client.post(
            ENDPOINT, json={**VALID_VIEW, "title": "Patient record"}
        )

        assert resp.status_code == 422

    def test_rejects_a_session_id_that_is_not_opaque(
        self, test_client: TestClient
    ) -> None:
        resp = test_client.post(
            ENDPOINT, json={**VALID_VIEW, "session_id": "943 476 5919"}
        )

        assert resp.status_code == 422


class TestLogShape:
    def test_logs_the_page_and_session(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=VALID_VIEW)

        record = caplog.records[0]
        assert getattr(record, "@type", None) == "quill.analytics.PageView"
        assert getattr(record, "page", None) == "/patients/:id"
        assert getattr(record, "session_id", None) == "s7f3a9b2c1d4e5f6"

    def test_no_identity_is_recorded(
        self,
        authenticated_client: TestClient,
        test_user: User,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """A signed-in caller leaves nothing behind that names them."""
        with caplog.at_level(logging.INFO, logger="app.analytics.router"):
            authenticated_client.post(ENDPOINT, json=VALID_VIEW)

        record = caplog.records[0]
        # Substring-matching the id would prove nothing here: it is "1",
        # which occurs in timestamps and line numbers.
        assert getattr(record, "user_id", None) is None
        assert not hasattr(record, "user")
        assert not hasattr(record, "signed_in")

    def test_signed_in_and_signed_out_views_are_indistinguishable(
        self,
        test_client: TestClient,
        authenticated_client: TestClient,
        test_user: User,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """The endpoint does not read the cookie, so the same page opened by
        a signed-in and a signed-out caller logs identically.

        This is the property the dropped `signed_in` field used to claim to
        measure. It could not: tracking runs only inside `RequireAuth`, so
        the field was always true and the distinction never existed.
        """
        interesting = ("@type", "page", "session_id", "signed_in", "user_id")

        def attributes(record: logging.LogRecord) -> dict[str, object]:
            return {
                key: getattr(record, key)
                for key in interesting
                if hasattr(record, key)
            }

        with caplog.at_level(logging.INFO, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=VALID_VIEW)
            authenticated_client.post(ENDPOINT, json=VALID_VIEW)

        # Selected by marker rather than by position: `caplog` captures every
        # logger, and the authenticated request emits records of its own.
        views = [
            record
            for record in caplog.records
            if getattr(record, "@type", None) == PAGE_VIEW_TYPE
        ]
        assert len(views) == 2
        anonymous, signed_in = views
        assert attributes(anonymous) == attributes(signed_in)


class TestRateLimit:
    """Higher than the error endpoint: navigating is normal, erroring is not."""

    @pytest.fixture(autouse=True)
    def _enable_limiter(self):
        original = limiter.enabled
        limiter.enabled = True
        yield
        limiter.enabled = original

    def test_beyond_the_limit_is_rejected(
        self, test_client: TestClient
    ) -> None:
        for _ in range(120):
            test_client.post(ENDPOINT, json=VALID_VIEW)

        resp = test_client.post(ENDPOINT, json=VALID_VIEW)

        assert resp.status_code == 429
