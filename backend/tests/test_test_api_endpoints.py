"""Tests for the permanent API-compatibility test harness (item 19).

Covers the TEST_API_ENDPOINTS_ENABLED flag default, that the real app (built
with the flag left at its default False, as in every deployment) never
exposes the dummy endpoints, and that the endpoints themselves return the
expected bodies when mounted.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.test_api_endpoints import test_api_router as dummy_test_router


class TestTestApiEndpointsFlag:
    """Configuration-level tests."""

    def test_defaults_false(self):
        """TEST_API_ENDPOINTS_ENABLED defaults to False."""
        from app.config import settings

        assert isinstance(settings.TEST_API_ENDPOINTS_ENABLED, bool)
        assert settings.TEST_API_ENDPOINTS_ENABLED is False


class TestMutateBreakingResponseToggles:
    """Guards the three deliberate-mutation constants used in item 19's
    Phase 2 scenarios — all must be False outside an active test scenario
    PR."""

    def test_defaults_false(self) -> None:
        """All toggles must be False on `main` — guards against
        accidentally merging a PR with a mutation left switched on."""
        from app.test_api_endpoints import (
            MUTATE_REMOVE_DETAIL_1,
            MUTATE_REMOVE_MESSAGE_1,
            MUTATE_REMOVE_SUMMARY_2,
        )

        assert MUTATE_REMOVE_MESSAGE_1 is False
        assert MUTATE_REMOVE_DETAIL_1 is False
        assert MUTATE_REMOVE_SUMMARY_2 is False

    def test_breaking_response_schema_includes_both_fields_by_default(
        self,
    ) -> None:
        """With both toggles at their default, `message` and `detail` are
        both required properties of TestBreakingResponse1's schema (removing
        either, or both at once, is the deliberate breaking-change scenario
        in Phase 2)."""
        from app.test_api_endpoints import TestBreakingResponse1

        schema = TestBreakingResponse1.model_json_schema()
        assert "message" in schema["properties"]
        assert "detail" in schema["properties"]
        assert "message" in schema.get("required", [])
        assert "detail" in schema.get("required", [])

    def test_breaking_response_2_schema_includes_summary_by_default(
        self,
    ) -> None:
        """With the toggle at its default, `summary` is a required
        property of TestBreakingResponse2's schema — lets a single-field
        breaking change be tested on a second, independent endpoint."""
        from app.test_api_endpoints import TestBreakingResponse2

        schema = TestBreakingResponse2.model_json_schema()
        assert "summary" in schema["properties"]
        assert "summary" in schema.get("required", [])


class TestRealAppAbsentByDefault:
    """The real app is built with the flag at its default (False) in tests,
    matching every real deployment — the dummy routes must not exist."""

    def test_non_breaking_api_absent(self, test_client: TestClient) -> None:
        resp = test_client.get("/api/test/non-breaking-api")
        assert resp.status_code == 404

    def test_breaking_api_absent(self, test_client: TestClient) -> None:
        resp = test_client.get("/api/test/breaking-api")
        assert resp.status_code == 404

    def test_breaking_api_2_absent(self, test_client: TestClient) -> None:
        resp = test_client.get("/api/test/breaking-api-2")
        assert resp.status_code == 404


class TestTestApiRouterEndpoints:
    """Behaviour of the three dummy endpoints when mounted (as they are in
    the real app whenever TEST_API_ENDPOINTS_ENABLED is true, e.g. in CI's
    OpenAPI spec dump)."""

    def _client(self) -> TestClient:
        app = FastAPI()
        app.include_router(dummy_test_router, prefix="/api")
        return TestClient(app)

    def test_non_breaking_api_returns_expected_body(self) -> None:
        resp = self._client().get("/api/test/non-breaking-api")
        assert resp.status_code == 200
        assert resp.json() == {
            "message": "This is a test response from the non-breaking api"
        }

    def test_breaking_api_returns_expected_body(self) -> None:
        resp = self._client().get("/api/test/breaking-api")
        assert resp.status_code == 200
        assert resp.json() == {
            "message": "This is a test response from the breaking api",
            "detail": "Additional detail from the breaking api",
        }

    def test_breaking_api_2_returns_expected_body(self) -> None:
        resp = self._client().get("/api/test/breaking-api-2")
        assert resp.status_code == 200
        assert resp.json() == {
            "summary": ("This is a test response from the second breaking api")
        }
