"""The weekly check that Quill still matches Resend, with Resend stubbed."""

# ruff: noqa: F811 - ``fake_resend`` is a fixture borrowed from the sync
# tests, so naming it as a test's argument "redefines" the import.

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.marketing import reconcile as reconcile_module
from app.marketing import resend_contacts
from app.marketing.reconcile import reconcile
from app.marketing.resend_contacts import MarketingSyncError, list_contacts
from app.models import MarketingPreferenceChange, User
from tests.test_marketing_resend_sync import (  # noqa: F401 - a fixture
    SEGMENT,
    TOPIC,
    fake_resend,
)

LONG_AGO = datetime.now(UTC) - timedelta(days=3)


@pytest.fixture(autouse=True)
def no_pause(monkeypatch):
    """The pause between people is for Resend's sake, not the tests'."""
    monkeypatch.setattr(reconcile_module.time, "sleep", lambda seconds: None)


def _person(
    db_session,
    name,
    *,
    wants=True,
    synced=LONG_AGO,
    verified=True,
    active=True,
):
    user = User(
        username=name,
        email=f"{name}@example.com",
        password_hash="x",
        email_verified=verified,
        is_active=active,
        marketing_emails=wants,
        marketing_synced_at=synced,
    )
    db_session.add(user)
    db_session.commit()
    return user


def _in_resend(fake, name, *, topic="opt_in", unsubscribed=False):
    fake.contacts[f"{name}@example.com"] = {
        "segments": [SEGMENT],
        "topics": {TOPIC: topic} if topic else {},
        "unsubscribed": unsubscribed,
    }


def _changes(db_session, user):
    return list(
        db_session.execute(
            select(MarketingPreferenceChange).where(
                MarketingPreferenceChange.user_id == user.id
            )
        )
        .scalars()
        .all()
    )


class TestWhenTheyAgree:
    def test_nothing_changes(self, db_session, fake_resend):
        on = _person(db_session, "on")
        off = _person(db_session, "off", wants=False)
        _in_resend(fake_resend, "on")
        _in_resend(fake_resend, "off", topic="opt_out", unsubscribed=True)

        result = reconcile(db_session)

        assert (result.matched, result.corrected) == (2, 0)
        assert _changes(db_session, on) == []
        assert _changes(db_session, off) == []


class TestWhenResendSaysNo:
    def test_an_unsubscribe_quill_never_heard_about_is_recorded(
        self, db_session, fake_resend
    ):
        """What happened on 4 October 2026: the webhook never called."""
        user = _person(db_session, "ada")
        _in_resend(fake_resend, "ada", unsubscribed=True)

        result = reconcile(db_session)

        assert result.corrected == 1
        db_session.refresh(user)
        assert user.marketing_emails is False
        assert user.marketing_synced_at is not None
        [row] = _changes(db_session, user)
        assert row.source == "resend"
        assert row.wants_marketing is False

    def test_a_contact_unsubscribed_from_everything_is_not_asked_its_topic(
        self, db_session, fake_resend
    ):
        _person(db_session, "ada")
        _in_resend(fake_resend, "ada", unsubscribed=True)

        reconcile(db_session)

        assert not [c for c in fake_resend.calls if c[1].endswith("/topics")]

    def test_a_topic_opt_out_alone_is_enough(self, db_session, fake_resend):
        user = _person(db_session, "ada")
        _in_resend(fake_resend, "ada", topic="opt_out")

        reconcile(db_session)

        db_session.refresh(user)
        assert user.marketing_emails is False


class TestWhenResendSaysYes:
    def test_resend_wins_that_way_too(self, db_session, fake_resend):
        """Somebody who re-subscribed on Resend's own page."""
        user = _person(db_session, "ada", wants=False)
        _in_resend(fake_resend, "ada")

        result = reconcile(db_session)

        assert result.corrected == 1
        db_session.refresh(user)
        assert user.marketing_emails is True
        [row] = _changes(db_session, user)
        assert row.source == "resend"
        assert row.wants_marketing is True


class TestAChoiceResendHasNotHadYet:
    def test_is_sent_first_and_not_overwritten(self, db_session, fake_resend):
        """Quill knowing something newer is not the two disagreeing."""
        user = _person(db_session, "ada", wants=False, synced=None)
        _in_resend(fake_resend, "ada")

        result = reconcile(db_session)

        assert result.sent == 1
        db_session.refresh(user)
        assert user.marketing_emails is False
        contact = fake_resend.contacts["ada@example.com"]
        assert contact["topics"] == {TOPIC: "opt_out"}
        assert contact["unsubscribed"] is True
        assert _changes(db_session, user) == []

    def test_somebody_just_sent_is_left_for_next_time(
        self, db_session, fake_resend
    ):
        """Resend's reads lag its writes, so a fresh one is not trusted."""
        user = _person(db_session, "ada", synced=datetime.now(UTC))
        _in_resend(fake_resend, "ada", unsubscribed=True)

        result = reconcile(db_session)

        assert result.skipped == 1
        db_session.refresh(user)
        assert user.marketing_emails is True


