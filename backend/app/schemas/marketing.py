"""Pydantic schemas for marketing email preferences."""

from typing import Literal

from pydantic import BaseModel


class ResendWebhookOut(BaseModel):
    """What the Resend webhook route answers.

    Attributes:
        status: ``updated`` when somebody's preference changed,
            ``unchanged`` when it already matched, and ``ignored`` for an
            event about anything else or an address with no account.
    """

    status: Literal["updated", "unchanged", "ignored"]
