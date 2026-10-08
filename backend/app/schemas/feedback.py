"""Pydantic schemas for user feedback.

The captured context - route, release, viewport, user agent, breadcrumbs -
takes the same bounds and shapes the error reports do, from
``app.schemas.analytics``, so the two can be lined up and neither accepts
anything the other would refuse.
"""

from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)
from pydantic.json_schema import SkipJsonSchema

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

#: Longest comment an operator may write back. A few sentences saying what
#: was done, not a second report.
MAX_COMMENT = 2000

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


#: Where a piece of feedback has got to. Kept in step with
#: ``FEEDBACK_STATUSES`` in ``app.models`` by a test.
FeedbackStatus = Literal["new", "acknowledged", "resolved", "wont_fix"]


class FeedbackItemOut(BaseModel):
    """One piece of feedback, as an operator reads it.

    Carries the message, so only an operator route returns this shape.
    ``sender`` is the username, or None once that user has been deleted.
    ``comment`` is what an operator wrote back, or None if nobody has.
    """

    id: int
    status: FeedbackStatus
    comment: str | None
    category: FeedbackCategory | None
    message: str
    sender: str | None
    route: str
    release: str
    viewport: str
    user_agent: str
    breadcrumbs: list[dict[str, object]]
    error_name: str | None
    error_code: str | None
    created_at: datetime


class FeedbackListOut(BaseModel):
    """Every piece of feedback, newest first."""

    items: list[FeedbackItemOut]


class MyFeedbackItemOut(BaseModel):
    """One piece of the caller's own feedback, as they see it.

    Only what they wrote, where it has got to and what an operator wrote
    back. None of the context captured alongside it: they did not type
    that, and do not need it back.
    """

    id: int
    status: FeedbackStatus
    comment: str | None
    category: FeedbackCategory | None
    message: str
    created_at: datetime


class MyFeedbackListOut(BaseModel):
    """The caller's own feedback, newest first."""

    items: list[MyFeedbackItemOut]


class FeedbackSeenOut(BaseModel):
    """How many replies stopped waiting when the caller opened their page."""

    seen: int


class FeedbackUpdateIn(BaseModel):
    """An operator's answer to a piece of feedback: a status, a comment
    or both.

    Each is left alone unless the body names it, so the status select and
    the comment box save separately. ``comment`` as null or blank removes
    the comment. What the sender wrote is not here, so it cannot be edited.
    """

    model_config = ConfigDict(extra="forbid")

    # None stands for "not named" here and is refused when sent, so it is
    # kept out of the published schema. Left in, the schema wraps the
    # statuses in an anyOf, and the breaking-change check reads that as
    # every status having been removed from the request.
    status: FeedbackStatus | SkipJsonSchema[None] = None
    comment: str | None = Field(default=None, max_length=MAX_COMMENT)

    @field_validator("comment")
    @classmethod
    def _comment_trimmed(cls, value: str | None) -> str | None:
        """Trim the comment, and store a blank one as no comment."""
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def _changes_something(self) -> "FeedbackUpdateIn":
        """Refuse a body that names neither field, or a null status.

        ``status`` is optional so the comment can be saved alone, but
        the column is not nullable: naming it means giving one.
        """
        if not self.model_fields_set:
            raise ValueError("give a status, a comment or both")
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("status must not be null")
        return self
