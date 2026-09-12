"""Packaging a passport as a portable zip.

The artefact a registrar carries between trusts. Everything needed to
read, check and keep the record, in one file that outlives Quill:

- ``README.md`` — plain English, written for somebody who has never seen
  this system and may be opening the zip in ten years.
- ``passport/`` — the canonical files, exactly as they sit in the
  repository: YAML, Markdown, and the evidence blobs.
- ``passport.md`` and ``passport.pdf`` — the rendered views, for reading
  rather than parsing.
- ``VERIFY.md`` — how to check the hashes with no software beyond what
  is already on a computer.
- ``passport.bundle`` — a ``git bundle`` of the full history, which is
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
import subprocess  # noqa: S404 - git bundle, argument list never a string
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath

from . import paths, pdf, render
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
#: the record itself — somebody should be able to see at a glance which
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

- **`passport.pdf`** — the printable version. Start here if you want to
  read it or hand it to somebody.
- **`passport.md`** — the same thing as plain text, if you would rather
  search it or open it on a machine with no PDF reader.

Both are *views*. They were generated from the files below and can be
regenerated from them.

## What actually holds the record

- **`passport/`** — the record itself. Plain YAML and Markdown files you
  can open in any text editor. If anything here ever disagrees with the
  PDF, these files are right.
- **`passport.bundle`** — the full history, as a git repository. This is
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
professional registration as *they declared it*. Registrations are
marked verified only where somebody checked a register by hand — the
record says which, and does not imply more than it knows.

The fingerprints show a record has not been altered since it was
written. They are not signatures, and they prove nothing to somebody who
distrusts the system that wrote them.

## What is not here

Your reflections are in `passport/reflections/` as part of the record,
because they are yours. They are deliberately left out of `passport.pdf`
— written reflection can be disclosed in legal proceedings, so it is not
put into the document most likely to be handed to somebody else.

Generated {generated}.
"""


def build_bundle(
    store: PassportStore,
    passport_id: str,
    *,
    head_commit: str | None = None,
    generated_at: datetime | None = None,
) -> bytes:
    """Package a whole passport as a zip.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
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

        _write_record(archive, store, passport_id)
        _write_views(archive, store, passport_id, head_commit, moment)
        _write_history(archive, store, passport_id)

    return buffer.getvalue()


def _write_record(
    archive: zipfile.ZipFile, store: PassportStore, passport_id: str
) -> None:
    """Copy the canonical files in, exactly as they are.

    Walked from the repository rather than re-serialised from the
    models: a byte-for-byte copy is what makes the export a copy of the
    record rather than a rendering of it, and a round trip through
    Pydantic could quietly normalise something.
    """
    for path in _walk(store, passport_id, PurePosixPath(".")):
        try:
            data = store.read(passport_id, path)
        except PassportNotFoundError:  # pragma: no cover - race, not logic
            logger.warning("File vanished while exporting: %s", path)
            continue

        archive.writestr(f"{_RECORD_DIR}/{path}", data)


def _walk(
    store: PassportStore, passport_id: str, root: PurePosixPath
) -> list[PurePosixPath]:
    """Every file under *root*, depth first.

    The store exposes one directory at a time, so this walks rather than
    asking for a recursive listing — there is no such call, and adding
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
    empty directory — which git cannot represent anyway, so the two
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
    its absence matters more than a missing rendering — but it still
    does not fail the export. A holder with the files and no history is
    better off than one with nothing, and the log says what happened.

    Only the local backend can be bundled directly: the bucket backend
    holds a bundle already, but reaching for it would need the concrete
    type anyway. Both cases end up asking the store where its repository
    is, which only the local one can answer.
    """
    if not isinstance(store, LocalPassportStore):
        logger.info(
            "Skipping git history: %s cannot expose a working repository",
            type(store).__name__,
        )
        return

    repository = store.repository_path(passport_id)

    with tempfile.TemporaryDirectory() as scratch:
        target = Path(scratch) / "passport.bundle"

        result = subprocess.run(  # noqa: S603 - fixed argv, no shell
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
