"""Fingerprinting a sign-off, so a printed record can be checked.

A ``content_hash`` is SHA-256 over a canonical serialisation of the
fields that carry meaning, after Doorstop's discipline. The point is the
selectivity: tidying a comment or correcting a display label must leave
the fingerprint alone, while changing the level, a date or the assessor
must change it. A fingerprint that moved whenever anything moved would
be no more useful than the file's own checksum, and would make every
cosmetic edit look like tampering.

**Which fields contribute is declared on the model, not here.** The plan
is explicit that canonical form belongs in the schema rather than in
whichever function got written first, and the reason is practical: two
implementations that disagree about canonical form disagree about
whether a record has changed. So :data:`CONTRIBUTING` is the single
statement of it, and this module is only the machinery that applies it.

**What a match proves, and what it does not.** That this record has not
changed since it was written. It does not prove a professional
registration, and it proves nothing to anyone who distrusts Quill
itself — the server computes the hash and the server stores it, so
anyone who can write to both can make them agree. Keys held by somebody
other than Quill would be needed for more, which is a deliberate future
item rather than an oversight here.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime
from typing import Any

from .schemas import SignOff

#: The fields a sign-off's fingerprint covers, as dotted paths.
#:
#: Everything here is a fact about *what was decided*: which competency,
#: at what level, observed and signed when, by whom, on what basis, and
#: against which evidence. Change any of them and the record asserts
#: something different, so the fingerprint must move.
#:
#: Order is irrelevant — the canonical form sorts — but the list is kept
#: in the order the plan states it, so the two can be read side by side.
CONTRIBUTING: tuple[str, ...] = (
    "id",
    "competency.id",
    "kind",
    "status",
    "level.id",
    "observed_on",
    "signed_at",
    "expires_on",
    "meaning",
    "corrects",
    "signed_off_by.user_id",
    "signed_off_by.registrations",
    "signed_off_by.care_location",
    "attachments",
)

#: The fields deliberately left out, and why. Not used by the code —
#: :data:`CONTRIBUTING` is what the hashing reads — but kept beside it
#: because a reader's first question is always "what about X", and an
#: explicit answer is cheaper than inferring one from the absence.
NON_CONTRIBUTING: dict[str, str] = {
    "content_hash": "A file cannot contain its own fingerprint.",
    "competency.name": (
        "A convenience copy of competency.id, which does contribute. "
        "Rewording a display name must not look like tampering."
    ),
    "level.name": "A convenience copy of level.id, which does contribute.",
    "signed_off_by.name": (
        "People are renamed — marriage, correction of a typo — and none "
        "of that changes what was decided."
    ),
    "signed_off_by.role": (
        "A label for the reader. The user id identifies the assessor and "
        "does contribute."
    ),
    "signed_off_by.registration_verified": (
        "Verification happens after signing, by an administrator "
        "checking a register. It must not invalidate the record it "
        "confirms."
    ),
    "comments": "Prose. Fixing a typo must leave the fingerprint alone.",
    "evidence": (
        "A snapshot of what was in view, not part of the decision. The "
        "attachment hashes do contribute."
    ),
    "reflection.md, assessment.md": (
        "Narrative files beside the record, not the record itself."
    ),
}


class HashMismatchError(Exception):
    """A record's stored fingerprint does not match its contents.

    Its own type so a route can distinguish "this record has changed
    since it was written" from any other failure. It is not proof of
    tampering: a bug in a writer would look the same, and saying so
    plainly is better than implying an accusation.
    """


def _canonical(value: Any) -> Any:
    """Reduce a value to something that serialises the same way twice.

    Args:
        value: A field value from a validated model.

    Returns:
        A JSON-compatible value. Dates and datetimes become ISO strings,
        because a date rendered two ways would fingerprint two ways.
        A datetime is normalised to UTC first, so the same instant
        written in two timezones gives one hash.
    """
    if isinstance(value, datetime):
        # To UTC before formatting: the same instant expressed in two
        # zones is one instant, and must fingerprint identically.
        # Schemas guarantee an aware datetime, so there is no naive case
        # to guess at — and guessing would be how a record silently
        # fingerprints an hour out.
        return value.astimezone(UTC).isoformat()

    # After datetime, which is a subclass of date.
    if isinstance(value, date):
        return value.isoformat()

    if isinstance(value, (list, tuple)):
        return [_canonical(item) for item in value]

    if isinstance(value, dict):
        return {key: _canonical(item) for key, item in sorted(value.items())}

    return value


def _resolve(record: SignOff, path: str) -> Any:
    """Read one dotted path off a sign-off.

    Args:
        record: The sign-off.
        path: A dotted field path from :data:`CONTRIBUTING`.

    Returns:
        The value, or ``None`` where any step of the path is absent — an
        unsigned record has no assessor, and that is not an error.
    """
    current: Any = record

    for part in path.split("."):
        if current is None:
            return None
        current = getattr(current, part, None)

    return current


def canonical_payload(record: SignOff) -> dict[str, Any]:
    """The exact structure that gets hashed.

    Exposed rather than kept private so a mismatch can be diagnosed: the
    only useful question when two implementations disagree is "what did
    each of you hash", and that must be answerable without a debugger.

    Args:
        record: The sign-off.

    Returns:
        A mapping of contributing field paths to canonical values. Keys
        are sorted at serialisation, so the order here does not matter.
    """
    payload: dict[str, Any] = {}

    for path in CONTRIBUTING:
        value = _resolve(record, path)

        if path == "attachments":
            # Only the hashes. A filename is a convenience — often the
            # only clue what a scan is — but renaming a file must not
            # invalidate the record that references its bytes. Sorted,
            # because the order two attachments were uploaded in says
            # nothing about the decision.
            attachments = value or []
            payload[path] = sorted(
                attachment.hash for attachment in attachments
            )
            continue

        if path == "signed_off_by.registrations":
            # Body and number only, and sorted. An assessor's
            # professional standing cannot be quietly rewritten after
            # signing, which is the whole reason this contributes — but
            # the verified flag is excluded, since verification happens
            # afterwards and must not invalidate what it confirms.
            registrations = value or []
            payload[path] = sorted(
                f"{registration.body}:{registration.number}"
                for registration in registrations
            )
            continue

        payload[path] = _canonical(value)

    return payload


def canonical_bytes(record: SignOff) -> bytes:
    """The canonical serialisation, exactly as it is hashed.

    JSON rather than YAML, deliberately. YAML has several ways to write
    the same value — quoted or bare, flow or block, with or without a
    document marker — and a canonical form has to have one. JSON with
    sorted keys and no inserted whitespace has exactly one rendering per
    value, which is the property being bought.

    Args:
        record: The sign-off.

    Returns:
        UTF-8 bytes: keys sorted, no whitespace between tokens, no
        trailing newline, non-ASCII preserved rather than escaped so the
        same name hashes the same in every locale.
    """
    return json.dumps(
        canonical_payload(record),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def content_hash(record: SignOff) -> str:
    """Fingerprint a sign-off.

    Args:
        record: The sign-off.

    Returns:
        ``sha256:`` followed by 64 lower-case hex characters, the same
        shape the store uses for evidence blobs so one format covers
        every hash a passport holds.
    """
    digest = hashlib.sha256(canonical_bytes(record)).hexdigest()
    return f"sha256:{digest}"


def matches(record: SignOff) -> bool:
    """Whether a record still matches the fingerprint it carries.

    Args:
        record: The sign-off, with its ``content_hash`` set.

    Returns:
        True if they agree. False if they differ, or if the record
        carries no fingerprint at all — an unsigned record has nothing
        to check, and answering "yes, verified" would assert more than
        is known.
    """
    if record.content_hash is None:
        return False

    return content_hash(record) == record.content_hash


def verify(record: SignOff) -> None:
    """Raise unless a record matches its fingerprint.

    Args:
        record: The sign-off.

    Raises:
        HashMismatchError: If the fingerprints differ, or none is
            stored. The message names both, because the only useful next
            step is comparing them.
    """
    if record.content_hash is None:
        raise HashMismatchError(
            f"Sign-off {record.id} carries no content_hash, so there is "
            "nothing to verify against."
        )

    computed = content_hash(record)

    if computed != record.content_hash:
        raise HashMismatchError(
            f"Sign-off {record.id} does not match its content_hash. "
            f"Stored {record.content_hash}, computed {computed}. This "
            "means the record has changed since it was written — by an "
            "edit, or by a bug in whatever wrote it."
        )


VERIFY_TEMPLATE = """\
# Checking this passport

