"""Sending a newsletter to everybody who said yes, and to nobody else."""

import pytest
from sqlalchemy import select

from app.email_send import EmailNotAllowedError, EmailSendError
from app.marketing import newsletter
from app.marketing.newsletter import (
    NewsletterError,
    confirmation,
    recipients,
    send_campaign,
    unsubscribe_links,
)
from app.models import NewsletterSend, User
from app.security import verify_marketing_unsubscribe_token

CAMPAIGN = "trial"


def _user(db_session, name, *, verified=True, active=True, wants=True):
    user = User(
        username=name,
        email=f"{name}@example.com",
        password_hash="x",
        email_verified=verified,
        is_active=active,
        marketing_emails=wants,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def people(db_session):
    """Three who said yes, and one of each kind who must get nothing."""
    return {
        "ada": _user(db_session, "ada"),
        "bob": _user(db_session, "bob"),
        "cat": _user(db_session, "cat"),
        "refused": _user(db_session, "refused", wants=False),
        "unverified": _user(db_session, "unverified", verified=False),
        "closed": _user(db_session, "closed", active=False),
    }


@pytest.fixture
def outbox(monkeypatch):
    """Every email the module tries to send, and a way to make one fail."""
    state = {"sent": [], "fail_for": set(), "refuse_for": set(), "hook": None}

    def send_email(**kwargs):
        to = kwargs["to"]
        if state["hook"] is not None:
            state["hook"](to)
        if to in state["refuse_for"]:
            raise EmailNotAllowedError("not on the allow-list")
        if to in state["fail_for"]:
            raise EmailSendError("the provider refused")
        state["sent"].append(kwargs)

    monkeypatch.setattr(newsletter, "send_email", send_email)
    monkeypatch.setattr(newsletter.time, "sleep", lambda seconds: None)
    return state


def _sent_to(outbox):
    return [email["to"] for email in outbox["sent"]]


def _rows(db_session):
    return list(db_session.execute(select(NewsletterSend)).scalars().all())


def _go(db_session, **kwargs):
    """Send for real: a dry run for the value to confirm, then the send."""
    dry = send_campaign(db_session, CAMPAIGN, **kwargs)
    return send_campaign(
        db_session,
        CAMPAIGN,
        confirm=confirmation(CAMPAIGN, len(dry.recipients)),
        **kwargs,
    )


class TestWhoIsSentIt:
    def test_only_the_verified_active_people_who_said_yes(
        self, db_session, people
    ):
        assert [u.username for u in recipients(db_session)] == [
            "ada",
            "bob",
            "cat",
        ]

    def test_a_send_reaches_them_and_nobody_else(
        self, db_session, people, outbox
    ):
        result = _go(db_session)

        assert result.sent == 3
        assert _sent_to(outbox) == [
            "ada@example.com",
            "bob@example.com",
            "cat@example.com",
        ]

    def test_somebody_who_says_no_while_it_runs_is_not_sent_it(
        self, db_session, people, outbox
    ):
        """The list is read again just before each person's turn."""

        def bob_unsubscribes(to):
            if to == "ada@example.com":
                people["bob"].marketing_emails = False
                db_session.commit()

        outbox["hook"] = bob_unsubscribes

        result = _go(db_session)

        assert _sent_to(outbox) == ["ada@example.com", "cat@example.com"]
        assert result.withdrew == 1
        assert result.sent == 2

    def test_an_account_closed_while_it_runs_is_not_sent_it(
        self, db_session, people, outbox
    ):
        def cat_leaves(to):
            if to == "ada@example.com":
                people["cat"].is_active = False
                db_session.commit()

        outbox["hook"] = cat_leaves

        result = _go(db_session)

        assert "cat@example.com" not in _sent_to(outbox)
        assert result.withdrew == 1


class TestADryRun:
    def test_sends_nothing_and_records_nothing(
        self, db_session, people, outbox
    ):
        result = send_campaign(db_session, CAMPAIGN)

        assert outbox["sent"] == []
        assert _rows(db_session) == []
        assert result.sent == 0

    def test_lists_who_would_get_it_with_addresses_hidden(
        self, db_session, people, outbox
    ):
        result = send_campaign(db_session, CAMPAIGN)

        assert result.recipients == [
            "a***@e***.com",
            "b***@e***.com",
            "c***@e***.com",
        ]


class TestConfirming:
    def test_the_wrong_value_sends_nothing(self, db_session, people, outbox):
        with pytest.raises(NewsletterError, match="CONFIRM does not match"):
            send_campaign(db_session, CAMPAIGN, confirm="trial:99")

        assert outbox["sent"] == []

    def test_a_list_that_changed_since_the_dry_run_sends_nothing(
        self, db_session, people, outbox
    ):
        """The value names the count, so a stale dry run cannot send."""
        dry = send_campaign(db_session, CAMPAIGN)
        _user(db_session, "dan")

        with pytest.raises(NewsletterError):
            send_campaign(
                db_session,
                CAMPAIGN,
                confirm=confirmation(CAMPAIGN, len(dry.recipients)),
            )

        assert outbox["sent"] == []


class TestEachEmail:
    def test_carries_that_persons_own_unsubscribe_link(
        self, db_session, people, outbox
    ):
        _go(db_session)

        for email, name in zip(
            outbox["sent"], ["ada", "bob", "cat"], strict=True
        ):
            page, one_click = unsubscribe_links(people[name])
            assert page in email["html_body"]
            assert page in email["text_body"]
            assert email["headers"] == {
                "List-Unsubscribe": f"<{one_click}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }

    def test_the_link_opens_that_persons_preference_only(
        self, db_session, people
    ):
        page, one_click = unsubscribe_links(people["bob"])

        for link in (page, one_click):
            token = link.split("token=")[1]
            assert verify_marketing_unsubscribe_token(token) == (
                people["bob"].id
            )
        assert "/unsubscribe?token=" in page
        assert "/api/marketing/unsubscribe?token=" in one_click

    def test_no_address_is_in_another_persons_email(
        self, db_session, people, outbox
    ):
        _go(db_session)

        ada = outbox["sent"][0]
        assert "bob@example.com" not in ada["html_body"]
        assert ada["from_name"] == "Mark at Quill Medical"


class TestRunningItAgain:
    def test_reaches_nobody_a_second_time(self, db_session, people, outbox):
        _go(db_session)
        outbox["sent"].clear()

        again = send_campaign(db_session, CAMPAIGN)

        assert again.recipients == []
        assert again.already == 3

    def test_after_a_failure_reaches_only_who_was_missed(
        self, db_session, people, outbox
    ):
        outbox["fail_for"] = {"bob@example.com"}
        first = _go(db_session)

        assert first.sent == 2
        assert first.failed == 1
        assert {row.user_id for row in _rows(db_session)} == {
            people["ada"].id,
            people["cat"].id,
        }

        outbox["fail_for"] = set()
        outbox["sent"].clear()
        second = _go(db_session)

        assert _sent_to(outbox) == ["bob@example.com"]
        assert second.sent == 1
        assert second.already == 2

    def test_an_address_this_environment_may_not_write_to_is_counted(
        self, db_session, people, outbox
    ):
        outbox["refuse_for"] = {"cat@example.com"}

        result = _go(db_session)

        assert result.refused == 1
        assert result.sent == 2


class TestATrialToOneAddress:
    def test_reaches_only_them_and_is_not_recorded(
        self, db_session, people, outbox
    ):
        result = _go(db_session, only_to="Bob@Example.com")

        assert _sent_to(outbox) == ["bob@example.com"]
        assert result.sent == 1
        # Not recorded, so the real send still reaches them.
        assert _rows(db_session) == []

    @pytest.mark.parametrize(
        "address",
        [
            "refused@example.com",
            "unverified@example.com",
            "closed@example.com",
            "nobody@example.com",
        ],
    )
    def test_cannot_be_somebody_who_may_not_be_sent_it(
        self, db_session, people, outbox, address
    ):
        with pytest.raises(NewsletterError, match="nobody who may be sent"):
            send_campaign(db_session, CAMPAIGN, only_to=address)

        assert outbox["sent"] == []


class TestTheCampaign:
    def test_one_that_does_not_exist_sends_nothing(
        self, db_session, people, outbox
    ):
        with pytest.raises(NewsletterError, match="no campaign called"):
            send_campaign(db_session, "no-such-campaign")

        assert outbox["sent"] == []

    @pytest.mark.parametrize(
        "name", ["../base", "Trial", "trial.html", "", "a/b", "-x"]
    )
    def test_a_name_that_is_not_one_is_refused(
        self, db_session, people, outbox, name
    ):
        """It becomes a file name, so it may not reach outside its folder."""
        with pytest.raises(NewsletterError, match="Not a campaign name"):
            send_campaign(db_session, name)

    def test_goes_out_as_the_brand_whose_folder_it_is_in(
        self, db_session, people, outbox
    ):
        """`ldd-trial` is under `campaigns/ldd/`, so it is Let's Do Digital's."""
        dry = send_campaign(db_session, "ldd-trial", only_to="ada@example.com")
        send_campaign(
            db_session,
            "ldd-trial",
            only_to="ada@example.com",
            confirm=confirmation("ldd-trial", len(dry.recipients)),
        )

        [email] = outbox["sent"]
        assert email["from_name"] == "Mark at Let's Do Digital"
        assert email["subject"] == "A trial newsletter from Let's Do Digital"
        assert "Let's Do Digital is a trading name" in email[
            "html_body"
        ].replace("&#39;", "'")

    def test_a_quill_campaign_goes_from_the_apps_own_address(
        self, db_session, people, outbox
    ):
        _go(db_session, only_to="ada@example.com")

        [email] = outbox["sent"]
        assert email["from_address"] is None

    def test_lets_do_digital_goes_from_the_apps_address_until_it_has_its_own(
        self, db_session, people, outbox, monkeypatch
    ):
        """Its domain has to be verified with the mail provider first."""
        for address, expected in (
            ("", None),
            ("news@letsdodigital.example", "news@letsdodigital.example"),
        ):
            monkeypatch.setattr(newsletter.settings, "EMAIL_FROM_LDD", address)
            outbox["sent"].clear()
            dry = send_campaign(
                db_session, "ldd-trial", only_to="ada@example.com"
            )
            send_campaign(
                db_session,
                "ldd-trial",
                only_to="ada@example.com",
                confirm=confirmation("ldd-trial", len(dry.recipients)),
            )

            [email] = outbox["sent"]
            assert email["from_address"] == expected

    def test_the_brands_are_the_themes(self):
        assert newsletter.campaign_brand("trial") == "quill"
        assert newsletter.campaign_brand("ldd-trial") == "ldd"

    def test_a_name_two_brands_share_is_refused(self, tmp_path, monkeypatch):
        for brand in ("quill", "ldd"):
            (tmp_path / brand).mkdir()
            (tmp_path / brand / "twice.html.j2").write_text("")
        monkeypatch.setattr(newsletter, "CAMPAIGNS_DIR", tmp_path)

        with pytest.raises(NewsletterError, match="More than one brand"):
            newsletter.campaign_brand("twice")

    def test_the_trial_says_what_it_is(self, db_session, people, outbox):
        _go(db_session, only_to="ada@example.com")

        [email] = outbox["sent"]
        assert email["subject"] == "A trial newsletter from Quill Medical"
        assert "This is a test" in email["html_body"]
        assert "Unsubscribe" in email["html_body"]


class _Session:
    """The test's session, as ``main`` would open and close its own."""

    def __init__(self, session):
        self._session = session

    def __getattr__(self, name):
        return getattr(self._session, name)

    def close(self):
        """Left open: the fixture owns it."""


class TestFromTheCommandLine:
    @pytest.fixture
    def run(self, db_session, monkeypatch):
        from app.db import core_db

        monkeypatch.setattr(
            core_db, "CoreSessionLocal", lambda: _Session(db_session)
        )
        for name in ("NEWSLETTER_CAMPAIGN", "CONFIRM", "NEWSLETTER_ONLY_TO"):
            monkeypatch.delenv(name, raising=False)
        return monkeypatch

    def test_a_dry_run_prints_the_value_to_pass_back(
        self, run, people, outbox, capsys
    ):
        run.setenv("NEWSLETTER_CAMPAIGN", CAMPAIGN)

        assert newsletter.main() == 0

        out = capsys.readouterr().out
        assert "Nothing was sent" in out
        assert "CONFIRM=trial:3" in out
        assert "ada@example.com" not in out
        assert outbox["sent"] == []

    def test_sends_when_that_value_is_passed_back(
        self, run, people, outbox, capsys
    ):
        run.setenv("NEWSLETTER_CAMPAIGN", CAMPAIGN)
        run.setenv("CONFIRM", "trial:3")

        assert newsletter.main() == 0

        assert len(outbox["sent"]) == 3
        assert "3 sent" in capsys.readouterr().out

    def test_fails_when_anybody_could_not_be_reached(
        self, run, people, outbox, capsys
    ):
        outbox["fail_for"] = {"bob@example.com"}
        run.setenv("NEWSLETTER_CAMPAIGN", CAMPAIGN)
        run.setenv("CONFIRM", "trial:3")

        assert newsletter.main() == 1
        assert "1 failed" in capsys.readouterr().out

    def test_needs_a_campaign(self, run, capsys):
        assert newsletter.main() == 1
        assert "NEWSLETTER_CAMPAIGN is required" in capsys.readouterr().err
