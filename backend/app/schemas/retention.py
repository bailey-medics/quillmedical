"""What the retention decisions routes take and give.

For the screen where a superadmin decides what happens to a closed
account's training records once their sponsor's period has passed. See
``RetentionReview`` in ``app.models`` and ``app.retention``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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


class RetentionReviewListOut(BaseModel):
    """Everything awaiting a decision, longest waiting first."""

    reviews: list[RetentionReviewOut]


class RetentionDecisionIn(BaseModel):
    """What to do with one set of records.

    A row that is to stay undecided is simply left out of the request.

    Attributes:
        review_id: The row.
        decision: ``delete`` or ``keep``.
        note: Why. Needed to keep, optional to delete.
        ask_again_on: For ``keep``, when to ask again. Six months on
            when left out.
    """

    model_config = ConfigDict(extra="forbid")

    review_id: int
    decision: Literal["delete", "keep"]
    note: str | None = Field(default=None, max_length=MAX_NOTE)
    ask_again_on: datetime | None = None


class RetentionDecisionsIn(BaseModel):
    """The decisions made in one go."""

    model_config = ConfigDict(extra="forbid")

    decisions: list[RetentionDecisionIn] = Field(
        min_length=1, max_length=MAX_DECISIONS
    )


class RetentionRefusalOut(BaseModel):
    """A decision that was not carried out, and why."""

    review_id: int
    reason: str


class RetentionDecisionsOut(BaseModel):
    """What was done.

    Attributes:
        deleted: Sets of records deleted.
        kept: Sets of records kept.
        refused: Decisions not carried out. The others still were.
    """

    deleted: int
    kept: int
    refused: list[RetentionRefusalOut]