Everything here can be checked with tools already on your computer. No
software to install, no keys, no internet connection.

## What you can check, and what it proves

Each sign-off carries a `content_hash` — a fingerprint of the facts it
records: which competency, at what level, observed and signed when, by
whom, and against which evidence. Recomputing it tells you the record
has not changed since it was written.

It does **not** prove the assessor's professional registration. Those are
recorded as declared, and marked verified only where somebody checked a
register by hand. And it proves nothing to anyone who distrusts the
system that wrote it, since the same system computed the fingerprint and
stored it. It is a check against accidental change and later editing,
not a signature.

## Checking the evidence files

Every attached file is named by the hash of its own contents, so a file
that has changed no longer matches its name:

```sh
cd files/sha256
find . -type f -exec sh -c 'echo "$(sha256sum < "$1" | cut -d" " -f1)  $1"' _ {} \\;
```

Each line shows a computed hash and the path it was found at. The last
part of the path is what the hash should be. If they differ, that file
has changed since it was added.

## Checking the history

The full history is a git repository:

```sh
git log --stat          # every change, who made it, and when
git fsck                # confirm nothing in the history is corrupt
```

`git log` shows a commit per change. The author is the person who acted;
the committer is the software that wrote the file.

## Checking a sign-off's fingerprint

Recomputing a `content_hash` by hand needs the exact set of fields it
covers, which is written down in the passport documentation rather than
here — it is deliberately not the whole file, so that correcting a typo
in a comment does not look like tampering.

If you need this checked, the simplest route is to ask the holder to
open the record in Quill, which recomputes the fingerprint and reports
whether it still matches.
"""
