"""Post to Slack that feedback has arrived.

Beside the email in :mod:`app.feedback.router`, and under the same rule:
the post says who sent the feedback, what kind it is, which page it came
from and where to read it, and **never the message**. Somebody may send
feedback from a patient's record, so the message may hold patient data,
and a post would copy it into a system outside Quill.

The webhook URL is the credential: anybody holding it can post to the
channel. So it is a ``SecretStr`` in the settings, it is never logged,
and a failure is logged by its kind alone, because the errors ``httpx``
raises name the URL they were sent to. ``Settings`` refuses a value that
does not start ``https://hooks.slack.com/``, so a slip in it cannot send
the post somewhere else.
"""

import logging

import httpx

from app.feedback.labels import CATEGORY_LABELS

logger = logging.getLogger(__name__)

#: How long to wait for Slack. Short: this runs after the response has
#: gone, and a notice is not worth holding a worker for.
_TIMEOUT_SECONDS = 5.0


def _escape(text: str) -> str:
    """Make *text* safe to put in a Slack message.

    Slack reads ``<...>`` as a link or a mention and ``&`` as the start
    of an entity, and asks for exactly these three to be replaced. A
    username is typed by a person, so it is escaped before it is posted.
    """
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def feedback_notice_text(
    *, sender: str, category: str | None, route: str, url: str
) -> str:
    """The words of the post.

    Args:
        sender: The username of whoever sent the feedback.
        category: What they said it was about, as stored, or None.
        route: The page it was sent from, as a route pattern, or "".
        url: The link to the feedback in the admin area.

    Returns:
        The message, in Slack's own markup.
    """
    lines = [f"*Feedback from {_escape(sender)}*"]
    label = CATEGORY_LABELS.get(category or "")

    if label:
        lines.append(_escape(label))
    if route:
        lines.append(f"Sent from `{_escape(route)}`")

    lines.append(f"<{url}|Read it in Quill>")

    return "\n".join(lines)


def post_feedback_notice(
    *,
    webhook_url: str,
    feedback_id: int,
    sender: str,
    category: str | None,
    route: str,
    url: str,
) -> None:
    """Post the notice to the channel the webhook belongs to.

    Run as a background task, after the response has gone. A failure is
    logged and swallowed, as the email's is: the feedback is stored, and
    Slack being down must not look like the feedback having been lost.

    Args:
        webhook_url: The Slack incoming webhook. Never logged.
        feedback_id: The feedback's id, for the log line alone.
        sender: The username of whoever sent it.
        category: What they said it was about, as stored, or None.
        route: The page it was sent from, as a route pattern, or "".
        url: The link to the feedback in the admin area.
    """
    text = feedback_notice_text(
        sender=sender, category=category, route=route, url=url
    )

    try:
        response = httpx.post(
            webhook_url, json={"text": text}, timeout=_TIMEOUT_SECONDS
        )
    except httpx.HTTPError as exc:
        # The kind of failure and not the exception: its message, and so
        # a traceback, names the URL, which is the secret.
        logger.error(
            "feedback Slack post not sent",
            extra={"feedback_id": feedback_id, "reason": type(exc).__name__},
        )

        return

    # Not raise_for_status(), whose error names the URL too.
    if response.status_code >= 400:
        logger.error(
            "feedback Slack post refused",
            extra={
                "feedback_id": feedback_id,
                "status_code": response.status_code,
            },
        )
