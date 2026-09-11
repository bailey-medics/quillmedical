"""Where everything lives inside a passport repository.

Every path in a passport is built here and nowhere else, so the on-disk
layout is described in one file rather than assembled from string
fragments across the codebase. After VPR's ``crates/core/src/paths``.

**No I/O.** Nothing in this module touches a disk: it returns
``PurePosixPath`` values relative to the repository root, and the store
is what resolves them against a real directory. That keeps the layout
testable without a filesystem, and keeps a path from being accidentally
created by the act of naming it.

``PurePosixPath`` rather than ``Path`` for the same reason git uses
forward slashes everywhere: these paths are repository contents, not
host filesystem paths, and they must read identically on every platform.

Two naming rules run through the layout, and they look inconsistent
until the reason is clear:

- **Where a directory is a competency, it is named by the competency id
  verbatim** — ``logbook/perform_bronchoscopy/``. A logbook entry is
  about one procedure, so "show me my bronchoscopy logbook" should be
  one directory.
- **Where a directory is a human label, it is named for reading and the
  authoritative id lives inside the file** — ``sign-offs/
  2026-03-14-perform-bronchoscopy/``. Sign-offs and certificates
  legitimately span several competencies at once, so the competency
  cannot be the directory.
"""

from __future__ import annotations

import re
from pathlib import PurePosixPath

# --- Repository-root files ------------------------------------------------

#: What this passport *is*, as distinct from what it contains: its id,
#: schema version and when it was created. Read first by anyone opening a
#: passport years from now.
MANIFEST = PurePosixPath("manifest.yaml")

#: Who the passport belongs to — the holder's name and current
#: registrations, regenerated whenever they change. The one place the
#: passport says whose it is, which is why no record repeats it.
PROFILE = PurePosixPath("profile.yaml")

#: The derived index: every competency the holder has evidence for and
#: where it stands. Regenerated on every write, never hand-edited, and
#: the directories win if they ever disagree with it.
INDEX = PurePosixPath("competencies.yaml")

#: Plain English: what this is and how to read it. The highest-value file
#: in an exported bundle and the cheapest to write.
README = PurePosixPath("README.md")

#: Keeps ``files/`` out of git. Evidence is content-addressed beside the
#: repository, never committed into it.
GITIGNORE = PurePosixPath(".gitignore")

# --- Directories ----------------------------------------------------------

CERTIFICATES = PurePosixPath("certificates")
LOGBOOK = PurePosixPath("logbook")
REFLECTIONS = PurePosixPath("reflections")
CPD = PurePosixPath("cpd")
SIGN_OFFS = PurePosixPath("sign-offs")

#: Gitignored, content-addressed evidence. Blobs live under
#: ``files/sha256/ab/cd/<64-hex>`` so a directory never grows unmanageably
#: wide, and the hash is the only pointer stored.
FILES = PurePosixPath("files")

#: The one line ``.gitignore`` needs. A trailing slash, so it cannot
#: match a *file* called ``files`` that something else creates.
GITIGNORE_CONTENT = "files/\n"

# --- Filenames inside record directories ----------------------------------

SIGN_OFF_FILE = PurePosixPath("sign-off.yaml")
CERTIFICATE_FILE = PurePosixPath("certificate.yaml")
REFLECTION_FILE = PurePosixPath("reflection.md")
ASSESSMENT_FILE = PurePosixPath("assessment.md")

# A competency id, as the identifier rules allow it: lower-case words
# joined by underscores, and deliberately no "/" — a path-shaped id would
# bake a taxonomy into every stored record.
_COMPETENCY_ID = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")

# A directory name this module generated: a date, then a slug or a
# counter. Checked on the way back in, because a name reaching these
# functions from a YAML file is untrusted input.
_RECORD_DIR = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$")

# A write-time entry filename: date, then hours, minutes and seconds. No
# colons, which Windows rejects.
_ENTRY_FILE = re.compile(r"^\d{4}-\d{2}-\d{2}-\d{6}$")


