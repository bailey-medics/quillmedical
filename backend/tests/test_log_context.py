"""Tests for structured logging context propagation."""

import logging

from app.log_context import (
    RequestContextFilter,
    request_id_var,
    user_id_var,
)


class TestRequestContextFilter:
    """Verify the logging filter injects context vars into records."""

    def setup_method(self) -> None:
        self.filter = RequestContextFilter()

    def _make_record(self) -> logging.LogRecord:
        return logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test message",
            args=None,
            exc_info=None,
        )

    def test_filter_adds_request_id_when_set(self) -> None:
        token = request_id_var.set("abc123")
        try:
            record = self._make_record()
            self.filter.filter(record)
            assert record.request_id == "abc123"  # type: ignore[attr-defined]
        finally:
            request_id_var.reset(token)

    def test_filter_adds_user_id_when_set(self) -> None:
        token = user_id_var.set("user-uuid-456")
        try:
            record = self._make_record()
            self.filter.filter(record)
            assert record.user_id == "user-uuid-456"  # type: ignore[attr-defined]
        finally:
            user_id_var.reset(token)

    def test_filter_returns_none_when_not_set(self) -> None:
        record = self._make_record()
        self.filter.filter(record)
        assert record.request_id is None  # type: ignore[attr-defined]
        assert record.user_id is None  # type: ignore[attr-defined]


def test_request_id_in_response_header(test_client) -> None:  # type: ignore[no-untyped-def]
    """Middleware should return X-Request-ID in response headers."""
    response = test_client.get("/api/health")
    assert "x-request-id" in response.headers
    assert len(response.headers["x-request-id"]) >= 8
