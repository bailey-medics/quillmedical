"""What the retention decisions routes take and give.

For the screen where a superadmin decides what happens to a closed
account's training records once their sponsor's period has passed. See
``RetentionReview`` in ``app.models`` and ``app.retention``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.retention import MOST_MONTHS_KEPT

#: The most characters a note may hold. The column is this wide.
MAX_NOTE = 2000

#: The most decisions one request may carry.
MAX_DECISIONS = 200


class RetentionReviewOut(BaseModel):
    """One person's records at one organisation, awaiting a decision.

    Attributes:
        id: The row to decide.
        user_id: Whose records.
        full_name: Their name. Shown here and nowhere outside the app.
        email: Their email address.
        org_unit_id: The organisation holding the records.
        organisation: Its name.
        closed_at: When their account was closed.
        due_on: When that organisation's period for them ended.
        attempts: Attempts that a decision to delete would remove.
        enrolments: Enrolments it would remove.
        listed_at: When the nightly run first listed them.
    """

    id: int
    user_id: int
    full_name: str
    email: str
    org_unit_id: int
    organisation: str
    closed_at: datetime
    due_on: datetime
    attempts: int
    enrolments: int
    listed_at: datetime


class RetentionAccountOut(BaseModel):
    """One closed account, awaiting a decision to empty it.

    A list of its own, beside the records: an account is at no
    organisation and has nothing to count.

    Attributes:
        id: The row to decide.
        user_id: Whose account.
        full_name: Their name. Shown here and nowhere outside the app.
        email: Their email address.
        closed_at: When the account was closed.
        due_on: When it had been kept as long as an account is.
        listed_at: When the nightly run first listed it.
    """

    id: int
    user_id: int
    full_name: str
    email: str
    closed_at: datetime
    due_on: datetime
    listed_at: datetime


class RetentionReviewListOut(BaseModel):
    """Everything awaiting a decision, longest waiting first.

    Attributes:
        reviews: Training records, one entry for each person at each
            organisation.
        accounts: Closed accounts with no records left.
    """

    reviews: list[RetentionReviewOut]
    accounts: list[RetentionAccountOut] = Field(default_factory=list)


class RetentionDecisionIn(BaseModel):
    """What to do with one set of records, or one account.

    A row that is to stay undecided is simply left out of the request.

    Attributes:
        review_id: The row.
        decision: ``delete`` or ``keep``. For an account, ``delete``
            marks it to be emptied by the nightly run.
        note: Why. Needed to keep, optional to delete.
        ask_again_on: For ``keep``, when to ask again. Required: a keep
            with no date would be a keep for ever. Not used by
            ``delete``.
    """

    model_config = ConfigDict(extra="forbid")

    review_id: int
    decision: Literal["delete", "keep"]
    note: str | None = Field(default=None, max_length=MAX_NOTE)
    ask_again_on: datetime | None = None

    @model_validator(mode="after")
    def _a_keep_names_its_date(self) -> RetentionDecisionIn:
        if self.decision == "keep" and self.ask_again_on is None:
            raise ValueError("A keep needs the date to ask again on.")

        return self


class RetentionDecisionsIn(BaseModel):
    """The decisions made in one go."""

    model_config = ConfigDict(extra="forbid")

    decisions: list[RetentionDecisionIn] = Field(
        min_length=1, max_length=MAX_DECISIONS
    )


class RecordsKeptOut(BaseModel):
    """How long one organisation's records outlast a closed account.

    Attributes:
        org_unit_id: The organisation.
        organisation: Its name.
        months: The months, or None when its records are never listed
            for a decision.
    """

    org_unit_id: int
    organisation: str
    months: int | None


class RecordsKeptIn(BaseModel):
    """The period to set. ``months`` must be sent, and may be null.

    Attributes:
        months: 1 to 600, or null to stop listing this organisation's
            records.
    """

    model_config = ConfigDict(extra="forbid")

    months: int | None = Field(ge=1, le=MOST_MONTHS_KEPT)


class RetentionRefusalOut(BaseModel):
    """A decision that was not carried out, and why."""

    review_id: int
    reason: str


class RetentionDecisionsOut(BaseModel):
    """What was done.

    Attributes:
        deleted: Sets of records deleted.
        kept: Sets of records, and accounts, kept.
        to_empty: Accounts marked to be emptied by the nightly run.
        refused: Decisions not carried out. The others still were.
    """

    deleted: int
    kept: int
    to_empty: int = 0
    refused: list[RetentionRefusalOut]