class PassportPathError(ValueError):
    """A path component was not something this layout permits.

    Its own type because the store turns it into a refusal to write,
    while an ordinary ``ValueError`` from deeper in a call might not
    mean that.
    """


def _check(value: str, pattern: re.Pattern[str], what: str) -> str:
    """Return *value* if it matches, else refuse by name.

    Args:
        value: The untrusted component.
        pattern: What a valid one looks like.
        what: How to describe it in the error.

    Returns:
        The same value.

    Raises:
        PassportPathError: If it does not match, if it is empty, or if it
            could escape the repository. Path traversal is caught by the
            patterns — none of them admit ``.`` or ``/`` — but the
            explicit check states the intent, so a later loosening of a
            pattern cannot silently permit ``../``.
    """
    if not value:
        raise PassportPathError(f"Empty {what}.")

    if "/" in value or "\\" in value or value.startswith("."):
        raise PassportPathError(
            f"Unsafe {what} {value!r}: must not contain a path separator "
            "or begin with a dot."
        )

    if not pattern.fullmatch(value):
        raise PassportPathError(
            f"Invalid {what} {value!r}: expected {pattern.pattern}."
        )

    return value


def competency_id(value: str) -> str:
    """Validate a competency id used as a directory name.

    Args:
        value: The competency id.

    Returns:
        The same id.

    Raises:
        PassportPathError: If it is not a flat lower-case slug. In
            particular a ``/`` is refused: hierarchy lives in the
            competency definition, never in the identifier.
    """
    return _check(value, _COMPETENCY_ID, "competency id")


def sign_off_dir(name: str) -> PurePosixPath:
    """The directory holding one sign-off.

    Args:
        name: Its folder name, ``<observed-date>-<competency-slug>``,
            with ``-2`` or higher appended when a second sign-off for the
            same competency was observed on the same day.

    Returns:
        The path, relative to the repository root.

    Raises:
        PassportPathError: If the name is not one this layout generates.
    """
    return SIGN_OFFS / _check(name, _RECORD_DIR, "sign-off folder name")


def sign_off_file(name: str) -> PurePosixPath:
    """The record itself: the file that is hashed and signed."""
    return sign_off_dir(name) / SIGN_OFF_FILE


def sign_off_reflection(name: str) -> PurePosixPath:
    """The holder's narrative beside a sign-off. Optional."""
    return sign_off_dir(name) / REFLECTION_FILE


def sign_off_assessment(name: str) -> PurePosixPath:
    """The assessor's narrative beside a sign-off. Optional."""
    return sign_off_dir(name) / ASSESSMENT_FILE


def certificate_dir(name: str) -> PurePosixPath:
    """The directory holding one certificate and its metadata.

    Flat rather than grouped by competency, because one course
    legitimately supports several competencies at once.

    Args:
        name: ``<award-date>-<slug>``.

    Returns:
        The path, relative to the repository root.

    Raises:
        PassportPathError: If the name is not one this layout generates.
    """
    return CERTIFICATES / _check(name, _RECORD_DIR, "certificate folder name")


def certificate_file(name: str) -> PurePosixPath:
    """The certificate's own metadata: issuer, dates, competencies."""
    return certificate_dir(name) / CERTIFICATE_FILE


def logbook_dir(competency: str) -> PurePosixPath:
    """The directory holding one competency's logbook entries.

    Grouped by competency id verbatim, because an entry is about one
    procedure.

    Args:
        competency: The competency id.

    Returns:
        The path, relative to the repository root.

    Raises:
        PassportPathError: If the competency id is not a flat slug.
    """
    return LOGBOOK / competency_id(competency)


def logbook_entry(competency: str, filename: str) -> PurePosixPath:
    """One logged procedure.

    Args:
        competency: The competency id the entry counts towards.
        filename: The write-time stem, ``YYYY-MM-DD-HHMMSS``, without
            its suffix.

    Returns:
        The path, relative to the repository root.

    Raises:
        PassportPathError: If either component is malformed.
    """
    stem = _check(filename, _ENTRY_FILE, "logbook entry filename")
    return logbook_dir(competency) / f"{stem}.yaml"


