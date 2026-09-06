"""Pydantic schemas for analytics ingest."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

#: Longest each field may be. The browser truncates well below these, so a
#: report arriving at the limit is a client that is not the app, or one that
#: has been tampered with. Bounding them here keeps a public endpoint from
#: being a way to write arbitrary volume into the logs.
MAX_NAME = 100
MAX_MESSAGE = 400
MAX_STACK = 5000
MAX_COMPONENT_STACK = 3000
MAX_RELEASE = 100
MAX_ERROR_CODE = 100
MAX_ROUTE = 200
MAX_USER_AGENT = 300
MAX_SESSION_ID = 64
MAX_PATTERN = 200

#: At most twenty events, each no older than a day. Both bounds exist to cap
#: what one request can write, not because a longer trail would be useful.
MAX_BREADCRUMBS = 20
MAX_CRUMB_AGE_MS = 86_400_000

#: An error code is a fixed vocabulary the backend chooses, so it is matched
#: against that shape rather than scrubbed. Scrubbing cannot work here: the
#: redaction patterns are anchored on word boundaries, which do not fire inside
#: a larger token, so `CODE_1974-03-02` keeps its date. Rejecting every
#: separator means such a value never becomes a code in the first place.
ERROR_CODE_PATTERN = r"^[A-Za-z0-9_]*$"

#: A release is a revision, a tag or a semantic version — letters, digits and
#: separators. Matched against that shape rather than redacted: the prose rules
#: corrupt it, because a git revision routinely contains a run of five or more
#: digits and the record-number rule replaces them.
RELEASE_PATTERN = r"^[A-Za-z0-9._-]*$"

#: A session identifier is opaque by construction — the browser generates it
#: at random and holds it in memory only. Constraining the characters means it
#: cannot be used to smuggle text into the logs under a harmless-looking name.
SESSION_ID_PATTERN = r"^[A-Za-z0-9_-]*$"

#: Width by height, as the browser reports it: ``390x844``.
VIEWPORT_PATTERN = r"^(\d{1,5}x\d{1,5})?$"


class RouteCrumb(BaseModel):
    """A route change, recorded as the matched pattern and never the URL."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["route"]
    ms: int = Field(ge=0, le=MAX_CRUMB_AGE_MS)
    pattern: str = Field(max_length=MAX_PATTERN)


class ApiCrumb(BaseModel):
    """An API call, recorded as method, route pattern and status."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["api"]
    ms: int = Field(ge=0, le=MAX_CRUMB_AGE_MS)
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
    pattern: str = Field(max_length=MAX_PATTERN)
    status: int = Field(ge=100, le=599)


class AuthCrumb(BaseModel):
    """An authentication transition, from a closed set of four."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["auth"]
    ms: int = Field(ge=0, le=MAX_CRUMB_AGE_MS)
    event: Literal["login", "logout", "refresh", "expired"]


#: Discriminated on ``type`` so each kind of event is validated against its own
#: model. A single permissive model with optional fields would accept an auth
#: event carrying a status code, or a route change carrying a method, and the
#: point of allowlisting breadcrumbs is that only the named shapes get through.
Breadcrumb = Annotated[
    RouteCrumb | ApiCrumb | AuthCrumb,
    Field(discriminator="type"),
]


class ClientErrorIn(BaseModel):
    """A sanitised browser error report.

    The browser sanitises before sending — see
    ``frontend/src/lib/error-reporting/sanitise.ts`` — but this endpoint is
    public and unauthenticated, so nothing it receives is trusted. Fields are
    length-bounded, unknown fields are rejected, and the router redacts again
    before anything is logged.

    There is deliberately no ``user_id`` field. The endpoint accepts requests
    from anyone, so a caller-supplied identifier could attribute an error to
    any user it liked. The server reads the user from the session cookie when
    one is present instead, and ``extra="forbid"`` means a report that tries to
    supply one is rejected outright rather than quietly ignored.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(max_length=MAX_NAME)
    message: str = Field(default="", max_length=MAX_MESSAGE)
    stack: str = Field(default="", max_length=MAX_STACK)
    component_stack: str = Field(default="", max_length=MAX_COMPONENT_STACK)
    error_code: str = Field(
        default="", max_length=MAX_ERROR_CODE, pattern=ERROR_CODE_PATTERN
    )
    status: int | None = Field(default=None, ge=100, le=599)
    route: str = Field(default="", max_length=MAX_ROUTE)
    release: str = Field(
        default="", max_length=MAX_RELEASE, pattern=RELEASE_PATTERN
    )
    source: Literal["boundary", "window", "unhandledrejection"]
    session_id: str = Field(
        default="", max_length=MAX_SESSION_ID, pattern=SESSION_ID_PATTERN
    )
    user_agent: str = Field(default="", max_length=MAX_USER_AGENT)
    viewport: str = Field(default="", pattern=VIEWPORT_PATTERN)
    breadcrumbs: list[Breadcrumb] = Field(
        default_factory=list, max_length=MAX_BREADCRUMBS
    )
