"""Packaging a passport as a portable zip.

The artefact a registrar carries between trusts. Everything needed to
read, check and keep the record, in one file that outlives Quill:

- ``README.md`` - plain English, written for somebody who has never seen
  this system and may be opening the zip in ten years.
- ``passport/`` - the canonical files, exactly as they sit in the
  repository: YAML and Markdown, and under ``passport/files/`` the
  evidence each record names, fetched from where evidence is kept.
- ``passport.md`` and ``passport.pdf`` - the rendered views, for reading
  rather than parsing.
- ``VERIFY.md`` - how to check the hashes with no software beyond what
  is already on a computer.
- ``passport.bundle`` - a ``git bundle`` of the full history, which is
  the only file here that carries *who changed what and when*.

The README is the highest-value file in the bundle and costs nothing to
write. A directory of YAML with no explanation is a puzzle; the same
directory with a page saying what it is and how to read it is a record.

**Nothing here is a substitute for the repository.** The rendered views
are convenience, and the bundle is the thing to restore from. That
ordering is stated in the README rather than left implicit, because
somebody unpacking this years from now will reach for whichever file
looks most readable and should know what they are looking at.
"""

from __future__ import annotations

import io
import logging
import re
import subprocess  # noqa: S404 - git bundle, argument list never a string
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath

from . import paths, pdf, render
from .blobs import BlobError, BlobStore
from .gcs_store import GcsBlobStore, GcsPassportStore
from .hashing import VERIFY_TEMPLATE
from .schemas import Profile
from .serialise import from_yaml
from .store import (
    LocalPassportStore,
    PassportNotFoundError,
    PassportStore,
)

logger = logging.getLogger(__name__)

#: Where the canonical files sit inside the zip. A directory rather than
#: the root, so the rendered views and the README are not mixed in with
#: the record itself - somebody should be able to see at a glance which
#: files are the passport and which are about it.
_RECORD_DIR = "passport"

README_TEMPLATE = """\
# Your clinician passport

This is a complete copy of your clinical competency record: what you
have been assessed as able to do, who signed each assessment off, when,
and on what evidence.

It belongs to you. Nothing here depends on the system that produced it
still existing.

## What to read first

- **`passport.pdf`** - the printable version. Start here if you want to
  read it or hand it to somebody.
- **`passport.md`** - the same thing as plain text, if you would rather
  search it or open it on a machine with no PDF reader.

Both are *views*. They were generated from the files below and can be
regenerated from them.

## What actually holds the record

- **`passport/`** - the record itself. Plain YAML and Markdown files you
  can open in any text editor. If anything here ever disagrees with the
  PDF, these files are right.
- **`passport.bundle`** - the full history, as a git repository. This is
  the only file that records *who changed what and when*, so it is the
  one to keep if you keep only one.

To open the history:

```sh
git clone passport.bundle passport-history
cd passport-history
git log
```

## Checking it has not been altered

`VERIFY.md` explains how, using tools already on your computer. No
software to install and no internet connection.

## What this record does and does not claim

Each sign-off names the person who made it, their role and their
professional registration as *they declared it*. Quill checks no
register, so anybody relying on a registration should look it up on
the register itself.

The fingerprints show a record has not been altered since it was
written. They are not signatures, and they prove nothing to somebody who
distrusts the system that wrote them.

## What is not here

Your reflections are in `passport/reflections/` as part of the record,
because they are yours. They are deliberately left out of `passport.pdf`
- written reflection can be disclosed in legal proceedings, so it is not
put into the document most likely to be handed to somebody else.

Generated {generated}.
"""