def reflection_dir(name: str) -> PurePosixPath:
    """The directory holding one reflection.

    Args:
        name: ``<date>-<slug>``.

    Returns:
        The path, relative to the repository root.

    Raises:
        PassportPathError: If the name is not one this layout generates.
    """
    return REFLECTIONS / _check(name, _RECORD_DIR, "reflection folder name")


def reflection_file(name: str) -> PurePosixPath:
    """The reflection itself: frontmatter, then the writing."""
    return reflection_dir(name) / REFLECTION_FILE


def cpd_dir(year: int) -> PurePosixPath:
    """The directory holding one year's CPD activities.

    Grouped by year because UK appraisal runs annually and asks what you
    did this year, so the grouping matches how the record is used.

    Args:
        year: The calendar year.

    Returns:
        The path, relative to the repository root.

    Raises:
        PassportPathError: If the year is not four digits. A passport
            recording an activity in year 12 is a bug upstream, and a
            directory named ``12`` would sort oddly forever.
    """
    if not 1000 <= year <= 9999:
        raise PassportPathError(
            f"Invalid CPD year {year!r}: expected four digits."
        )
    return CPD / str(year)


def cpd_entry(year: int, filename: str) -> PurePosixPath:
    """One CPD activity: a conference, grand round, teaching day, course.

    Args:
        year: The calendar year it falls in.
        filename: The write-time stem, ``YYYY-MM-DD-HHMMSS``.

    Returns:
        The path, relative to the repository root.

    Raises:
        PassportPathError: If either component is malformed.
    """
    stem = _check(filename, _ENTRY_FILE, "CPD entry filename")
    return cpd_dir(year) / f"{stem}.yaml"


def blob(digest: str) -> PurePosixPath:
    """Where a content-addressed evidence blob lives.

    ``sha256:ab12cd34…`` resolves to ``files/sha256/ab/12/ab12cd34…``, so
    no path is ever stored in a record and nothing can drift out of step
    with the hash. Two levels of fan-out, after VPR, so no single
    directory grows unmanageably wide.

    Args:
        digest: The hash, with or without its ``sha256:`` prefix.

    Returns:
        The path, relative to the repository root. Gitignored.

    Raises:
        PassportPathError: If it is not a sha256 digest. Only sha256 is
            accepted: a record naming an algorithm the store cannot
            resolve is worse than one that fails to write.
    """
    bare = digest[len("sha256:") :] if digest.startswith("sha256:") else digest

    if not re.fullmatch(r"[0-9a-f]{64}", bare):
        raise PassportPathError(
            f"Invalid blob digest {digest!r}: expected 64 lower-case hex "
            "characters, optionally prefixed 'sha256:'."
        )

    return FILES / "sha256" / bare[:2] / bare[2:4] / bare


def shard(passport_id: str) -> PurePosixPath:
    """Where one passport's repository sits beneath the store root.

    ``3f2a8c1e…`` becomes ``3f/2a/3f2a8c1e…``, so the uuid's first four
    hex characters become two directory levels. After VPR: at a hundred
    thousand passports no directory holds more than a few hundred
    entries, and the sharding is derivable from the id rather than
    recorded anywhere.

    Args:
        passport_id: The passport's 32-character hex uuid, unhyphenated.

    Returns:
        The path, relative to the store root.

    Raises:
        PassportPathError: If it is not 32 lower-case hex characters.
    """
    if not re.fullmatch(r"[0-9a-f]{32}", passport_id):
        raise PassportPathError(
            f"Invalid passport id {passport_id!r}: expected 32 lower-case "
            "hex characters."
        )

    return PurePosixPath(passport_id[:2]) / passport_id[2:4] / passport_id
