"""Reading a mailing list out of a spreadsheet somebody dropped in.

The people in it go into ``newsletter_subscriber``: those who are sent
newsletters and have no Quill account. The file is a CSV, which is what
Excel and every mailing service will save a list as.

Four things keep this safe, and each is a rule of this module:

- **The file is never kept.** It is read in memory and the bytes are
  gone when the request ends.
- **Nothing in it is logged or sent back**, not a row and not an
  address. A row that cannot be read is named by its number.
- **It is bounded**: :data:`MAX_BYTES` and :data:`MAX_ROWS`.
- **It never turns a "no" into a "yes".** Somebody already unsubscribed
  stays so whatever a file says, and where a file names an address twice
  with different answers, opted out wins.

See Phase 6 of ``docs/docs/plans/2026-10-06-amazon-ses-email-plan.md``.
"""

from __future__ import annotations

import csv
import hashlib
import io
from dataclasses import dataclass, field

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.marketing.subscribers import fold_all, set_subscribed
from app.models import NewsletterSubscriber, User, normalise_email

#: The largest file read. A list of a few thousand people is well under.
MAX_BYTES = 2 * 1024 * 1024

#: The most rows read, the header aside.
MAX_ROWS = 10_000

#: How many row numbers of each kind of fault are sent back. Enough to
#: go and look; the count says how many there were in all.
MAX_ROW_NUMBERS = 50

#: What a column may be headed, lower case. Mailing services name the
#: address column after themselves: MailerLite's is "Subscriber".
_EMAIL_HEADINGS = frozenset(
    {"email", "e-mail", "email address", "e-mail address", "subscriber"}
)
_NAME_HEADINGS = frozenset({"name", "first name", "full name", "forename"})
_LAST_NAME_HEADINGS = frozenset({"last name", "surname", "family name"})
_OPT_HEADINGS = frozenset(
    {
        "opt in",
        "opt-in",
        "opt in/out",
        "opt",
        "opted in",
        "subscribed",
        "status",
        "consent",
    }
)

#: The words read as an answer, and nothing else is. Lower case.
_OPTED_IN = frozenset(
    {"in", "opt in", "opt-in", "yes", "y", "true", "1", "subscribed", "active"}
)
_OPTED_OUT = frozenset(
    {
        "out",
        "opt out",
        "opt-out",
        "no",
        "n",
        "false",
        "0",
        "unsubscribed",
        "inactive",
    }
)


class MailingListError(Exception):
    """A file that cannot be read as a mailing list, with the reason."""


@dataclass(frozen=True)
class Entry:
    """One person in the file.

    Attributes:
        email: Their address, lower case.
        name: Their name, or None.
        opted_in: Whether the file says they want newsletters.
    """

    email: str
    name: str | None
    opted_in: bool


@dataclass
class Parsed:
    """What a file held, once read.

    Attributes:
        entries: One for each address, in the file's order.
        rows: How many rows there were, the header aside.
        no_address: Numbers of rows with no address, or one that is not
            an address. Row 2 is the first under the header, as a
            spreadsheet numbers them.
        unreadable_answer: Numbers of rows whose opt in or out could not
            be read.
        repeated: How many rows named an address an earlier row had.
        has_opt_column: Whether the file said who is opted in and out.
            Without the column everybody in it is taken as opted in.
    """

    entries: list[Entry] = field(default_factory=list)
    rows: int = 0
    no_address: list[int] = field(default_factory=list)
    unreadable_answer: list[int] = field(default_factory=list)
    repeated: int = 0
    has_opt_column: bool = True


