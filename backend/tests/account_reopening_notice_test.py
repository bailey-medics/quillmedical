"""Who is told, by email, that their account has been opened again.

The rule crosses the route, the newsletter list and the sender:
everybody with a verified address is told, the email says where their
newsletter stands after the list entry is folded back, and a mail
provider that is down does not undo the reopening.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.email_send import EmailSendError
from app.marketing.preferences import set_marketing_preference
from app.models import NewsletterSubscriber, User
from app.security import hash_password
from app.users import closure_notice, reopening_notice


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Every reopening email, and none of the closure emails."""
    sent: list[dict[str, Any]] = []

    def send_email(**kwargs: Any) -> None:
        sent.append(kwargs)

    monkeypatch.setattr(reopening_notice, "send_email", send_email)
    monkeypatch.setattr(closure_notice, "send_email", lambda **_: None)

    return sent


def _closed(db: Session, name: str, *, answer: bool | None) -> User:
    """Somebody in no org unit whose account is closed."""
    user = User(
        username=name,
        email=f"{name}@example.test",
        full_name=f"{name.title()} Example",
        password_hash=hash_password("Password123!"),
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.flush()

    if answer is not None:
        set_marketing_preference(
            db, user, wants=answer, source="settings", first_answer=True
        )

    db.commit()

    return user


def _close_then_reopen(client: TestClient, user: User) -> Any:
    client.post(f"/api/users/{user.id}/deactivate")

    return client.post(f"/api/users/{user.id}/reactivate")


def test_somebody_is_told_their_account_is_open_again(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    user = _closed(db_session, "ada", answer=True)

    response = _close_then_reopen(authenticated_superadmin_client, user)

    assert response.status_code == 200
    [email] = outbox
    assert email["to"] == "ada@example.test"
    assert email["subject"] == "Your Quill account has been opened again"
    assert "/login" in email["text_body"]
    assert "/forgot-password" in email["text_body"]


def test_it_says_they_are_set_to_receive_news(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    user = _closed(db_session, "ada", answer=True)

    _close_then_reopen(authenticated_superadmin_client, user)

    [email] = outbox
    assert "You are set to receive news and updates" in email["text_body"]


def test_it_says_they_are_not_when_they_said_no(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    user = _closed(db_session, "ada", answer=False)

    _close_then_reopen(authenticated_superadmin_client, user)

    [email] = outbox
    assert "You are not set to receive news" in email["text_body"]


def test_a_no_given_while_closed_is_what_it_reports(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    """Unsubscribed on the list while the account was closed: that no
    comes back with them, and the email says so."""
    user = _closed(db_session, "ada", answer=True)
    authenticated_superadmin_client.post(f"/api/users/{user.id}/deactivate")
    entry = db_session.query(NewsletterSubscriber).one()
    entry.subscribed = False
    db_session.commit()

    authenticated_superadmin_client.post(f"/api/users/{user.id}/reactivate")

    [email] = outbox
    assert "You are not set to receive news" in email["text_body"]


def test_an_account_an_administrator_made_and_nobody_used_is_told(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    """Never asked about news. The link to set a password is their way
    in."""
    user = _closed(db_session, "ada", answer=None)

    _close_then_reopen(authenticated_superadmin_client, user)

    [email] = outbox
    assert "never set one" in email["text_body"]
    assert "You are not set to receive news" in email["text_body"]


def test_an_address_nobody_verified_is_sent_nothing(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    user = _closed(db_session, "ada", answer=True)
    user.email_verified = False
    db_session.commit()

    response = _close_then_reopen(authenticated_superadmin_client, user)

    assert response.status_code == 200
    assert outbox == []


def test_a_reopening_that_is_refused_sends_nothing(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    """Reopening an account that is already open is a 400."""
    user = _closed(db_session, "ada", answer=True)

    response = authenticated_superadmin_client.post(
        f"/api/users/{user.id}/reactivate"
    )

    assert response.status_code == 400
    assert outbox == []


def test_a_mail_provider_that_is_down_does_not_undo_the_reopening(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    def send_email(**_kwargs: Any) -> None:
        raise EmailSendError("the provider refused")

    monkeypatch.setattr(reopening_notice, "send_email", send_email)
    monkeypatch.setattr(closure_notice, "send_email", lambda **_: None)
    user = _closed(db_session, "ada", answer=True)

    response = _close_then_reopen(authenticated_superadmin_client, user)

    assert response.status_code == 200
    db_session.expire_all()
    assert user.is_active is True
    assert "account reopening notice not sent" in caplog.text
    assert "ada@example.test" not in caplog.text
    assert "Ada Example" not in caplog.text


def test_no_notice_is_due_for_a_closed_account(db_session: Session) -> None:
    user = _closed(db_session, "ada", answer=True)
    user.is_active = False
    db_session.commit()

    assert reopening_notice.reopening_notice_for(user) is None
