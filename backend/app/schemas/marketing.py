"""Pydantic schemas for marketing email preferences."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class ResendWebhookOut(BaseModel):
    """What the Resend webhook route answers.

    Attributes:
        status: ``updated`` when somebody's preference changed,
            ``unchanged`` when it already matched, and ``ignored`` for an
            event about anything else or an address with no account.
    """

    status: Literal["updated", "unchanged", "ignored"]


class MarketingPreferenceIn(BaseModel):
    """A person changing whether they are sent news and updates.

    Attributes:
        wants_marketing: Whether they want them.
    """

    model_config = ConfigDict(extra="forbid")

    wants_marketing: bool


class MarketingPreferenceOut(BaseModel):
    """Somebody's marketing preference as it now stands.

    Attributes:
        marketing_emails: Whether they are sent news and updates.
    """

    marketing_emails: bool