def build_bundle(
    store: PassportStore,
    passport_id: str,
    *,
    requested_by: str | None = None,
    head_commit: str | None = None,
    generated_at: datetime | None = None,
    blobs: BlobStore | GcsBlobStore | None = None,
) -> bytes:
    """Package a whole passport as a zip.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        blobs: Where its evidence is kept. Without it the records are
            exported and the files they name are not.
        requested_by: The user id that asked for this, recorded in the
            audit line. Optional because a background or administrative
            export has no user, and a line saying ``unattributed`` is
            more honest than one inventing an actor.
        head_commit: The commit being exported, printed in the PDF
            footer so a printed page can be tied to a repository state.
        generated_at: When, for tests.

    Returns:
        The zip's bytes.

    Raises:
        PassportNotFoundError: If there is no such passport.
    """
    moment = generated_at or datetime.now(tz=None).astimezone()

    # Read the profile first: it is the cheapest way to fail early on a
    # passport that is not there, before any rendering work is done.
    from_yaml(Profile, store.read(passport_id, paths.PROFILE))

    buffer = io.BytesIO()

    with zipfile.ZipFile(
        buffer, "w", compression=zipfile.ZIP_DEFLATED
    ) as archive:
        archive.writestr(
            "README.md",
            README_TEMPLATE.format(generated=moment.date().isoformat()),
        )
        archive.writestr("VERIFY.md", VERIFY_TEMPLATE)

        named = _write_record(archive, store, passport_id)
        _write_evidence(archive, blobs, passport_id, named)
        _write_views(archive, store, passport_id, head_commit, moment)
        _write_history(archive, store, passport_id)

    data = buffer.getvalue()

    # Who exported which passport, and when. Deliberately nothing else:
    # no holder name, no competency, no filename, no size breakdown. A
    # passport carries no patient data, but it is somebody's assessment
    # record, and an application log is read by people who have no
    # business with its contents. The size is the one detail included,
    # because an export that silently produced almost nothing is worth
    # being able to spot afterwards.
    logger.info(
        "Passport export: passport=%s requested_by=%s bytes=%d",
        passport_id,
        requested_by or "unattributed",
        len(data),
    )

    return data


#: An attachment as a record names it: the key `hash`, then the digest.
#: Matched in the file's own text, and only on that key, so the
#: fingerprint taken over a sign-off, which is also a SHA-256, is not
#: mistaken for a file.
_ATTACHMENT_HASH = re.compile(
    rb"""^\s*-?\s*hash:\s*['"]?(sha256:[0-9a-f]{64})""", re.MULTILINE
)


def _write_record(
    archive: zipfile.ZipFile, store: PassportStore, passport_id: str
) -> list[str]:
    """Copy the canonical files in, exactly as they are.

    Walked from the repository rather than re-serialised from the
    models: a byte-for-byte copy is what makes the export a copy of the
    record rather than a rendering of it, and a round trip through
    Pydantic could quietly normalise something.

    Returns:
        The digest of every attachment the files name, each once, in
        the order first met.
    """
    named: list[str] = []

    for path in _walk(store, passport_id, PurePosixPath(".")):
        try:
            data = store.read(passport_id, path)
        except PassportNotFoundError:  # pragma: no cover - race, not logic
            logger.warning("File vanished while exporting: %s", path)
            continue

        archive.writestr(f"{_RECORD_DIR}/{path}", data)

        for found in _ATTACHMENT_HASH.findall(data):
            digest = found.decode("ascii")
            if digest not in named:
                named.append(digest)

    return named


def _write_evidence(
    archive: zipfile.ZipFile,
    blobs: BlobStore | GcsBlobStore | None,
    passport_id: str,
    named: list[str],
) -> None:
    """Add each file the records name, where the record says it is.

    Evidence is not in the repository. A record holds a file's digest,
    and the bytes are kept apart, by that digest. So copying the
    repository copies the names and none of the files, and until 11
    October 2026 that is what an export held: a certificate naming a
    scan that was not in the zip.

    Each file goes in at the path its digest gives, under the record
    directory, which is where somebody following a record would look.
    A file that cannot be fetched is logged and left out, and does not
    fail the export: the rest of the record is still worth having.
    """
    if blobs is None:
        return

    for digest in named:
        try:
            data = blobs.get(passport_id, digest)
        except (BlobError, paths.PassportPathError):
            logger.warning(
                "Evidence named by a record could not be exported: "
                "passport=%s digest=%s",
                passport_id,
                digest,
            )
            continue

        archive.writestr(f"{_RECORD_DIR}/{paths.blob(digest)}", data)


