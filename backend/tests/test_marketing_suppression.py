"""Hearing from Amazon which addresses bounced or complained."""

from unittest.mock import MagicMock

import pytest
from pydantic import SecretStr
from sqlalchemy import select

from app.config import settings
from app.marketing import suppression
from app.marketing.suppression import (
    SuppressionError,
    hear_from_amazon,
    mark_suppressed,
    suppressed_addresses,
)
from app.models import MarketingPreferenceChange, NewsletterSubscriber, User


@pytest.fixture
def amazon(monkeypatch):
    """An SES account that answers from here, a page at a time."""
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "ses")
    monkeypatch.setattr(settings, "SES_ACCESS_KEY_ID", SecretStr("the-id\n"))
    monkeypatch.setattr(
        settings, "SES_SECRET_ACCESS_KEY", SecretStr("the-secret\n")
    )
    client = MagicMock()
    client.list_suppressed_destinations.return_value = {
        "SuppressedDestinationSummaries": []
    }
    boto3 = MagicMock()
    boto3.client.return_value = client
    monkeypatch.setattr(suppression, "boto3", boto3)
    return boto3


def _page(*entries, token=None):
    page = {
        "SuppressedDestinationSummaries": [
            {"EmailAddress": address, "Reason": reason}
            for address, reason in entries
        ]
    }
    if token:
        page["NextToken"] = token
    return page


def _member(db_session, name, *, subscribed=True):
    member = NewsletterSubscriber(
        email=f"{name}@example.org", subscribed=subscribed
    )
    db_session.add(member)
    db_session.commit()
    return member


def _user(db_session, name, *, wants=True):
    user = User(
        username=name,
        email=f"{name}@example.com",
        password_hash="x",
        email_verified=True,
        marketing_emails=wants,
    )
    db_session.add(user)
    db_session.commit()
    return user


class TestReadingTheList:
    def test_asks_london_with_the_key_and_no_stray_newline(self, amazon):
        suppressed_addresses()

        kwargs = amazon.client.call_args.kwargs
        assert amazon.client.call_args.args == ("sesv2",)
        assert kwargs["region_name"] == "eu-west-2"
        assert kwargs["aws_access_key_id"] == "the-id"
        assert kwargs["aws_secret_access_key"] == "the-secret"

    def test_gives_each_address_lower_case_with_why(self, amazon):
        amazon.client.return_value.list_suppressed_destinations.return_value = _page(
            ("Gone@Example.org", "BOUNCE"), ("cross@example.org", "COMPLAINT")
        )

        assert suppressed_addresses() == {
            "gone@example.org": "bounce",
            "cross@example.org": "complaint",
        }

    def test_reads_every_page(self, amazon):
        client = amazon.client.return_value
        client.list_suppressed_destinations.side_effect = [
            _page(("a@example.org", "BOUNCE"), token="next"),
            _page(("b@example.org", "BOUNCE")),
        ]

        assert set(suppressed_addresses()) == {
            "a@example.org",
            "b@example.org",
        }
        second = client.list_suppressed_destinations.call_args_list[1]
        assert second.kwargs["NextToken"] == "next"

    def test_stops_if_the_pages_never_end(self, amazon, monkeypatch):
        monkeypatch.setattr(suppression, "MAX_PAGES", 3)
        client = amazon.client.return_value
        client.list_suppressed_destinations.return_value = _page(
            ("a@example.org", "BOUNCE"), token="again"
        )

        suppressed_addresses()

        assert client.list_suppressed_destinations.call_count == 3

    def test_ignores_a_reason_it_does_not_know(self, amazon):
        amazon.client.return_value.list_suppressed_destinations.return_value = _page(
            ("a@example.org", "SOMETHING_NEW")
        )

        assert suppressed_addresses() == {}

    def test_a_failure_never_carries_the_key(self, amazon):
        client = amazon.client.return_value
        client.list_suppressed_destinations.side_effect = RuntimeError(
            "denied for the-id signed with the-secret"
        )

        with pytest.raises(SuppressionError) as raised:
            suppressed_addresses()

        assert "the-secret" not in str(raised.value)
        assert "the-id" not in str(raised.value)
        assert raised.value.__cause__ is None

    @pytest.mark.parametrize(
        ("setting", "value"),
        [
            ("EMAIL_PROVIDER", "resend"),
            ("SES_ACCESS_KEY_ID", None),
            ("SES_SECRET_ACCESS_KEY", None),
        ],
    )
    def test_asks_nobody_when_there_is_no_amazon_account(
        self, amazon, monkeypatch, setting, value
    ):
        monkeypatch.setattr(settings, setting, value)

        assert suppressed_addresses() == {}
        amazon.client.assert_not_called()


class TestMarkingThePeopleOnIt:
    def test_a_subscriber_is_unsubscribed(self, db_session):
        gone = _member(db_session, "gone")
        fine = _member(db_session, "fine")

        marked = mark_suppressed(db_session, {"gone@example.org": "bounce"})

        assert marked.subscribers == 1
        assert gone.subscribed is False
        assert gone.unsubscribed_at is not None
        assert fine.subscribed is True

    def test_an_account_holder_is_switched_off_with_the_reason(
        self, db_session
    ):
        cross = _user(db_session, "cross")

        marked = mark_suppressed(
            db_session, {"cross@example.com": "complaint"}
        )

        assert marked.accounts == 1
        assert cross.marketing_emails is False
        [row] = db_session.scalars(select(MarketingPreferenceChange)).all()
        assert (row.wants_marketing, row.source) == (False, "complaint")

    def test_somebody_already_off_is_left_as_they_are(self, db_session):
        _member(db_session, "gone", subscribed=False)
        _user(db_session, "cross", wants=False)

        marked = mark_suppressed(
            db_session,
            {"gone@example.org": "bounce", "cross@example.com": "bounce"},
        )

        assert (marked.subscribers, marked.accounts) == (0, 0)
        assert (
            db_session.scalars(select(MarketingPreferenceChange)).all() == []
        )

    def test_an_empty_list_changes_nothing(self, db_session):
        _member(db_session, "fine")

        marked = mark_suppressed(db_session, {})

        assert (marked.subscribers, marked.accounts) == (0, 0)


class TestBeforeASend:
    def test_marks_and_saves(self, db_session, amazon):
        gone = _member(db_session, "gone")
        amazon.client.return_value.list_suppressed_destinations.return_value = _page(
            ("gone@example.org", "BOUNCE")
        )

        marked = hear_from_amazon(db_session)

        assert marked is not None
        assert marked.subscribers == 1
        db_session.refresh(gone)
        assert gone.subscribed is False

    def test_a_list_that_cannot_be_read_stops_nothing(
        self, db_session, amazon, caplog
    ):
        """Amazon refuses those addresses itself, so a send is still safe."""
        _member(db_session, "gone")
        amazon.client.return_value.list_suppressed_destinations.side_effect = (
            RuntimeError("AccessDenied")
        )

        assert hear_from_amazon(db_session) is None
        assert "could not be read" in caplog.text
