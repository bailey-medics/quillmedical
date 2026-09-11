"""Rendering commit messages for passport writes.

Every change to a passport is one commit, and every commit message is
built here. Nothing in this module touches git or a disk: it turns a
validated description of a write into the exact text that will be
committed, so the format can be tested without a repository.

The shape is ``passport:<action>: <summary>`` followed by trailers, after
VPR. Two properties are load-bearing, and both are enforced rather than
documented:

**Trailer keys are reserved.** A caller cannot invent one, and cannot set
a reserved one by hand. They are rendered only from validated structured
data, so nothing in a commit message can be spoofed by feeding a
carefully chosen name into a free-text field.

**Trailer values are single-line text.** A newline in a value would let
one trailer forge another — ``Actor-Name: Dr X\\nActor-Role: Consultant``
is two trailers if the newline survives. So values carrying a newline,
a carriage return, or a leading or trailing space are refused outright
rather than sanitised: quietly stripping a character changes what the
record says, and a caller passing a newline has a bug worth surfacing.

**No narrative and no patient data.** A commit message names an action, a
competency id and who acted. A passport holds no patient data by design,
and a message is the one place a careless summary could smuggle some in,
so the summary is built from structured values rather than free text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

#: What a passport write can be. A closed vocabulary, so a reader can
#: enumerate every kind of change that has ever happened to a record
#: without parsing prose.
#:
#: ``supersede`` is deliberately distinct from ``update``: it records a
#: clinical decision that earlier content is obsolete, which is not the
#: same as correcting a typo.
CommitAction = Literal[
    "create",
    "request",
    "sign-off",
    "decline",
    "supersede",
    "withdraw",
    "amend",
    "remove",
]

#: The trailer keys this module will render, in the order it renders
#: them. Reserved: a caller supplies the values, never the keys.
ACTOR_NAME = "Actor-Name"
ACTOR_ROLE = "Actor-Role"
ACTOR_REGISTRATION = "Actor-Registration"
CARE_LOCATION = "Care-Location"
COMPETENCY = "Competency"
SIGN_OFF = "Sign-Off"

RESERVED_TRAILERS = (
    ACTOR_NAME,
    ACTOR_ROLE,
    ACTOR_REGISTRATION,
    CARE_LOCATION,
    COMPETENCY,
    SIGN_OFF,
)

_SUMMARY_MAX = 72
_COMPETENCY_ID = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")


class CommitMessageError(ValueError):
    """A commit message could not be rendered from what was supplied.

    Its own type so the store can refuse the whole write rather than
    committing something malformed. A message that cannot be rendered
    means the caller's description of the change is wrong, and writing
    the files anyway would leave a record whose history does not say
    what happened.
    """


def _single_line(value: str, what: str) -> str:
    """Return *value* if it is safe as a trailer value, else refuse.

    Args:
        value: The untrusted text.
        what: The trailer key, for the error message.

    Returns:
        The same value, unchanged.

    Raises:
        CommitMessageError: If it is empty, or carries a newline, a
            carriage return, or surrounding whitespace. Refused rather
            than stripped: sanitising would change what the record says
            about a named person, and silently.
    """
    if not value:
        raise CommitMessageError(f"{what} must not be empty.")

    if "\n" in value or "\r" in value:
        raise CommitMessageError(
            f"{what} must be a single line: a newline in a trailer value "
            "would let one trailer forge another."
        )

    if value != value.strip():
        raise CommitMessageError(
            f"{what} must not begin or end with whitespace, which git "
            "would fold away and leave the record subtly different."
        )

    return value


@dataclass(frozen=True)
class Actor:
    """Who made a change, as recorded in the commit trailers.

    A snapshot in the message, exactly as the record itself holds one.
    The git author carries the same name, so the history and the record
    agree about who acted.
    """

    name: str
    role: str
    email: str
    registrations: tuple[str, ...] = ()
    care_location: str | None = None


@dataclass(frozen=True)
class CommitMessage:
    """One rendered commit message: a subject line and its trailers."""

    subject: str
    trailers: tuple[tuple[str, str], ...] = field(default=())

    def render(self) -> str:
        """The full message, as it will be committed.

        Returns:
            The subject, a blank line, then one trailer per line. No
            body: a passport commit carries structured facts, not
            narrative, so there is nothing for prose to add that the
            record does not hold better.
        """
        if not self.trailers:
            return f"{self.subject}\n"

        lines = "\n".join(f"{key}: {value}" for key, value in self.trailers)
        return f"{self.subject}\n\n{lines}\n"


def build(
    action: CommitAction,
    summary: str,
    actor: Actor,
    *,
    competency: str | None = None,
    sign_off: str | None = None,
) -> CommitMessage:
    """Render the message for one passport write.

    Args:
        action: What kind of change this is.
        summary: A short description, built by the caller from structured
            values rather than typed by a user. Never patient data.
        actor: Who is making the change.
        competency: The competency id this change concerns, where it
            concerns one.
        sign_off: The sign-off folder name, where the change is to a
            sign-off.

    Returns:
        The rendered message.

    Raises:
        CommitMessageError: If any value is empty, multi-line, or
            surrounded by whitespace; if the summary is too long for a
            subject line; or if the competency id is not a flat slug.
    """
    text = _single_line(summary, "Summary")

    subject = f"passport:{action}: {text}"
    if len(subject) > _SUMMARY_MAX:
        raise CommitMessageError(
            f"Subject line is {len(subject)} characters, over the "
            f"{_SUMMARY_MAX} a git subject should hold: {subject!r}."
        )

    trailers: list[tuple[str, str]] = [
        (ACTOR_NAME, _single_line(actor.name, ACTOR_NAME)),
        (ACTOR_ROLE, _single_line(actor.role, ACTOR_ROLE)),
    ]

    # One trailer per registration, rather than a joined list: a reader
    # grepping for a GMC number should find it on a line of its own.
    trailers.extend(
        (ACTOR_REGISTRATION, _single_line(registration, ACTOR_REGISTRATION))
        for registration in actor.registrations
    )

    if actor.care_location is not None:
        trailers.append(
            (CARE_LOCATION, _single_line(actor.care_location, CARE_LOCATION))
        )

    if competency is not None:
        checked = _single_line(competency, COMPETENCY)
        if not _COMPETENCY_ID.fullmatch(checked):
            raise CommitMessageError(
                f"Competency {competency!r} is not a flat slug. Hierarchy "
                "lives in the definition, never in an identifier."
            )
        trailers.append((COMPETENCY, checked))

    if sign_off is not None:
        trailers.append((SIGN_OFF, _single_line(sign_off, SIGN_OFF)))

    return CommitMessage(subject=subject, trailers=tuple(trailers))


def parse_trailers(message: str) -> dict[str, list[str]]:
    """Read the trailers back out of a rendered message.

    For reading history — an export, an audit view — rather than for
    anything on the write path. Returns a list per key because
    ``Actor-Registration`` legitimately repeats.

    Args:
        message: A full commit message.

    Returns:
        Trailer keys to their values, in the order they appeared. Keys
        this module does not render are ignored rather than returned:
        anything else in the message came from outside the application,
        and treating it as a trailer would give it standing it has not
        earned.
    """
    found: dict[str, list[str]] = {}

    _, separator, trailer_block = message.partition("\n\n")
    if not separator:
        return found

    for line in trailer_block.splitlines():
        key, sep, value = line.partition(": ")
        if sep and key in RESERVED_TRAILERS:
            found.setdefault(key, []).append(value)

    return found