def _walk(
    store: PassportStore, passport_id: str, root: PurePosixPath
) -> list[PurePosixPath]:
    """Every file under *root*, depth first.

    The store exposes one directory at a time, so this walks rather than
    asking for a recursive listing - there is no such call, and adding
    one to the interface for a single caller would widen it for nothing.
    """
    found: list[PurePosixPath] = []

    try:
        entries = store.list_dir(passport_id, root)
    except (PassportNotFoundError, paths.PassportPathError):
        return found

    for entry in entries:
        children = _children(store, passport_id, entry)

        if children is None:
            found.append(entry)
        else:
            found.extend(children)

    return found


def _children(
    store: PassportStore, passport_id: str, path: PurePosixPath
) -> list[PurePosixPath] | None:
    """Everything under *path* if it is a directory, else ``None``.

    The store has no "is this a directory" call, so this asks for a
    listing and reads the answer: a file lists as nothing, and so does an
    empty directory - which git cannot represent anyway, so the two
    cases collapse safely.
    """
    try:
        entries = store.list_dir(passport_id, path)
    except (PassportNotFoundError, paths.PassportPathError):
        return None

    if not entries:
        return None

    found: list[PurePosixPath] = []

    for entry in entries:
        children = _children(store, passport_id, entry)

        if children is None:
            found.append(entry)
        else:
            found.extend(children)

    return found


def _write_views(
    archive: zipfile.ZipFile,
    store: PassportStore,
    passport_id: str,
    head_commit: str | None,
    moment: datetime,
) -> None:
    """Add the rendered Markdown and PDF.

    A failure in either is logged and skipped rather than raised. The
    record is what matters and it is already in the archive by this
    point; denying somebody the whole export because a rendering broke
    would be the wrong trade, and the README tells them the files are
    the authority in any case.
    """
    try:
        archive.writestr("passport.md", render.render(store, passport_id))
    except Exception:  # noqa: BLE001 - see the docstring
        logger.exception("Could not render passport.md for the bundle")

    try:
        archive.writestr(
            "passport.pdf",
            pdf.render_pdf(
                store,
                passport_id,
                head_commit=head_commit,
                generated_at=moment,
            ),
        )
    except Exception:  # noqa: BLE001 - see the docstring
        logger.exception("Could not render passport.pdf for the bundle")


def _write_history(
    archive: zipfile.ZipFile, store: PassportStore, passport_id: str
) -> None:
    """Add a ``git bundle`` of the full history.

    The only file in the archive carrying who changed what and when, so
    its absence matters more than a missing rendering - but it still
    does not fail the export. A holder with the files and no history is
    better off than one with nothing, and the log says what happened.

    The bucket backend holds exactly this file already, so its copy is
    passed on as it is. Until 11 October 2026 it was skipped, and since
    the live application keeps passports in a bucket, every export
    there shipped a README telling the holder to keep a file that was
    not in the zip. The local backend is bundled from its repository.
    """
    if isinstance(store, GcsPassportStore):
        try:
            archive.writestr(
                "passport.bundle", store.bundle_bytes(passport_id)
            )
        except Exception:  # noqa: BLE001 - never fail the export
            logger.exception("Could not add passport.bundle to the export")

        return

    if not isinstance(store, LocalPassportStore):
        logger.info(
            "Skipping git history: %s cannot expose a working repository",
            type(store).__name__,
        )
        return

    repository = store.repository_path(passport_id)

    with tempfile.TemporaryDirectory() as scratch:
        target = Path(scratch) / "passport.bundle"

        result = subprocess.run(  # noqa: S603 - fixed argv, no shell  # nosec B607 B603
            ["git", "bundle", "create", str(target), "--all"],
            cwd=str(repository),
            capture_output=True,
            check=False,
        )

        if result.returncode != 0:
            logger.warning(
                "Could not bundle the passport history: %s",
                result.stderr.decode(errors="replace").strip(),
            )
            return

        archive.writestr("passport.bundle", target.read_bytes())
