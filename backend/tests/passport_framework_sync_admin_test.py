"""An operator starts the framework sync job from the passport admin page.

``/api/passport/admin/framework-sync`` says whether the sync can be
started here and how its last run ended, and starts the Cloud Run job
with no overrides. See ``app/features/passport/admin_router.py`` and
Phase 14 of
docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.features.passport import admin_router
from app.features.passport.models import PassportFrameworkSync

ROUTE = "/api/passport/admin/framework-sync"
JOB = "projects/p/locations/europe-west2/jobs/quill-framework-sync-app"


@pytest.fixture
def with_a_job(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """A job set up, and every start recorded instead of reaching Google."""
    started: list[str] = []

    def _start(job: str) -> str:
        started.append(job)
        return f"{job}/executions/quill-framework-sync-app-abc12"

    monkeypatch.setattr(settings, "FRAMEWORK_SYNC_JOB", JOB)
    monkeypatch.setattr(admin_router, "_start", _start)

    return started


@pytest.fixture
def with_no_job(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "FRAMEWORK_SYNC_JOB", None)


class TestOnlyAnOperator:
    @pytest.mark.usefixtures("with_a_job")
    def test_somebody_else_cannot_read_it(
        self, authenticated_client: TestClient
    ) -> None:
        assert authenticated_client.get(ROUTE).status_code in (403, 404)

    def test_somebody_else_cannot_start_it(
        self, authenticated_client: TestClient, with_a_job: list[str]
    ) -> None:
        response = authenticated_client.post(ROUTE)

        assert response.status_code in (403, 404)
        assert with_a_job == []


class TestStartingTheSync:
    def test_an_operator_starts_the_job(
        self,
        authenticated_superadmin_client: TestClient,
        with_a_job: list[str],
    ) -> None:
        response = authenticated_superadmin_client.post(ROUTE)

        assert response.status_code == 200, response.text
        assert with_a_job == [JOB]
        assert response.json() == {
            "execution": f"{JOB}/executions/quill-framework-sync-app-abc12"
        }

    def test_the_job_is_started_as_configured(
        self,
        authenticated_superadmin_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """No overrides, which ``roles/run.invoker`` would refuse anyway."""
        requests: list[Any] = []

        class _Operation:
            class operation:  # noqa: N801 - the client's own attribute
                name = "an-execution"

        class _Client:
            def run_job(self, request: Any) -> _Operation:
                requests.append(request)
                return _Operation()

        from google.cloud import run_v2

        monkeypatch.setattr(settings, "FRAMEWORK_SYNC_JOB", JOB)
        monkeypatch.setattr(run_v2, "JobsClient", _Client)

        response = authenticated_superadmin_client.post(ROUTE)

        assert response.status_code == 200, response.text
        assert len(requests) == 1
        assert requests[0].name == JOB
        assert not requests[0].overrides.container_overrides

    @pytest.mark.usefixtures("with_no_job")
    def test_with_no_job_it_says_so(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        response = authenticated_superadmin_client.post(ROUTE)

        assert response.status_code == 503
        assert response.json() == {
            "detail": "The framework sync is not set up here."
        }

    def test_a_job_that_cannot_be_started_is_a_502(
        self,
        authenticated_superadmin_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def _refused(job: str) -> str:
            raise RuntimeError("PERMISSION_DENIED")

        monkeypatch.setattr(settings, "FRAMEWORK_SYNC_JOB", JOB)
        monkeypatch.setattr(admin_router, "_start", _refused)

        response = authenticated_superadmin_client.post(ROUTE)

        assert response.status_code == 502
        assert "PERMISSION_DENIED" not in response.text

    @pytest.mark.usefixtures("with_a_job")
    def test_a_request_with_no_csrf_token_is_refused(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        del authenticated_superadmin_client.headers["X-CSRF-Token"]

        assert authenticated_superadmin_client.post(ROUTE).status_code == 403


class TestTheLastRun:
    @pytest.mark.usefixtures("with_no_job")
    def test_with_no_run_and_no_job(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        response = authenticated_superadmin_client.get(ROUTE)

        assert response.status_code == 200
        assert response.json() == {"configured": False, "last_run": None}

    @pytest.mark.usefixtures("with_a_job")
    def test_the_newest_run_is_the_one_shown(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        older = datetime(2026, 11, 4, 9, 0, tzinfo=UTC)
        newer = datetime(2026, 11, 4, 16, 0, tzinfo=UTC)
        db_session.add_all(
            [
                PassportFrameworkSync(
                    started_at=older,
                    finished_at=older,
                    status="succeeded",
                    versions_written=4,
                ),
                PassportFrameworkSync(
                    started_at=newer,
                    finished_at=newer,
                    status="failed",
                    error="Framework 'clinical' skipped version 2.",
                ),
            ]
        )
        db_session.commit()

        body = authenticated_superadmin_client.get(ROUTE).json()

        assert body["configured"] is True
        assert body["last_run"]["status"] == "failed"
        assert body["last_run"]["versions_written"] == 0
        assert body["last_run"]["error"] == (
            "Framework 'clinical' skipped version 2."
        )
