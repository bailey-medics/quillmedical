"""Tests for the inbox: what is waiting on the caller."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.inbox import sources
from app.models import Feedback, User

ENDPOINT = "/api/inbox"


def _feedback(db: Session, user: User | None, status: str = "new") -> Feedback:
    row = Feedback(
        user_id=user.id if user else None,
        category="broken",
        message="Captions lag behind the video",
        route="/teaching",
        release="abc1234",
        viewport="390x844",
        user_agent="Mozilla/5.0",
        breadcrumbs=[],
        status=status,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestNewFeedback:
    def test_an_operator_is_told_how_much_feedback_is_new(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        _feedback(db_session, test_user)
        _feedback(db_session, test_user)
        _feedback(db_session, test_user, status="resolved")

        resp = authenticated_superadmin_client.get(ENDPOINT)

        assert resp.status_code == 200
        assert resp.json() == {
            "items": [{"source": "feedback_new", "count": 2}],
            "total": 2,
        }

    @pytest.mark.parametrize(
        "status", ["acknowledged", "resolved", "wont_fix"]
    )
    def test_feedback_stops_waiting_once_it_is_dealt_with(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        status: str,
    ) -> None:
        row = _feedback(db_session, None)
        assert (
            authenticated_superadmin_client.get(ENDPOINT).json()["total"] == 1
        )

        row.status = status
        db_session.commit()

        assert authenticated_superadmin_client.get(ENDPOINT).json() == {
            "items": [],
            "total": 0,
        }

    def test_reading_one_does_not_clear_it(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ) -> None:
        """Opened is not dealt with."""
        row = _feedback(db_session, None)

        opened = authenticated_superadmin_client.get(f"/api/feedback/{row.id}")

        assert opened.status_code == 200
        assert (
            authenticated_superadmin_client.get(ENDPOINT).json()["total"] == 1
        )

    def test_somebody_who_is_not_an_operator_is_told_nothing(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        """Not even about their own: new feedback waits on an operator."""
        _feedback(db_session, test_user)

        resp = authenticated_client.get(ENDPOINT)

        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}


class TestTheRoute:
    def test_refuses_a_signed_out_caller(
        self, test_client: TestClient
    ) -> None:
        assert test_client.get(ENDPOINT).status_code == 401

    def test_a_source_that_fails_is_left_out_and_the_rest_answer(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _feedback(db_session, None)

        def broken(db: Session, user: User) -> int:
            raise RuntimeError("that feature is down")

        monkeypatch.setitem(sources.SOURCES, "broken_source", broken)

        resp = authenticated_superadmin_client.get(ENDPOINT)

        assert resp.status_code == 200
        assert resp.json() == {
            "items": [{"source": "feedback_new", "count": 1}],
            "total": 1,
        }
