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


class MailingListCheckOut(BaseModel):
    """What importing a mailing list file would do, or did, in numbers.

    No address and no name is ever in it: a row that could not be read
    is named by its number in the file.

    Attributes:
        rows: Rows in the file, the header aside.
        new: People not on the mailing list yet.
        already_there: People on it whom the file leaves as they are.
        switched_off: People on it, subscribed, whom the file opts out.
        opted_in: People in the file opted in.
        opted_out: People in the file opted out.
        have_accounts: People in the file who hold a verified account,
            kept as that account and not on the list.
        no_address: Rows with no usable address, left out.
        unreadable_answer: Rows whose opt in or out could not be read,
            left out.
        repeated: Rows naming an address an earlier row had.
        has_opt_column: Whether the file said who is opted in and out.
            Without the column everybody in it is taken as opted in.
        no_address_rows: The numbers of the first such rows.
        unreadable_answer_rows: The numbers of the first such rows.
        fingerprint: What to send back to import this file for real.
        imported: Whether this was the import and not only a check.
    """

    rows: int
    new: int
    already_there: int
    switched_off: int
    opted_in: int
    opted_out: int
    have_accounts: int
    no_address: int
    unreadable_answer: int
    repeated: int
    has_opt_column: bool
    no_address_rows: list[int]
    unreadable_answer_rows: list[int]
    fingerprint: str
    imported: bool


class NewsletterAudienceOut(BaseModel):
    """How many people a newsletter would reach, by kind.

    Attributes:
        accounts: Account holders who may be sent one.
        subscribers: Mailing-list subscribers who may be sent one.
        unsubscribed: Mailing-list subscribers who have unsubscribed.
    """

    accounts: int
    subscribers: int
    unsubscribed: int
