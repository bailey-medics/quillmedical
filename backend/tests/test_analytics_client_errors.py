"""Tests for the client error report ingest endpoint."""

import logging

import pytest
from fastapi.testclient import TestClient

from app.main import limiter
from app.models import User

ENDPOINT = "/api/analytics/client-errors"

VALID_REPORT = {
    "name": "TypeError",
    "message": "Cannot read properties of undefined (reading 'name')",
    "stack": "at render (/assets/index-abc.js:12345:67)",
    "component_stack": "\n    in PatientCard\n    in Suspense",
    "release": "abc1234",
    "source": "boundary",
}

#: The same report with every optional field populated.
FULL_REPORT = {
    **VALID_REPORT,
    "error_code": "USER_NOT_FOUND",
    "status": 404,
    "route": "/patients/:id",
    "session_id": "s7f3a9b2c1d4e5f6",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "viewport": "390x844",
    "breadcrumbs": [
        {"type": "route", "ms": 1200, "pattern": "/patients/:id"},
        {
            "type": "api",
            "ms": 1400,
            "method": "GET",
            "pattern": "/api/patients/:id",
            "status": 500,
        },
        {"type": "auth", "ms": 10, "event": "login"},
    ],
}


def logged_text(record: logging.LogRecord) -> str:
    """Everything the record would put into the log, flattened to a string.

    Checking only the message would let a value reach the log through any of
    the structured fields beside it, which is where most of a report now
    travels.
    """
    parts = [record.getMessage()]
    for attr in (
        "serviceContext",
        "context",
        "breadcrumbs",
        "error_code",
        "viewport",
        "error_source",
    ):
        parts.append(str(getattr(record, attr, "")))
    return " ".join(parts)


class TestAcceptsReports:
    """The endpoint takes a well-formed report."""

    def test_accepts_a_valid_report(self, test_client: TestClient) -> None:
        resp = test_client.post(ENDPOINT, json=VALID_REPORT)

        assert resp.status_code == 204

    def test_accepts_without_authentication(
        self, test_client: TestClient
    ) -> None:
        """No session is sent, and none is required.

        The errors most worth knowing about include those on the login and
        registration pages, where there is no session to have.
        """
        assert "session" not in test_client.cookies
        resp = test_client.post(ENDPOINT, json=VALID_REPORT)

        assert resp.status_code == 204

    def test_accepts_a_report_with_only_the_required_fields(
        self, test_client: TestClient
    ) -> None:
        resp = test_client.post(
            ENDPOINT, json={"name": "TypeError", "source": "window"}
        )

        assert resp.status_code == 204


class TestRejectsMalformedReports:
    """Nothing arriving here is trusted, so the schema is strict."""

    def test_rejects_an_unknown_field(self, test_client: TestClient) -> None:
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "url": "/patients/42"}
        )

        assert resp.status_code == 422

    def test_rejects_an_unknown_source(self, test_client: TestClient) -> None:
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "source": "somewhere-else"}
        )

        assert resp.status_code == 422

    def test_rejects_an_over_long_stack(self, test_client: TestClient) -> None:
        """A public endpoint must not be a way to write bulk into the logs."""
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "stack": "x" * 6000}
        )

        assert resp.status_code == 422

    def test_rejects_a_missing_name(self, test_client: TestClient) -> None:
        resp = test_client.post(ENDPOINT, json={"source": "window"})

        assert resp.status_code == 422


