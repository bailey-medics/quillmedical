"""Pydantic schemas for marketing email preferences."""

from pydantic import BaseModel, ConfigDict


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


class MarketingUnsubscribeOut(BaseModel):
    """What the unsubscribe link's routes answer.

    Attributes:
        email: The address the link is for, with most of it hidden. The
            link may have been forwarded, so whoever holds it is shown
            enough to recognise their own address and not enough to
            learn somebody else's.
        marketing_emails: Whether they are sent news and updates.
    """

    email: str
    marketing_emails: bool
