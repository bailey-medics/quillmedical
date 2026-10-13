"""Who is told, by email, that their account has been closed.

The rule crosses the route, the newsletter list and the sender: only
somebody whose newsletter carries on is told, the email names the link
that stops it, and a mail provider that is down does not undo the
closure.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.email_send import EmailSendError
from app.marketing.preferences import set_marketing_preference
from app.models import NewsletterSubscriber, User
from app.security import (
    hash_password,
    verify_subscriber_unsubscribe_token,
)
from app.users import closure_notice


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Every email the closure notice tries to send."""
    sent: list[dict[str, Any]] = []

    def send_email(**kwargs: Any) -> None:
        sent.append(kwargs)

    monkeypatch.setattr(closure_notice, "send_email", send_email)

    return sent


def _person(db: Session, name: str, *, answer: bool | None) -> User:
    """Somebody in no org unit, who registered and answered, or did not."""
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


def _close(client: TestClient, user: User) -> Any:
    return client.post(f"/api/users/{user.id}/deactivate")


def test_somebody_whose_newsletter_carries_on_is_told_once(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    user = _person(db_session, "ada", answer=True)

    response = _close(authenticated_superadmin_client, user)

    assert response.status_code == 200
    [email] = outbox
    assert email["to"] == "ada@example.test"
    assert "closed" in email["subject"].lower()
    assert "carry on" in email["text_body"]
    assert "ada" in email["text_body"]


def test_the_email_carries_the_link_that_stops_their_newsletter(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    """The list entry's link, since that is where it now comes from."""
    user = _person(db_session, "ada", answer=True)

    _close(authenticated_superadmin_client, user)

    entry = db_session.scalar(
        select(NewsletterSubscriber).where(
            NewsletterSubscriber.email == user.email
        )
    )
    assert entry is not None
    [email] = outbox
    token = email["text_body"].split("token=")[1].split()[0]
    assert verify_subscriber_unsubscribe_token(token) == entry.id


def test_somebody_who_said_no_is_sent_nothing(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    user = _person(db_session, "ada", answer=False)

    assert _close(authenticated_superadmin_client, user).status_code == 200

    assert outbox == []


def test_somebody_never_asked_is_sent_nothing(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    user = _person(db_session, "ada", answer=None)

    assert _close(authenticated_superadmin_client, user).status_code == 200

    assert outbox == []


def test_a_closure_that_is_refused_sends_nothing(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    outbox: list[dict[str, Any]],
) -> None:
    """Closing an account already closed is a 400, and no second email."""
    user = _person(db_session, "ada", answer=True)
    _close(authenticated_superadmin_client, user)
    outbox.clear()

    again = _close(authenticated_superadmin_client, user)

    assert again.status_code == 400
    assert outbox == []


def test_a_mail_provider_that_is_down_does_not_undo_the_closure(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    def send_email(**_kwargs: Any) -> None:
        raise EmailSendError("the provider refused")

    monkeypatch.setattr(closure_notice, "send_email", send_email)
    user = _person(db_session, "ada", answer=True)

    response = _close(authenticated_superadmin_client, user)

    assert response.status_code == 200
    db_session.expire_all()
    assert user.is_active is False
    assert "account closure notice not sent" in caplog.text
    assert "ada@example.test" not in caplog.text
    assert "Ada Example" not in caplog.text


def test_no_notice_is_due_for_an_open_account(db_session: Session) -> None:
    user = _person(db_session, "ada", answer=True)
    db_session.add(NewsletterSubscriber(email=user.email))
    db_session.commit()

    assert closure_notice.closure_notice_for(db_session, user) is None
