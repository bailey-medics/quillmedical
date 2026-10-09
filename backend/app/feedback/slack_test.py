"""Posting to Slack that feedback has arrived.

What the route does with this, and that it never carries the message, is
in ``tests/test_feedback.py``. This is the module on its own: the words
of the post, and what happens when Slack cannot be reached.
"""

import logging

import httpx
import pytest

from app.feedback.slack import feedback_notice_text, post_feedback_notice

WEBHOOK = "https://hooks.slack.com/services/T000/B000/not-a-real-key"
URL = "https://example.test/admin/feedback/1"


class TestTheWordsOfThePost:
    def test_says_who_what_kind_which_page_and_where_to_read_it(self) -> None:
        text = feedback_notice_text(
            sender="sam", category="broken", route="/teaching/:bankId", url=URL
        )

        assert text == (
            "*Feedback from sam*\n"
            "Something is broken\n"
            "Sent from `/teaching/:bankId`\n"
            f"<{URL}|Read it in Quill>"
        )

    def test_what_a_person_typed_cannot_make_a_link_or_a_mention(self) -> None:
        text = feedback_notice_text(
            sender="<!channel> & co", category=None, route="", url=URL
        )

        assert "<!channel>" not in text
        assert "&lt;!channel&gt; &amp; co" in text

    def test_no_category_and_no_route_are_simply_left_out(self) -> None:
        text = feedback_notice_text(
            sender="sam", category=None, route="", url=URL
        )

        assert text == f"*Feedback from sam*\n<{URL}|Read it in Quill>"

    def test_a_category_with_no_label_is_left_out(self) -> None:
        text = feedback_notice_text(
            sender="sam", category="not-a-category", route="", url=URL
        )

        assert "not-a-category" not in text


class TestPosting:
    @staticmethod
    def _post(feedback_id: int = 7) -> None:
        post_feedback_notice(
            webhook_url=WEBHOOK,
            feedback_id=feedback_id,
            sender="sam",
            category="broken",
            route="/teaching",
            url=URL,
        )

    def test_sends_the_text_to_the_webhook_with_a_timeout(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        calls: list[dict[str, object]] = []

        def fake_post(url: str, **kwargs: object) -> httpx.Response:
            calls.append({"url": url, **kwargs})

            return httpx.Response(200, text="ok")

        monkeypatch.setattr("app.feedback.slack.httpx.post", fake_post)

        self._post()

        [call] = calls
        assert call["url"] == WEBHOOK
        assert call["json"] == {
            "text": feedback_notice_text(
                sender="sam", category="broken", route="/teaching", url=URL
            )
        }
        assert isinstance(call["timeout"], float) and call["timeout"] > 0

    @pytest.mark.parametrize(
        "outcome", ["unreachable", "timed out", "refused"]
    )
    def test_a_failure_is_swallowed_and_logged_without_the_webhook(
        self,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
        outcome: str,
    ) -> None:
        """The URL is the credential, and httpx's errors name it."""

        def fail(url: str, **kwargs: object) -> httpx.Response:
            if outcome == "unreachable":
                raise httpx.ConnectError(f"could not reach {url}")
            if outcome == "timed out":
                raise httpx.ReadTimeout(f"timed out reading {url}")

            return httpx.Response(404, text="no_service")

        monkeypatch.setattr("app.feedback.slack.httpx.post", fail)

        with caplog.at_level(logging.DEBUG):
            self._post(feedback_id=42)

        [record] = [r for r in caplog.records if "Slack post" in r.message]
        assert record.levelno == logging.ERROR
        assert record.__dict__["feedback_id"] == 42
        assert record.exc_info is None
        for logged in caplog.records:
            assert "not-a-real-key" not in logged.getMessage()
            assert "not-a-real-key" not in str(logged.__dict__)

    def test_a_post_slack_accepts_logs_nothing(
        self,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        monkeypatch.setattr(
            "app.feedback.slack.httpx.post",
            lambda url, **kwargs: httpx.Response(200, text="ok"),
        )

        with caplog.at_level(logging.DEBUG):
            self._post()

        assert [r for r in caplog.records if "Slack" in r.message] == []
