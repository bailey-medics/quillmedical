"""Pydantic schemas for user feedback.

The captured context — route, release, viewport, user agent, breadcrumbs —
takes the same bounds and shapes the error reports do, from
``app.schemas.analytics``, so the two can be lined up and neither accepts
anything the other would refuse.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.analytics import (
    ERROR_CODE_PATTERN,
    MAX_BREADCRUMBS,
    MAX_ERROR_CODE,
    MAX_NAME,
    MAX_RELEASE,
    MAX_ROUTE,
    MAX_USER_AGENT,
    RELEASE_PATTERN,
    VIEWPORT_PATTERN,
    Breadcrumb,
)

#: Longest message accepted. Room for a careful description of what went
#: wrong, and a bound on what one request can store.
MAX_MESSAGE = 5000

#: What the sender may say the feedback is about. Kept in step with
#: ``FEEDBACK_CATEGORIES`` in ``app.models`` by a test.
FeedbackCategory = Literal["broken", "inaccurate", "suggestion", "other"]


class FeedbackIn(BaseModel):
    """A message from a signed-in user, with the context it was sent from.

    There is deliberately no ``user_id`` field. The sender is read from the
    session cookie, so feedback cannot be attributed to anybody else, and
    ``extra="forbid"`` rejects a body that tries to supply one.
    """

    model_config = ConfigDict(extra="forbid")

    category: FeedbackCategory | None = None
    message: str = Field(min_length=1, max_length=MAX_MESSAGE)
    route: str = Field(default="", max_length=MAX_ROUTE)
    release: str = Field(
        default="", max_length=MAX_RELEASE, pattern=RELEASE_PATTERN
    )
    viewport: str = Field(default="", pattern=VIEWPORT_PATTERN)
    user_agent: str = Field(default="", max_length=MAX_USER_AGENT)
    breadcrumbs: list[Breadcrumb] = Field(
        default_factory=list, max_length=MAX_BREADCRUMBS
    )
    error_name: str = Field(default="", max_length=MAX_NAME)
    error_code: str = Field(
        default="", max_length=MAX_ERROR_CODE, pattern=ERROR_CODE_PATTERN
    )

    @field_validator("message")
    @classmethod
    def _message_not_blank(cls, value: str) -> str:
        """Refuse a message that is only whitespace.

        ``min_length`` counts spaces, so without this a message of three
        spaces would be stored as feedback.
        """
        stripped = value.strip()
        if not stripped:
            raise ValueError("message must not be blank")
        return stripped


class FeedbackCreatedOut(BaseModel):
    """The id of the feedback just stored, so the sender can see it landed."""

    id: int