class TestLogShape:
    """Cloud Error Reporting only groups entries it recognises."""

    def test_logs_at_error_severity(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=VALID_REPORT)

        assert len(caplog.records) == 1
        assert caplog.records[0].levelno == logging.ERROR

    def test_marks_the_entry_as_a_reported_error_event(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Without this type, Error Reporting treats it as a loose log line."""
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=VALID_REPORT)

        record = caplog.records[0]
        assert getattr(record, "@type", None) == (
            "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1"
            ".ReportedErrorEvent"
        )

    def test_reports_the_browser_as_its_own_service(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """So browser errors group separately from backend ones."""
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=VALID_REPORT)

        context = getattr(caplog.records[0], "serviceContext", {})
        assert context["service"] == "quill-frontend"
        assert context["version"] == "abc1234"

    def test_message_carries_the_type_and_the_stack(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=VALID_REPORT)

        message = caplog.records[0].getMessage()
        assert message.startswith("TypeError: Cannot read properties")
        assert "/assets/index-abc.js:12345:67" in message
        assert "in PatientCard" in message


class TestServerSideRedaction:
    """The browser sanitises, but this endpoint is public and unauthenticated.

    A caller that is not the app can post anything, so patient-shaped strings
    must not reach the logs even when the client sanitiser is bypassed
    entirely.
    """

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("message", "943 476 5919"),
            ("stack", "jane.doe@example.nhs.uk"),
            ("stack", "3f2504e0-4f89-11d3-9a0c-0305e82c3301"),
            ("component_stack", "1974-03-02"),
            ("stack", "https://teaching.quill-medical.com/patients/42"),
            ("release", "SW1A 1AA"),
            ("route", "/patients/943 476 5919"),
            ("user_agent", "jane.doe@example.nhs.uk"),
        ],
    )
    def test_patient_shaped_values_do_not_reach_the_log(
        self,
        test_client: TestClient,
        caplog: pytest.LogCaptureFixture,
        field: str,
        value: str,
    ) -> None:
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json={**VALID_REPORT, field: value})

        assert value not in logged_text(caplog.records[0])

    def test_a_breadcrumb_pattern_is_redacted(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """The one breadcrumb field a caller supplies as free-ish text."""
        crumbs = [
            {"type": "route", "ms": 1, "pattern": "/patients/943 476 5919"}
        ]
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(
                ENDPOINT, json={**VALID_REPORT, "breadcrumbs": crumbs}
            )

        assert "943 476 5919" not in logged_text(caplog.records[0])


class TestRateLimit:
    """A loop in one browser must not be able to flood the logs."""

    @pytest.fixture(autouse=True)
    def _enable_limiter(self):
        original = limiter.enabled
        limiter.enabled = True
        yield
        limiter.enabled = original

    def test_within_the_limit_all_succeed(
        self, test_client: TestClient
    ) -> None:
        for _ in range(30):
            resp = test_client.post(ENDPOINT, json=VALID_REPORT)
            assert resp.status_code == 204

    def test_beyond_the_limit_is_rejected(
        self, test_client: TestClient
    ) -> None:
        for _ in range(30):
            test_client.post(ENDPOINT, json=VALID_REPORT)

        resp = test_client.post(ENDPOINT, json=VALID_REPORT)

        assert resp.status_code == 429


class TestWidenedFields:
    """The report carries more than an error type and a stack."""

    def test_accepts_the_full_report(self, test_client: TestClient) -> None:
        resp = test_client.post(ENDPOINT, json=FULL_REPORT)

        assert resp.status_code == 204

    def test_the_error_code_reaches_the_log(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Both in the header, which Error Reporting groups on, and beside it
        as a structured field, which is what makes it filterable."""
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=FULL_REPORT)

        record = caplog.records[0]
        assert "(USER_NOT_FOUND)" in record.getMessage()
        assert getattr(record, "error_code", None) == "USER_NOT_FOUND"

    def test_the_route_and_status_reach_the_http_request_context(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=FULL_REPORT)

        http = getattr(caplog.records[0], "context", {})["httpRequest"]
        assert http["url"] == "/patients/:id"
        assert http["responseStatusCode"] == 404
        assert "Macintosh" in http["userAgent"]

    def test_breadcrumbs_reach_the_log_in_order(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=FULL_REPORT)

        crumbs = getattr(caplog.records[0], "breadcrumbs", [])
        assert [c["type"] for c in crumbs] == ["route", "api", "auth"]
        assert crumbs[1]["method"] == "GET"
        assert crumbs[2]["event"] == "login"


class TestIdentity:
    """Who a report belongs to is decided by the server, not the caller."""

    def test_a_client_supplied_user_id_is_rejected(
        self, test_client: TestClient
    ) -> None:
        """The endpoint is public, so a body-supplied identifier would let
        anyone attribute an error to any user they chose. Rejected outright
        rather than ignored, so a client cannot believe it was accepted."""
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "user_id": "1"}
        )

        assert resp.status_code == 422

    def test_the_signed_in_user_is_read_from_the_cookie(
        self,
        authenticated_client: TestClient,
        test_user: User,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            authenticated_client.post(ENDPOINT, json=VALID_REPORT)

        context = getattr(caplog.records[0], "context", {})
        assert context["user"] == f"user:{test_user.id}"

    def test_the_signed_in_user_wins_over_a_supplied_session(
        self,
        authenticated_client: TestClient,
        test_user: User,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            authenticated_client.post(ENDPOINT, json=FULL_REPORT)

        context = getattr(caplog.records[0], "context", {})
        assert context["user"] == f"user:{test_user.id}"

    def test_a_signed_out_report_falls_back_to_the_session(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Public pages have no user, but a cascade there is still one visit."""
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=FULL_REPORT)

        context = getattr(caplog.records[0], "context", {})
        assert context["user"] == "session:s7f3a9b2c1d4e5f6"

    def test_nothing_identifying_is_recorded_when_there_is_neither(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(ENDPOINT, json=VALID_REPORT)

        context = getattr(caplog.records[0], "context", {})
        assert "user" not in context

    def test_an_invalid_token_is_treated_as_signed_out(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """A report must still be accepted when the session has gone bad —
        an expired token is one of the things worth hearing about."""
        test_client.cookies.set("access_token", "not-a-real-token")
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            resp = test_client.post(ENDPOINT, json=FULL_REPORT)

        assert resp.status_code == 204
        context = getattr(caplog.records[0], "context", {})
        assert context["user"] == "session:s7f3a9b2c1d4e5f6"


class TestBreadcrumbsAreAllowlisted:
    """Only the three named shapes get through, with no free-text fields."""

    def test_rejects_an_unknown_breadcrumb_type(
        self, test_client: TestClient
    ) -> None:
        crumbs = [{"type": "console", "ms": 1, "text": "a patient name"}]
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "breadcrumbs": crumbs}
        )

        assert resp.status_code == 422

    def test_rejects_a_field_belonging_to_another_breadcrumb_type(
        self, test_client: TestClient
    ) -> None:
        """Discriminating on type is what stops one shape's fields being
        smuggled in under another's name."""
        crumbs = [{"type": "auth", "ms": 1, "event": "login", "status": 500}]
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "breadcrumbs": crumbs}
        )

        assert resp.status_code == 422

    def test_rejects_an_unknown_auth_event(
        self, test_client: TestClient
    ) -> None:
        crumbs = [{"type": "auth", "ms": 1, "event": "something-else"}]
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "breadcrumbs": crumbs}
        )

        assert resp.status_code == 422

    def test_rejects_more_breadcrumbs_than_the_cap(
        self, test_client: TestClient
    ) -> None:
        crumbs = [
            {"type": "route", "ms": 1, "pattern": "/a"} for _ in range(21)
        ]
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "breadcrumbs": crumbs}
        )

        assert resp.status_code == 422