class TestSomebodyResendDoesNotHave:
    def test_is_switched_off_and_marked_to_be_sent_again(
        self, db_session, fake_resend
    ):
        user = _person(db_session, "ada")

        result = reconcile(db_session)

        assert result.missing == 1
        db_session.refresh(user)
        assert user.marketing_emails is False
        assert user.marketing_synced_at is None

    def test_the_next_run_puts_them_back_opted_out(
        self, db_session, fake_resend
    ):
        _person(db_session, "ada")
        reconcile(db_session)

        result = reconcile(db_session)

        assert result.sent == 1
        contact = fake_resend.contacts["ada@example.com"]
        assert contact["unsubscribed"] is True
        assert contact["topics"] == {TOPIC: "opt_out"}


class TestWhoIsLeftAlone:
    def test_a_contact_with_no_account(self, db_session, fake_resend):
        """Somebody who joined the list from the public site."""
        _in_resend(fake_resend, "visitor")

        result = reconcile(db_session)

        assert result == reconcile_module.Reconciled()
        assert "visitor@example.com" in fake_resend.contacts

    def test_an_unverified_account(self, db_session, fake_resend):
        unverified = _person(db_session, "unverified", verified=False)

        result = reconcile(db_session)

        assert result.missing == 0
        db_session.refresh(unverified)
        assert unverified.marketing_emails is True

    def test_a_closed_account_is_checked_like_any_other(
        self, db_session, fake_resend
    ):
        """Closing it took nobody off the list, so it can still drift."""
        closed = _person(db_session, "closed", active=False)
        _in_resend(fake_resend, "closed", unsubscribed=True)

        result = reconcile(db_session)

        assert result.corrected == 1
        db_session.refresh(closed)
        assert closed.marketing_emails is False

    def test_a_topic_resend_holds_no_answer_for(self, db_session, fake_resend):
        user = _person(db_session, "ada")
        _in_resend(fake_resend, "ada", topic=None)

        result = reconcile(db_session)

        assert result.skipped == 1
        db_session.refresh(user)
        assert user.marketing_emails is True

    def test_an_address_in_another_case_is_the_same_person(
        self, db_session, fake_resend
    ):
        user = _person(db_session, "ada")
        fake_resend.contacts["ADA@Example.com"] = {
            "segments": [SEGMENT],
            "topics": {TOPIC: "opt_out"},
            "unsubscribed": True,
        }

        result = reconcile(db_session)

        assert result.corrected == 1
        db_session.refresh(user)
        assert user.marketing_emails is False


class TestWhenResendCannotBeAsked:
    def test_no_list_changes_nobody(self, db_session, fake_resend):
        user = _person(db_session, "ada")
        _in_resend(fake_resend, "ada", unsubscribed=True)
        fake_resend.fail_with = 500

        with pytest.raises(MarketingSyncError):
            reconcile(db_session)

        db_session.refresh(user)
        assert user.marketing_emails is True

    def test_one_person_who_cannot_be_read_does_not_stop_the_rest(
        self, db_session, fake_resend, monkeypatch
    ):
        first = _person(db_session, "first")
        second = _person(db_session, "second")
        _in_resend(fake_resend, "first", topic="opt_out")
        _in_resend(fake_resend, "second", topic="opt_out")
        real = resend_contacts.topic_subscription

        def flaky(email):
            if email.startswith("first"):
                raise MarketingSyncError("Resend refused: HTTP 500")
            return real(email)

        monkeypatch.setattr(reconcile_module, "topic_subscription", flaky)

        result = reconcile(db_session)

        assert (result.failed, result.corrected) == (1, 1)
        db_session.refresh(first)
        db_session.refresh(second)
        assert first.marketing_emails is True
        assert second.marketing_emails is False

    def test_unset_settings_do_nothing(
        self, db_session, fake_resend, monkeypatch
    ):
        from app.config import settings

        monkeypatch.setattr(settings, "RESEND_NEWSLETTER_TOPIC_ID", None)
        user = _person(db_session, "ada")

        result = reconcile(db_session)

        assert result == reconcile_module.Reconciled()
        db_session.refresh(user)
        assert user.marketing_emails is True


class TestListingContacts:
    def test_reads_every_page(self, fake_resend, monkeypatch):
        monkeypatch.setattr(resend_contacts, "PAGE_SIZE", 2)
        for name in ("a", "b", "c", "d", "e"):
            _in_resend(fake_resend, name)
        _in_resend(fake_resend, "f", unsubscribed=True)

        listed = list_contacts()

        assert [c.email for c in listed] == [
            f"{n}@example.com" for n in ("a", "b", "c", "d", "e", "f")
        ]
        assert [c.unsubscribed for c in listed][-1] is True
        assert len([c for c in fake_resend.calls if c[1] == "/contacts"]) == 3

    def test_leaves_out_contacts_in_other_segments(self, fake_resend):
        _in_resend(fake_resend, "ours")
        fake_resend.contacts["theirs@example.com"] = {
            "segments": ["seg_other"],
            "topics": {},
        }

        assert [c.email for c in list_contacts()] == ["ours@example.com"]

    def test_gives_up_on_a_list_that_never_ends(
        self, fake_resend, monkeypatch
    ):
        monkeypatch.setattr(resend_contacts, "PAGE_SIZE", 1)
        monkeypatch.setattr(resend_contacts, "MAX_PAGES", 2)
        for name in ("a", "b", "c"):
            _in_resend(fake_resend, name)

        with pytest.raises(MarketingSyncError, match="did not end"):
            list_contacts()
