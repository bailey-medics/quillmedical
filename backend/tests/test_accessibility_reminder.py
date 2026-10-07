"""The yearly reminder to review the accessibility statement."""

import pytest

from app.email import accessibility_reminder as reminder
from app.email.accessibility_reminder import ReminderError, send_reminder
from app.email_send import EmailNotAllowedError, EmailSendError

GOOD = {
    "recipient": "mark@quill-medical.com",
    "reviewed": "25 September 2026",
    "due_by": "25 September 2027",
}


@pytest.fixture
def outbox(monkeypatch):
    """Every email the module tries to send, and a way to make it fail."""
    state = {"sent": [], "error": None}

    def send_email(**kwargs):
        if state["error"] is not None:
            raise state["error"]
        state["sent"].append(kwargs)

    monkeypatch.setattr(reminder, "send_email", send_email)
    return state


class TestTheEmail:
    def test_goes_to_the_recipient_with_the_due_date_in_the_subject(
        self, outbox
    ):
        send_reminder(**GOOD)

        [email] = outbox["sent"]
        assert email["to"] == "mark@quill-medical.com"
        assert email["subject"] == (
            "Accessibility statement review due by 25 September 2027"
        )

    def test_is_in_quills_layout_and_not_bare_text(self, outbox):
        send_reminder(**GOOD)

        [email] = outbox["sent"]
        assert "<html" in email["html_body"]
        assert email["from_name"] == "Quill Medical"

    def test_says_when_it_was_reviewed_links_the_statement_and_how_to_stop(
        self, outbox
    ):
        send_reminder(**GOOD)

        [email] = outbox["sent"]
        for body in (email["html_body"], email["text_body"]):
            assert "last reviewed on 25 September 2026" in body
            assert "https://quill-medical.com/accessibility-statement" in body
            assert "Move the REVIEWED date" in body


class TestWhatItIsGiven:
    @pytest.mark.parametrize(
        "recipient",
        [
            "",
            "not-an-address",
            "a@example.com, b@example.com",
            "a@example.com\nBcc: eve@example.com",
            "Mark <mark@quill-medical.com>",
        ],
    )
    def test_a_recipient_that_is_not_one_address_sends_nothing(
        self, outbox, recipient
    ):
        with pytest.raises(ReminderError, match="not an email address"):
            send_reminder(**{**GOOD, "recipient": recipient})

        assert outbox["sent"] == []

    @pytest.mark.parametrize("field", ["reviewed", "due_by"])
    @pytest.mark.parametrize(
        "value",
        [
            "",
            "2026-09-25",
            "25 September 2026\nSubject: something else",
            "25 September 2026 <script>",
            "soon",
        ],
    )
    def test_a_date_that_is_not_one_sends_nothing(self, outbox, field, value):
        """The dates reach an email's subject, and come from outside."""
        with pytest.raises(ReminderError, match="is not a date"):
            send_reminder(**{**GOOD, field: value})

        assert outbox["sent"] == []


class TestWhenItCannotBeSent:
    @pytest.mark.parametrize(
        "error",
        [EmailSendError("the provider refused"), EmailNotAllowedError("no")],
    )
    def test_says_so_without_repeating_the_providers_words(
        self, outbox, error
    ):
        outbox["error"] = error

        with pytest.raises(ReminderError) as raised:
            send_reminder(**GOOD)

        assert "could not be sent" in str(raised.value)
        assert "the provider refused" not in str(raised.value)


class TestFromTheCommandLine:
    @pytest.fixture
    def env(self, monkeypatch):
        monkeypatch.setenv("ACCESSIBILITY_RECIPIENT", GOOD["recipient"])
        monkeypatch.setenv("ACCESSIBILITY_REVIEWED", GOOD["reviewed"])
        monkeypatch.setenv("ACCESSIBILITY_DUE_BY", GOOD["due_by"])
        return monkeypatch

    def test_sends_and_says_so_with_the_address_hidden(
        self, env, outbox, capsys
    ):
        assert reminder.main() == 0

        assert len(outbox["sent"]) == 1
        out = capsys.readouterr().out
        assert "Reminder sent to m***@q***.com" in out
        assert "mark@quill-medical.com" not in out

    def test_fails_when_a_value_is_missing(self, env, outbox, capsys):
        env.delenv("ACCESSIBILITY_DUE_BY")

        assert reminder.main() == 1
        assert outbox["sent"] == []
        assert "due by date is not a date" in capsys.readouterr().err

    def test_fails_when_the_email_cannot_be_sent(self, env, outbox, capsys):
        outbox["error"] = EmailSendError("the provider refused")

        assert reminder.main() == 1
        assert "could not be sent" in capsys.readouterr().err