class TestOpaqueFieldsStayOpaque:
    """Fields that exist to be identifiers must not become free text."""

    @pytest.mark.parametrize(
        "session_id",
        ["943 476 5919", "jane.doe@example.nhs.uk", "SW1A 1AA", "a" * 65],
    )
    def test_rejects_a_session_id_that_is_not_opaque(
        self, test_client: TestClient, session_id: str
    ) -> None:
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "session_id": session_id}
        )

        assert resp.status_code == 422

    @pytest.mark.parametrize("viewport", ["390 x 844", "not-a-size", "390x"])
    def test_rejects_a_malformed_viewport(
        self, test_client: TestClient, viewport: str
    ) -> None:
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "viewport": viewport}
        )

        assert resp.status_code == 422

    @pytest.mark.parametrize("status", [99, 600, 0, -1, "not-a-number"])
    def test_rejects_a_status_that_is_not_an_http_code(
        self, test_client: TestClient, status: object
    ) -> None:
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "status": status}
        )

        assert resp.status_code == 422

    def test_coerces_a_numeric_string_status(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Pydantic converts `"404"` rather than rejecting it. Harmless: the
        range check still applies, and the value is the same number."""
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            resp = test_client.post(
                ENDPOINT, json={**VALID_REPORT, "status": "404"}
            )

        assert resp.status_code == 204
        http = getattr(caplog.records[0], "context", {})["httpRequest"]
        assert http["responseStatusCode"] == 404


class TestErrorCodesAreOpaque:
    """A code is a fixed vocabulary, so it is matched rather than scrubbed.

    Scrubbing does not work on this field: the redaction patterns are anchored
    on word boundaries, which do not fire inside a larger token, so
    ``CODE_1974-03-02`` keeps its date. Stripping the separators instead only
    reformats the value — ``CODE_19740302`` — which is why the shape is
    constrained and long digit runs are removed on top.
    """

    @pytest.mark.parametrize(
        "code",
        [
            "CODE_1974-03-02",
            "CODE 943 476 5919",
            "jane.doe@example.nhs.uk",
            "CODE-SW1A 1AA",
        ],
    )
    def test_rejects_a_code_that_is_not_code_shaped(
        self, test_client: TestClient, code: str
    ) -> None:
        resp = test_client.post(
            ENDPOINT, json={**VALID_REPORT, "error_code": code}
        )

        assert resp.status_code == 422

    def test_redacts_a_digit_run_that_survived_the_shape_check(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """A date with its separators already stripped is code-shaped."""
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(
                ENDPOINT, json={**VALID_REPORT, "error_code": "CODE_19740302"}
            )

        assert "19740302" not in logged_text(caplog.records[0])

    def test_keeps_a_real_code_with_a_digit_in_it(
        self, test_client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Codes do carry single digits, so digits cannot simply be dropped."""
        with caplog.at_level(logging.ERROR, logger="app.analytics.router"):
            test_client.post(
                ENDPOINT,
                json={
                    **VALID_REPORT,
                    "error_code": "PRESCRIBE_SCHEDULE_2_DENIED",
                },
            )

        record = caplog.records[0]
        assert getattr(record, "error_code", None) == (
            "PRESCRIBE_SCHEDULE_2_DENIED"
        )
