"""Pydantic schemas for the inbox: what is waiting on the caller."""

from datetime import datetime

from pydantic import BaseModel


class InboxSourceOut(BaseModel):
    """One feature's count of what is waiting on the caller.

    ``source`` is a key from ``app.inbox.sources.SOURCES``, such as
    ``feedback_new``. A plain string and not an enumeration, so that a
    new source is an added value an older client simply does not draw,
    and not a change to the schema.
    """

    source: str
    count: int


class InboxOut(BaseModel):
    """Everything waiting on the caller, a source at a time, and in all.

    A source with nothing waiting is left out, so an empty list means
    nothing is waiting anywhere.
    """

    items: list[InboxSourceOut]
    total: int


class InboxItemOut(BaseModel):
    """One thing that is, or was, waiting on the caller.

    It says who and what kind, never what anybody wrote: the words are on
    the feature's own page. ``source`` and ``id`` together say where that
    page is, which the client works out, since the routes are its own.
    """

    source: str
    id: int
    title: str
    detail: str | None
    status: str | None
    created_at: datetime
    done: bool


class InboxItemsOut(BaseModel):
    """The caller's inbox, newest first: waiting, or lately dealt with."""

    items: list[InboxItemOut]
