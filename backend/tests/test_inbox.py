"""Tests for the inbox: what is waiting on the caller."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.passport.models import Passport, PassportSignOffRequest
from app.inbox import sources
from app.models import Feedback, User
from app.security import hash_password
from tests.competencies import hold

ENDPOINT = "/api/inbox"
ITEMS = f"{ENDPOINT}/items"

#: Unmistakable, so finding it in a response means it leaked.
SECRET_MESSAGE = "The case for Mrs Example-Leak shows the wrong dose"


def _feedback(db: Session, user: User | None, status: str = "new") -> Feedback:
    row = Feedback(
        user_id=user.id if user else None,
        category="broken",
        message=SECRET_MESSAGE,
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


class TestTheLines:
    def test_lists_what_is_waiting_newest_first(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        older = _feedback(db_session, test_user)
        newer = _feedback(db_session, None)
        _feedback(db_session, test_user, status="resolved")

        resp = authenticated_superadmin_client.get(ITEMS)

        assert resp.status_code == 200
        items = resp.json()["items"]
        assert [item["id"] for item in items] == [newer.id, older.id]
        assert items[0]["title"] == "Feedback from a deleted user"
        assert items[1] == {
            "source": "feedback_new",
            "id": older.id,
            "ref": None,
            "title": f"Feedback from {test_user.username}",
            "detail": "Something is broken",
            "status": "New",
            "created_at": items[1]["created_at"],
            "done": False,
        }

    def test_lists_what_was_dealt_with_when_asked(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        _feedback(db_session, test_user)
        resolved = _feedback(db_session, test_user, status="resolved")

        resp = authenticated_superadmin_client.get(
            ITEMS, params={"done": True}
        )

        items = resp.json()["items"]
        assert [item["id"] for item in items] == [resolved.id]
        assert items[0]["status"] == "Resolved"
        assert items[0]["done"] is True

    @pytest.mark.parametrize("done", [False, True])
    def test_a_line_never_carries_the_message(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        test_user: User,
        done: bool,
    ) -> None:
        _feedback(db_session, test_user)
        _feedback(db_session, test_user, status="acknowledged")

        resp = authenticated_superadmin_client.get(
            ITEMS, params={"done": done}
        )

        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1
        assert "Example-Leak" not in resp.text

    def test_somebody_who_is_not_an_operator_has_no_lines(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        _feedback(db_session, test_user)

        for done in (False, True):
            resp = authenticated_client.get(ITEMS, params={"done": done})
            assert resp.status_code == 200
            assert resp.json() == {"items": []}

    def test_refuses_a_signed_out_caller(
        self, test_client: TestClient
    ) -> None:
        assert test_client.get(ITEMS).status_code == 401


def _holder(db: Session, username: str = "holder") -> Passport:
    """A clinician with a passport, for somebody to be asked to assess."""
    user = User(
        username=username,
        email=f"{username}@example.test",
        full_name="Dr Priya Shah",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    db.commit()
    # A passport's id is thirty-two hex characters.
    passport = Passport(id=f"{user.id:032x}", user_id=user.id)
    db.add(passport)
    db.commit()
    return passport


def _request(
    db: Session,
    passport: Passport,
    assessor_email: str,
    status: str = "open",
    name: str = "chest-drain",
) -> PassportSignOffRequest:
    row = PassportSignOffRequest(
        passport_id=passport.id,
        signoff_id=name,
        competency_id="chest_drain_insertion",
        assessor_email=assessor_email,
        status=status,
        resolved_at=None if status == "open" else datetime.now(UTC),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _count(client: TestClient, source: str) -> int:
    return sum(
        item["count"]
        for item in client.get(ENDPOINT).json()["items"]
        if item["source"] == source
    )


class TestSignOffRequests:
    """Requests to assess a colleague wait on the assessor they name."""

    SOURCE = "passport_sign_off"

    @pytest.fixture
    def assessor(self, db_session: Session, test_user: User) -> User:
        hold(test_user, "assess_clinician_passport")
        db_session.commit()
        return test_user

    def test_counts_the_open_requests_that_name_the_caller(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        assessor: User,
    ) -> None:
        passport = _holder(db_session)
        # Named by address, whatever its case: the holder typed it.
        _request(db_session, passport, assessor.email.upper())
        _request(db_session, passport, assessor.email, "signed_off", "b")
        _request(db_session, passport, "somebody.else@example.test", name="c")

        assert _count(authenticated_client, self.SOURCE) == 1

    def test_the_line_names_who_asked_and_nothing_of_the_evidence(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        assessor: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        passport = _holder(db_session)
        row = _request(db_session, passport, assessor.email)
        read: list[tuple[str, str]] = []

        def record(store: object, passport_id: str, name: str) -> object:
            read.append((passport_id, name))
            return SimpleNamespace(id="20261003T045520.838Z-ee579e99")

        monkeypatch.setattr(sources.service, "read_sign_off", record)

        items = authenticated_client.get(ITEMS).json()["items"]

        assert read == [(passport.id, "chest-drain")]
        assert items == [
            {
                "source": self.SOURCE,
                "id": row.id,
                # The record's own id, read from the holder's passport:
                # the sign-off page is addressed by it.
                "ref": "20261003T045520.838Z-ee579e99",
                "title": "Sign-off request from Dr Priya Shah",
                # No such competency in the catalogue, so no name for it.
                "detail": None,
                "status": "Waiting",
                "created_at": items[0]["created_at"],
                "done": False,
            }
        ]

    def test_a_request_whose_record_cannot_be_read_is_still_listed(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        assessor: User,
    ) -> None:
        """With nowhere to go, and not hiding the rest."""
        passport = _holder(db_session)
        row = _request(db_session, passport, assessor.email)

        items = authenticated_client.get(ITEMS).json()["items"]

        assert [(item["id"], item["ref"]) for item in items] == [
            (row.id, None)
        ]

    @pytest.mark.parametrize(
        ("status", "label"),
        [
            ("signed_off", "Signed off"),
            ("declined", "Declined"),
            ("withdrawn", "Withdrawn"),
        ],
    )
    def test_an_answered_request_moves_to_completed(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        assessor: User,
        status: str,
        label: str,
    ) -> None:
        passport = _holder(db_session)
        _request(db_session, passport, assessor.email, status)

        assert _count(authenticated_client, self.SOURCE) == 0
        assert authenticated_client.get(ITEMS).json() == {"items": []}
        done = authenticated_client.get(ITEMS, params={"done": True})
        assert [item["status"] for item in done.json()["items"]] == [label]
        # Answered, so there is no page for it and no record is read.
        assert done.json()["items"][0]["ref"] is None

    def test_somebody_who_may_not_assess_is_told_nothing(
        self, db_session: Session
    ) -> None:
        """The passport would refuse them, so the count would lead nowhere.

        Asked of the source itself, with a teaching delegate, who holds
        nothing that lets them assess.
        """
        delegate = User(
            username="delegate",
            email="delegate@example.test",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            base_profession="teaching_delegate",
        )
        db_session.add(delegate)
        db_session.commit()
        assert (
            "assess_clinician_passport"
            not in delegate.get_final_competencies()
        )
        passport = _holder(db_session)
        _request(db_session, passport, delegate.email)
        source = sources.SOURCES[self.SOURCE]

        assert source.count(db_session, delegate) == 0
        assert source.lines(db_session, delegate, False) == []
        assert source.lines(db_session, delegate, True) == []


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

        def broken_lines(
            db: Session, user: User, done: bool
        ) -> list[sources.InboxLine]:
            raise RuntimeError("that feature is down")

        monkeypatch.setitem(
            sources.SOURCES,
            "broken_source",
            sources.InboxSource(count=broken, lines=broken_lines),
        )

        resp = authenticated_superadmin_client.get(ENDPOINT)

        assert resp.status_code == 200
        assert resp.json() == {
            "items": [{"source": "feedback_new", "count": 1}],
            "total": 1,
        }
        lines = authenticated_superadmin_client.get(ITEMS)
        assert lines.status_code == 200
        assert [item["source"] for item in lines.json()["items"]] == [
            "feedback_new"
        ]