@dataclass(frozen=True)
class Summary:
    """What importing a file would do, or did, in numbers alone.

    Attributes:
        rows: Rows in the file, the header aside.
        new: People not on the mailing list yet.
        already_there: People on it whom the file leaves as they are.
        switched_off: People on it, subscribed, whom the file opts out.
        opted_in: People in the file opted in.
        opted_out: People in the file opted out.
        have_accounts: People in the file who hold a verified Quill
            account, and are kept as that account and not on the list.
        no_address: Rows with no usable address, left out.
        unreadable_answer: Rows whose answer could not be read, left out.
        repeated: Rows naming an address an earlier row had.
        has_opt_column: Whether the file said who is opted in and out.
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


def _column(headings: list[str], names: frozenset[str]) -> int | None:
    """Which column is headed by one of *names*, if any is."""
    for index, heading in enumerate(headings):
        if heading in names:
            return index
    return None


def _cell(row: list[str], index: int | None) -> str:
    """One cell of a row, trimmed, or empty where the row is short."""
    if index is None or index >= len(row):
        return ""
    return row[index].strip()


def _address(value: str) -> str | None:
    """The address in a cell as Quill holds one, or None if it is not one."""
    if not value or len(value) > 255:
        return None
    try:
        validate_email(value, check_deliverability=False)
    except EmailNotValidError:
        return None
    return normalise_email(value)


def _answer(value: str) -> bool | None:
    """What a cell says about wanting newsletters, or None if unreadable."""
    word = value.lower()
    if word in _OPTED_IN:
        return True
    if word in _OPTED_OUT:
        return False
    return None


def parse(raw: bytes) -> Parsed:
    """Read a CSV file's bytes as a mailing list.

    The first row is the headings. One must be the address's; a name, a
    last name and an opt in or out are read where they are headed.

    Args:
        raw: The file, as uploaded.

    Returns:
        What it held.

    Raises:
        MailingListError: If the file is too big, is not text, has too
            many rows, or has no column of addresses.
    """
    if len(raw) > MAX_BYTES:
        raise MailingListError(
            f"That file is larger than {MAX_BYTES // (1024 * 1024)} MB"
        )
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise MailingListError(
            "That file is not a CSV. Save the spreadsheet as "
            '"CSV UTF-8" and try again.'
        ) from None

    try:
        table = [row for row in csv.reader(io.StringIO(text)) if any(row)]
    except csv.Error:
        raise MailingListError(
            "That file could not be read as a CSV"
        ) from None
    if not table:
        raise MailingListError("That file is empty")

    headings = [heading.strip().lower() for heading in table[0]]
    email_at = _column(headings, _EMAIL_HEADINGS)
    if email_at is None:
        raise MailingListError(
            'No column is headed "Email". The first row must name the columns.'
        )
    name_at = _column(headings, _NAME_HEADINGS)
    last_name_at = _column(headings, _LAST_NAME_HEADINGS)
    opt_at = _column(headings, _OPT_HEADINGS)

    body = table[1:]
    if len(body) > MAX_ROWS:
        raise MailingListError(f"That file has more than {MAX_ROWS} rows")

    parsed = Parsed(rows=len(body), has_opt_column=opt_at is not None)
    found: dict[str, Entry] = {}
    for number, row in enumerate(body, start=2):
        email = _address(_cell(row, email_at))
        if email is None:
            parsed.no_address.append(number)
            continue
        opted_in: bool | None = True
        if opt_at is not None:
            opted_in = _answer(_cell(row, opt_at))
        if opted_in is None:
            parsed.unreadable_answer.append(number)
            continue
        name = " ".join(
            part
            for part in (_cell(row, name_at), _cell(row, last_name_at))
            if part
        )[:255]
        earlier = found.get(email)
        if earlier is not None:
            parsed.repeated += 1
            # Named twice: opted out wins, and the first name given stays.
            opted_in = opted_in and earlier.opted_in
            name = earlier.name or name
        found[email] = Entry(email=email, name=name or None, opted_in=opted_in)
    parsed.entries = list(found.values())
    return parsed


def _existing(db: Session, parsed: Parsed) -> dict[str, NewsletterSubscriber]:
    """The subscribers already on the list whom the file names."""
    addresses = [entry.email for entry in parsed.entries]
    if not addresses:
        return {}
    rows = db.scalars(
        select(NewsletterSubscriber).where(
            NewsletterSubscriber.email.in_(addresses)
        )
    )
    return {row.email: row for row in rows}


def _with_accounts(db: Session, parsed: Parsed) -> set[str]:
    """Addresses in the file that are a verified account's."""
    addresses = [entry.email for entry in parsed.entries]
    if not addresses:
        return set()
    return set(
        db.scalars(
            select(User.email).where(
                User.email_verified.is_(True), User.email.in_(addresses)
            )
        )
    )


def summarise(db: Session, parsed: Parsed) -> Summary:
    """Say what importing a file would do, changing nothing.

    Args:
        db: Database session.
        parsed: The file, from :func:`parse`.

    Returns:
        The counts.
    """
    existing = _existing(db, parsed)
    new = already_there = switched_off = 0
    for entry in parsed.entries:
        row = existing.get(entry.email)
        if row is None:
            new += 1
        elif row.subscribed and not entry.opted_in:
            switched_off += 1
        else:
            already_there += 1
    opted_in = sum(1 for entry in parsed.entries if entry.opted_in)
    return Summary(
        rows=parsed.rows,
        new=new,
        already_there=already_there,
        switched_off=switched_off,
        opted_in=opted_in,
        opted_out=len(parsed.entries) - opted_in,
        have_accounts=len(_with_accounts(db, parsed)),
        no_address=len(parsed.no_address),
        unreadable_answer=len(parsed.unreadable_answer),
        repeated=parsed.repeated,
        has_opt_column=parsed.has_opt_column,
    )


def fingerprint(raw: bytes, summary: Summary) -> str:
    """What must be passed back to import for real.

    It covers the file and what importing it would do. So it can only be
    known by checking the file first, and stops being right if the file
    or the mailing list has changed since.

    Args:
        raw: The file's bytes.
        summary: What :func:`summarise` said of it.

    Returns:
        A hex digest.
    """
    digest = hashlib.sha256(raw)
    digest.update(repr(summary).encode())
    return digest.hexdigest()


def apply(db: Session, parsed: Parsed) -> None:
    """Import a file's people into the mailing list.

    Somebody new is added, subscribed or not as the file says. Somebody
    already there keeps their answer unless the file opts them out; a
    name is filled in where there was none. Then anybody who also holds
    a verified account is kept as that account alone.

    Args:
        db: Database session. Changes are flushed, not committed.
        parsed: The file, from :func:`parse`.
    """
    existing = _existing(db, parsed)
    for entry in parsed.entries:
        row = existing.get(entry.email)
        if row is None:
            row = NewsletterSubscriber(email=entry.email, name=entry.name)
            db.add(row)
            if not entry.opted_in:
                set_subscribed(row, wants=False)
            continue
        # Never the other way: an import does not turn a "no" into a "yes".
        if not entry.opted_in:
            set_subscribed(row, wants=False)
        if row.name is None and entry.name:
            row.name = entry.name
    db.flush()
    fold_all(db)
