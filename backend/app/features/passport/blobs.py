"""Storing evidence beside a passport, addressed by its own hash.

A scanned certificate, a DOPS form, a photograph of a logbook page. The
bytes never enter git: they live under ``files/sha256/ab/cd/<64-hex>``,
which is gitignored, and the record that refers to them stores only the
hash. Git LFS was considered and rejected upstream of this design — a
content-addressed directory needs no extra tooling and no server-side
support to clone.

Three properties follow from addressing by content, and each removes a
class of bug rather than merely being tidy:

**The same file stored twice is one file.** Two holders uploading the
same course certificate, or one holder uploading it twice, produce one
blob. Nothing needs to detect the duplicate.

**A blob cannot be replaced.** Its name *is* its hash, so writing
different bytes to the same name is a contradiction. The store refuses
it rather than overwriting, because a successful overwrite would mean
every record referring to that hash silently now refers to something
else.

**Corruption is detectable with no extra data.** Re-hashing the bytes
and comparing with the filename is the whole check, which is what lets
``VERIFY.md`` offer something a holder can run with no software.

What this module does *not* do is decide whether a file is acceptable —
type, size, and whether the content is what it claims — because that is
an upload-boundary concern and belongs with the route that accepts it.
Storing is separate from admitting.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from . import paths
from .schemas import Attachment

#: How much to read at a time when hashing. Large enough that the loop
#: is not the cost, small enough that a scanned PDF does not sit in
#: memory twice.
_CHUNK = 64 * 1024


class BlobError(Exception):
    """Something went wrong storing or reading evidence."""


class BlobNotFoundError(BlobError):
    """No blob with that hash.

    Raised rather than returning empty bytes: a record referring to a
    blob that is not there is a broken reference, and answering with
    nothing would let it pass as an empty file.
    """


class BlobConflictError(BlobError):
    """A blob exists at that hash with different bytes.

    Should be unreachable — two different files cannot share a SHA-256 —
    so reaching it means something other than this module wrote into the
    blob directory. Refusing loudly is the only safe response, because
    overwriting would redirect every record that referred to that hash.
    """


def digest(data: bytes) -> str:
    """The hash of some bytes, in the form a record stores.

    Args:
        data: The bytes.

    Returns:
        ``sha256:`` followed by 64 lower-case hex characters.
    """
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def digest_file(source: Path) -> str:
    """The hash of a file, read in chunks.

    Args:
        source: The file to hash.

    Returns:
        ``sha256:`` followed by 64 lower-case hex characters.

    Raises:
        BlobError: If the file cannot be read.
    """
    hasher = hashlib.sha256()

    try:
        with source.open("rb") as handle:
            while chunk := handle.read(_CHUNK):
                hasher.update(chunk)
    except OSError as error:
        raise BlobError(f"Could not read {source}: {error}") from error

    return f"sha256:{hasher.hexdigest()}"


class BlobStore:
    """Content-addressed evidence for one store root.

    Blobs sit beside the passport repositories rather than inside them,
    under the same sharded directory, so a passport and its evidence
    move together without the bytes ever being committed.
    """

    def __init__(self, root: Path) -> None:
        """Start a blob store rooted at *root*.

        Args:
            root: The directory holding every passport. The same root the
                :class:`~.store.LocalPassportStore` uses, so evidence
                lands beside the repository it belongs to.
        """
        self._root = root

    def _path(self, passport_id: str, blob_digest: str) -> Path:
        """Where one blob lives.

        Raises:
            PassportPathError: If the passport id or the digest is
                malformed. Both decide a filesystem path, so both are
                validated rather than trusted.
        """
        return self._root / paths.shard(passport_id) / paths.blob(blob_digest)

    def exists(self, passport_id: str, blob_digest: str) -> bool:
        """Whether a blob is already stored.

        Args:
            passport_id: Whose passport.
            blob_digest: The hash, with or without its prefix.

        Returns:
            True if the bytes are there.
        """
        return self._path(passport_id, blob_digest).is_file()

    def put(
        self,
        passport_id: str,
        data: bytes,
        *,
        filename: str,
        media_type: str,
    ) -> Attachment:
        """Store some bytes and describe them.

        Storing the same bytes twice is a no-op that returns the same
        attachment, so an interrupted upload can be retried without
        checking first.

        Args:
            passport_id: Whose passport.
            data: The file's contents.
            filename: What it was called when uploaded. Kept as data
                because it is often the only clue what a scan is, and
                never used to locate the bytes — a filename carrying a
                patient identifier must not reach a path or a URL.
            media_type: What kind of file it is.

        Returns:
            The attachment to record, naming the hash rather than a path.

        Raises:
            BlobConflictError: If a blob exists at that hash with
                different bytes.
            BlobError: If the write fails.
        """
        blob_digest = digest(data)
        target = self._path(passport_id, blob_digest)

        if target.is_file():
            existing = target.read_bytes()

            if existing != data:
                raise BlobConflictError(
                    f"A blob at {blob_digest} already holds different bytes. "
                    "Refusing to overwrite: every record referring to that "
                    "hash would silently refer to something else."
                )

            # Same bytes, already stored. Idempotent by construction.
            return Attachment(
                hash=blob_digest,
                filename=filename,
                size_bytes=len(data),
                media_type=media_type,
            )

        try:
            target.parent.mkdir(parents=True, exist_ok=True)

            # Write beside the target and move into place, so a failure
            # part-way through cannot leave a truncated file under a name
            # that asserts its own hash. A reader finding a short file at
            # a valid hash would have no way to tell it was incomplete.
            staging = target.with_suffix(".partial")
            staging.write_bytes(data)
            staging.replace(target)
        except OSError as error:
            raise BlobError(
                f"Could not store blob {blob_digest}: {error}"
            ) from error

        return Attachment(
            hash=blob_digest,
            filename=filename,
            size_bytes=len(data),
            media_type=media_type,
        )

    def get(self, passport_id: str, blob_digest: str) -> bytes:
        """Read a blob back.

        Args:
            passport_id: Whose passport.
            blob_digest: The hash.

        Returns:
            The bytes.

        Raises:
            BlobNotFoundError: If there is no such blob.
            BlobError: If the read fails.
        """
        target = self._path(passport_id, blob_digest)

        if not target.is_file():
            raise BlobNotFoundError(
                f"No blob {blob_digest} for passport {passport_id}."
            )

        try:
            return target.read_bytes()
        except OSError as error:
            raise BlobError(
                f"Could not read blob {blob_digest}: {error}"
            ) from error

    def verify(self, passport_id: str, blob_digest: str) -> bool:
        """Whether a stored blob still hashes to its own name.

        The whole integrity check for evidence, needing no stored
        checksum beyond the filename.

        Args:
            passport_id: Whose passport.
            blob_digest: The hash.

        Returns:
            True if the bytes match the name.

        Raises:
            BlobNotFoundError: If there is no such blob.
        """
        target = self._path(passport_id, blob_digest)

        if not target.is_file():
            raise BlobNotFoundError(
                f"No blob {blob_digest} for passport {passport_id}."
            )

        expected = (
            blob_digest
            if blob_digest.startswith("sha256:")
            else f"sha256:{blob_digest}"
        )

        return digest_file(target) == expected
