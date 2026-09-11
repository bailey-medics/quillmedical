"""Identifiers for passport records.

Two kinds, for two different jobs, and conflating them is the mistake
this module exists to prevent.

- **A timestamp id** identifies a record permanently:
  ``20260314T143207.881Z-8f14e45fceea167a5a36dedd4bea2543``. Globally
  unique, chronologically sortable, and stored inside the file. After
  VPR's ``TimestampId``.
- **A write-time filename or folder name** is what a human reads in a
  directory listing. Generated here too, so the naming rules live in one
  place, but never used as identity.

The distinction matters because **a timestamp gives chronology, not
identity**. Two records written in the same millisecond are still two
records, which is why the uuid is there; and a record's id must not
change when someone corrects the date it refers to, which is why the
clinical date lives in the file rather than in the id.

Clocks go backwards — NTP steps, virtual machines resume, leap seconds
get smeared. A generator that assumed otherwise would issue an id that
sorts before one it already issued, so :class:`TimestampIdGenerator`
enforces monotonicity explicitly, after VPR's rule of bumping to the
previous value plus one millisecond.
"""

from __future__ import annotations

import re
import threading
import uuid
from datetime import UTC, date, datetime, timedelta

#: A timestamp id: ``YYYYMMDDTHHMMSS.sssZ-<32 hex>``.
TIMESTAMP_ID = re.compile(
    r"^\d{8}T\d{6}\.\d{3}Z-[0-9a-f]{32}$",
)

_MILLISECOND_US = 1000


def _format(moment: datetime, unique: str) -> str:
    """Render one timestamp id.

    Args:
        moment: The instant, which must be timezone-aware and UTC.
        unique: 32 lower-case hex characters.

    Returns:
        The id.
    """
    stamp = moment.strftime("%Y%m%dT%H%M%S")
    milliseconds = moment.microsecond // _MILLISECOND_US
    return f"{stamp}.{milliseconds:03d}Z-{unique}"


class TimestampIdGenerator:
    """Issues timestamp ids that never go backwards.

    One instance per process is enough; it is safe to share between
    threads. The monotonic guarantee holds per instance, which is all a
    single writer needs — and a passport has a single writer by design,
    enforced by the per-passport lock in the service layer.

    What this does *not* claim: that the id's timestamp is the moment
    anything clinical happened. It is the moment the record was written.
    The three clocks a sign-off carries — when the work was observed,
    when the assessor signed, and when the file was written — are kept
    apart deliberately, and this is only ever the third.
    """

    def __init__(self) -> None:
        """Start with no history, so the first id is simply now."""
        self._lock = threading.Lock()
        self._previous: datetime | None = None

    def next(self, now: datetime | None = None) -> str:
        """Issue the next id.

        Args:
            now: The current instant, for tests. Defaults to the system
                clock in UTC. A naive datetime is refused rather than
                assumed to be UTC — guessing a timezone is how a record
                ends up an hour out with nothing to show it.

        Returns:
            A timestamp id, strictly greater than every id this instance
            has already returned.

        Raises:
            ValueError: If *now* is naive.
        """
        moment = now if now is not None else datetime.now(UTC)

        if moment.tzinfo is None:
            raise ValueError(
                "Refusing a naive datetime: pass an aware one in UTC, so a "
                "record cannot silently be an hour out."
            )

        moment = moment.astimezone(UTC)

        with self._lock:
            # Truncate to the millisecond the id actually records, so the
            # comparison is against what will be written rather than
            # against sub-millisecond precision the format discards.
            moment = moment.replace(
                microsecond=(moment.microsecond // _MILLISECOND_US)
                * _MILLISECOND_US
            )

            if self._previous is not None and moment <= self._previous:
                # The clock did not advance, or went backwards. Take the
                # next millisecond rather than reissuing or waiting: an
                # id is not a measurement, and blocking a clinical write
                # on a clock step would be worse than a millisecond of
                # drift.
                #
                # timedelta rather than .replace(microsecond=...), which
                # raises once the previous id landed on .999 — the carry
                # into the next second has to happen, and only date
                # arithmetic does it.
                moment = self._previous + timedelta(
                    microseconds=_MILLISECOND_US
                )

            self._previous = moment

        return _format(moment, uuid.uuid4().hex)


def is_timestamp_id(value: str) -> bool:
    """Whether *value* is shaped like a timestamp id.

    Shape only. It says nothing about whether the record exists, and
    nothing about whether the instant is plausible — a validator that
    rejected a date it found surprising would refuse to read a passport
    written by a machine with a bad clock, which is exactly when the
    record matters most.

    Args:
        value: The candidate.

    Returns:
        True if it matches the format.
    """
    return TIMESTAMP_ID.fullmatch(value) is not None


def new_passport_id() -> str:
    """A fresh passport id: 32 lower-case hex characters.

    Unhyphenated because it becomes two directory levels plus a
    directory name, and a hyphen there reads as a separator rather than
    part of the value.

    Returns:
        The id.
    """
    return uuid.uuid4().hex


def entry_filename(moment: datetime) -> str:
    """The stem for a logbook or CPD entry: ``YYYY-MM-DD-HHMMSS``.

    The moment Quill wrote the file, not the clinical date, for two
    reasons: the server always knows it, so nobody types anything; and
    it is unique without a hash suffix, which reads as noise to anyone
    who is not a developer. No colons, which Windows rejects.

    One consequence worth knowing: a raw folder listing is ordered by
    when things were logged, not when they happened. The clinical date
    lives inside the file as ``performed_on``, and the rendered passport
    and PDF sort by that.

    Args:
        moment: When the file is being written. Must be aware.

    Returns:
        The filename stem, without a suffix.

    Raises:
        ValueError: If *moment* is naive.
    """
    if moment.tzinfo is None:
        raise ValueError("Refusing a naive datetime: pass an aware one.")

    return moment.astimezone(UTC).strftime("%Y-%m-%d-%H%M%S")


def slugify(text: str) -> str:
    """Reduce free text to the slug half of a folder name.

    Folder names are for reading, so this keeps words and drops
    everything else. Deliberately lossy and not reversible: the
    authoritative value lives inside the file, and the name only has to
    make a directory listing legible.

    Args:
        text: The label, such as a competency display name or a
            reflection title.

    Returns:
        Lower-case words joined by single hyphens, or ``"untitled"``
        when nothing survives — an empty slug would produce a folder
        name ending in a bare hyphen.
    """
    slug = re.sub(r"[^a-z0-9]+", "-", text.casefold()).strip("-")
    return slug or "untitled"


def record_dir_name(
    on: date,
    label: str,
    *,
    suffix: int = 1,
) -> str:
    """A record directory's name: ``<date>-<slug>``, ``-2`` on a clash.

    Used for sign-offs, certificates and reflections. The date is the one
    the record is *about* — when the work was observed, when the
    certificate was awarded — not when the file was written, because
    someone looking for a sign-off thinks of when they did the procedure,
    not when the paperwork caught up.

    Args:
        on: The date the record refers to.
        label: Free text to slugify, usually a competency or a title.
        suffix: 1 for the first record of that date and label, then 2 and
            upwards. The store passes the first value that does not
            already exist.

    Returns:
        The directory name.

    Raises:
        ValueError: If *suffix* is below 1.
    """
    if suffix < 1:
        raise ValueError(f"Suffix must be 1 or greater, got {suffix}.")

    name = f"{on.isoformat()}-{slugify(label)}"
    return name if suffix == 1 else f"{name}-{suffix}"
