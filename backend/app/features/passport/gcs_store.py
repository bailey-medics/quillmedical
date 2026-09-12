"""Passport repositories held in a Cloud Storage bucket.

Cloud Run has no durable disk, so the production backend keeps each
passport as a single ``git bundle`` object and each evidence blob as an
object beside it. A write downloads the bundle to a temporary directory,
unbundles it into a real repository, delegates to
:class:`~.store.LocalPassportStore` for the commit, re-bundles and
uploads.

That delegation is the point rather than a shortcut. Every property the
local store guarantees — one write one commit, rollback on failure,
refusing a rewrite, asserting HEAD — is implemented once and inherited
here, so the two backends cannot drift apart in the ways that would
matter. What this module adds is the part a bucket does differently:

**Compare-and-swap on the object generation.** Cloud Storage stamps every
object with a generation, and ``if_generation_match`` makes an upload
conditional on it being unchanged. That is the bucket's equivalent of
asserting HEAD, and it closes the window the local store's in-process
HEAD check cannot reach: two Cloud Run instances writing the same
passport at once. The generation read at download is asserted at upload,
so the second writer is refused rather than silently overwriting the
first. ``if_generation_match=0`` means "only if this object does not
exist yet", which is how creation refuses to clobber an existing
passport.

**Nothing is cached between calls.** Each operation downloads, works in a
temporary directory, and throws it away. Passport repositories are a few
kilobytes per sign-off and written rarely, so the round trip is cheap
and a stale local copy is impossible by construction.

**Bytes are addressed the same way on both backends.** An object key is
the local relative path — ``ab/cd/<uuid>.bundle`` for a repository,
``ab/cd/<uuid>/files/sha256/ab/cd/<64-hex>`` for a blob — so a bucket can
be mirrored to a disk, or the reverse, with a plain copy.

**Bundling shells out to ``git``, which nothing else here does.** The
rest of this package uses pygit2 deliberately, and :mod:`.store` says so.
libgit2 has no bundle support — pygit2 1.20 exposes ``PackBuilder`` and
nothing that reads or writes the bundle format — so there is no
in-process route to the one format that holds a full history as a single
object. The binary is already in the backend image for the teaching
version-lock tests, so this costs no new dependency, and the calls are
fixed argument lists with no shell, so nothing a caller supplies is
interpreted. Writing a bundle by hand instead would mean implementing a
git format to avoid a subprocess, which is the worse trade.

The bucket is passed in rather than read from settings: every module in
this package must import without ``app.config``, so that a passport on
disk stays readable by tooling that has no application around it. The
composition point that knows about settings lives outside.
"""

from __future__ import annotations

import subprocess  # noqa: S404 - git bundle, argument list never a string
import tempfile
from collections.abc import Mapping
from pathlib import Path, PurePosixPath
from typing import Any, Protocol

from . import paths
from .blobs import BlobConflictError, BlobError, BlobNotFoundError, digest
from .commits import Actor, CommitMessage
from .schemas import Attachment
from .store import (
    ConcurrentWriteError,
    LocalPassportStore,
    PassportExistsError,
    PassportHead,
    PassportNotFoundError,
    PassportStore,
    StoreError,
)

#: Where a passport's bundle sits in the bucket, and where its evidence
#: sits beside it. Stated once so the layout cannot drift between the
#: repository object and the blob objects that belong to it.
PREFIX = "passports"

#: The generation that means "this object must not already exist".
#: Cloud Storage spells the precondition this way rather than with a
#: separate flag.
_MUST_NOT_EXIST = 0


class BundleError(StoreError):
    """A repository could not be bundled or unbundled.

    Its own type because it means the bytes in the bucket are not a
    usable repository, which is a different problem from a write being
    refused: a refused write leaves a good passport, this does not.
    """


class _Blob(Protocol):
    """The part of a Cloud Storage blob this module uses.

    A protocol rather than the real type so the tests can drive a fake
    without the library installed, and so what this module depends on is
    visible in one place.
    """

    @property
    def generation(self) -> int | None:
        """The object's current generation, or ``None`` if absent.

        Read-only, because this module only ever reads it and Cloud
        Storage only ever assigns it: a generation is stamped by the
        server on write, never chosen by a client. Declaring it settable
        would require every implementation to accept an assignment that
        nothing makes, and would let a future bug write to it here.
        """

    def exists(self) -> bool: ...

    def download_as_bytes(self) -> bytes: ...

    def upload_from_string(
        self,
        data: bytes,
        *,
        content_type: str = ...,
        if_generation_match: int | None = ...,
    ) -> None: ...

    def reload(self) -> None: ...


class _Bucket(Protocol):
    """The part of a Cloud Storage bucket this module uses."""

    def blob(self, name: str) -> _Blob: ...


def _is_precondition_failed(error: Exception) -> bool:
    """Whether *error* is Cloud Storage refusing a conditional write.

    Cloud Storage answers a failed ``if_generation_match`` with HTTP 412,
    surfaced by the library as ``PreconditionFailed``. Matched on the
    status code rather than the exception class so this module needs no
    import from ``google.api_core``, which keeps the package importable
    without the library present.

    Args:
        error: What the upload raised.

    Returns:
        True if the write was refused because the object had moved.
    """
    return getattr(error, "code", None) == 412


class GcsPassportStore(PassportStore):
    """Passports as git bundles in a Cloud Storage bucket.

    Behaviourally identical to :class:`~.store.LocalPassportStore`, which
    it delegates to: the same errors for the same reasons, so core code
    cannot tell which backend it holds. The difference is where the bytes
    live and that concurrent writers are caught by the object generation
    rather than by an in-process HEAD comparison.
    """

    def __init__(self, bucket: _Bucket) -> None:
        """Start a store over *bucket*.

        Args:
            bucket: The Cloud Storage bucket holding every passport.
                Passed in rather than built from settings, so this module
                stays importable without the application's configuration.
        """
        self._bucket = bucket

    def _bundle_name(self, passport_id: str) -> str:
        """The object key for one passport's bundle.

        Raises:
            PassportPathError: If the id is not 32 lower-case hex
                characters. Validated rather than trusted, because an id
                reaching this method decides an object key.
        """
        return f"{PREFIX}/{paths.shard(passport_id)}.bundle"

    def _bundle(self, passport_id: str) -> _Blob:
        """The bundle object for one passport."""
        return self._bucket.blob(self._bundle_name(passport_id))

    def exists(self, passport_id: str) -> bool:
        """Whether a bundle exists for this passport."""
        return self._bundle(passport_id).exists()

    def head(self, passport_id: str) -> PassportHead:
        """Where the repository is now.

        Returns:
            The HEAD commit id, or ``None`` if it has no commits.

        Raises:
            PassportNotFoundError: If no bundle exists.
        """
        with self._checkout(passport_id) as checkout:
            return checkout.store.head(passport_id)

    def read(self, passport_id: str, path: PurePosixPath) -> bytes:
        """Read one file at the current HEAD.

        Raises:
            PassportNotFoundError: If the passport or the file is absent.
        """
        with self._checkout(passport_id) as checkout:
            return checkout.store.read(passport_id, path)

    def list_dir(
        self, passport_id: str, path: PurePosixPath
    ) -> list[PurePosixPath]:
        """List the entries directly under a directory.

        Raises:
            PassportNotFoundError: If the passport does not exist.
        """
        with self._checkout(passport_id) as checkout:
            return checkout.store.list_dir(passport_id, path)

    def create(
        self,
        passport_id: str,
        files: Mapping[PurePosixPath, str | bytes],
        message: CommitMessage,
        actor: Actor,
    ) -> str:
        """Initialise a repository and upload its first bundle.

        The upload is conditional on the object not existing, so two
        instances creating the same passport at once cannot both succeed:
        the loser is refused rather than overwriting a repository that
        already holds records.

        Args:
            passport_id: The new passport's id.
            files: Paths relative to the repository root, and contents.
            message: The commit message.
            actor: Who is creating it.

        Returns:
            The commit id.

        Raises:
            PassportExistsError: If a bundle is already there.
            StoreError: If the creation failed. Nothing is uploaded.
        """
        if self.exists(passport_id):
            raise PassportExistsError(
                f"A passport bundle already exists for {passport_id}."
            )

        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            local = LocalPassportStore(root)

            commit = local.create(passport_id, files, message, actor)

            self._upload(
                passport_id,
                root,
                expected_generation=_MUST_NOT_EXIST,
            )

            return commit

    def write(
        self,
        passport_id: str,
        files: Mapping[PurePosixPath, str | bytes],
        message: CommitMessage,
        actor: Actor,
        expected_head: PassportHead,
        *,
        delete: tuple[PurePosixPath, ...] = (),
    ) -> str:
        """Write files and commit, then upload the re-bundled repository.

        Two assertions guard the write, and they catch different races.
        The HEAD check refuses a write built on a stale read. The
        generation check refuses an upload onto a bundle that moved while
        this instance was working, which is the one a single process
        cannot see.

        Args:
            passport_id: Whose passport.
            files: Paths relative to the repository root, and contents.
            message: The commit message.
            actor: Who is making the change.
            expected_head: Where the caller believed HEAD was.
            delete: Paths to remove in the same commit.

        Returns:
            The new commit id.

        Raises:
            PassportNotFoundError: If no bundle exists.
            ConcurrentWriteError: If HEAD moved since the caller read it,
                or if the bundle moved during the write.
            NonFastForwardError: If the commit would rewrite history.
            StoreError: If the write failed. Nothing is uploaded.
        """
        with self._checkout(passport_id) as checkout:
            commit = checkout.store.write(
                passport_id,
                files,
                message,
                actor,
                expected_head,
                delete=delete,
            )

            self._upload(
                passport_id,
                checkout.root,
                expected_generation=checkout.generation,
            )

            return commit

    def _checkout(self, passport_id: str) -> _Checkout:
        """Download and unbundle a passport into a temporary directory.

        Returns:
            A context manager yielding the unbundled repository, where it
            sits, and the generation it was downloaded at. The directory
            is removed on exit whether or not anything was written, so
            nothing survives between calls.

        Raises:
            PassportNotFoundError: If no bundle exists.
        """
        return _Checkout(self, passport_id)

    def _download(self, passport_id: str) -> tuple[bytes, int | None]:
        """Fetch a passport's bundle and the generation it was at.

        Returns:
            The bundle bytes, and the generation to assert on upload.

        Raises:
            PassportNotFoundError: If there is no bundle.
        """
        blob = self._bundle(passport_id)

        if not blob.exists():
            raise PassportNotFoundError(
                f"No passport bundle for {passport_id}."
            )

        data = blob.download_as_bytes()

        # Read the generation from the same object the bytes came from,
        # so the value asserted at upload describes what was actually
        # downloaded rather than a later state.
        generation = blob.generation

        return data, generation

    def _upload(
        self,
        passport_id: str,
        root: Path,
        *,
        expected_generation: int | None,
    ) -> None:
        """Bundle the repository and upload it, conditionally.

        Args:
            passport_id: Whose passport.
            root: The store root holding the repository.
            expected_generation: The generation the upload is conditional
                on. ``0`` means the object must not exist yet.

        Raises:
            ConcurrentWriteError: If the object moved, so the write was
                refused. The repository in the bucket is untouched and
                the caller should re-read and decide again.
            BundleError: If the repository could not be bundled.
            StoreError: If the upload failed for any other reason.
        """
        data = _bundle_bytes(root / paths.shard(passport_id))

        try:
            self._bundle(passport_id).upload_from_string(
                data,
                content_type="application/x-git-bundle",
                if_generation_match=expected_generation,
            )
        except Exception as error:
            if _is_precondition_failed(error):
                raise ConcurrentWriteError(
                    f"Passport {passport_id} was written by something else "
                    "while this write was in progress. Nothing was "
                    "overwritten. Re-read and decide again."
                ) from error

            raise StoreError(
                f"Could not upload passport {passport_id}: {error}"
            ) from error


class _Checkout:
    """One passport, unbundled into a temporary directory.

    A context manager rather than a method so the directory's lifetime is
    explicit at every call site: the repository exists for the duration
    of one operation and is removed afterwards, whether that operation
    read, wrote or failed.

    It carries its own root rather than asking the local store for one.
    The store keeps that private, and the write path needs it to
    re-bundle, so the object that created the directory is the one that
    remembers where it is.
    """

    def __init__(self, store: GcsPassportStore, passport_id: str) -> None:
        self._store = store
        self._passport_id = passport_id
        self._scratch: tempfile.TemporaryDirectory[str] | None = None

        #: The unbundled repository, once entered.
        self.store: LocalPassportStore
        #: Where it sits, for the write path to bundle from.
        self.root: Path
        #: The generation the bundle was downloaded at, asserted on
        #: upload so a bundle that moved meanwhile is not overwritten.
        self.generation: int | None

    def __enter__(self) -> _Checkout:
        data, generation = self._store._download(self._passport_id)

        self._scratch = tempfile.TemporaryDirectory()
        root = Path(self._scratch.name)

        _unbundle(data, root / paths.shard(self._passport_id))

        self.store = LocalPassportStore(root)
        self.root = root
        self.generation = generation

        return self

    def __exit__(self, *_exception: object) -> None:
        if self._scratch is not None:
            self._scratch.cleanup()
            self._scratch = None


def _bundle_bytes(repository: Path) -> bytes:
    """Bundle a repository into bytes.

    ``git bundle`` rather than an archive of the directory: a bundle is a
    single file holding the full history and nothing else, it verifies
    itself on unbundling, and it is the format git itself offers for
    moving a repository as one object.

    Args:
        repository: The repository directory.

    Returns:
        The bundle's bytes.

    Raises:
        BundleError: If git could not bundle it.
    """
    with tempfile.TemporaryDirectory() as scratch:
        target = Path(scratch) / "passport.bundle"

        result = subprocess.run(  # noqa: S603 - fixed argv, no shell
            [
                "git",
                "bundle",
                "create",
                str(target),
                "--all",
            ],
            cwd=str(repository),
            capture_output=True,
            check=False,
        )

        if result.returncode != 0:
            raise BundleError(
                f"Could not bundle {repository}: "
                f"{result.stderr.decode(errors='replace').strip()}"
            )

        return target.read_bytes()


def _unbundle(data: bytes, repository: Path) -> None:
    """Restore a repository from bundle bytes.

    Args:
        data: The bundle.
        repository: Where to put the repository.

    Raises:
        BundleError: If the bytes are not a usable bundle.
    """
    repository.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as scratch:
        source = Path(scratch) / "passport.bundle"
        source.write_bytes(data)

        result = subprocess.run(  # noqa: S603 - fixed argv, no shell
            [
                "git",
                "clone",
                "--branch",
                "main",
                str(source),
                str(repository),
            ],
            capture_output=True,
            check=False,
        )

        if result.returncode != 0:
            raise BundleError(
                "Could not unbundle a passport repository: "
                f"{result.stderr.decode(errors='replace').strip()}"
            )


class GcsBlobStore:
    """Content-addressed evidence in a Cloud Storage bucket.

    The bucket counterpart of :class:`~.blobs.BlobStore`, with the same
    three properties: storing the same bytes twice is one object, an
    existing hash is never overwritten with different bytes, and the
    object name is the whole integrity check.

    Blobs are objects beside the bundle rather than inside it, exactly as
    they sit beside the repository on disk, so evidence never enters git
    on either backend.
    """

    def __init__(self, bucket: _Bucket) -> None:
        """Start a blob store over *bucket*.

        Args:
            bucket: The same bucket the repositories live in, so a
                passport and its evidence move together.
        """
        self._bucket = bucket

    def _name(self, passport_id: str, blob_digest: str) -> str:
        """The object key for one blob.

        Raises:
            PassportPathError: If the passport id or the digest is
                malformed. Both decide an object key, so both are
                validated rather than trusted.
        """
        shard = paths.shard(passport_id)
        return f"{PREFIX}/{shard}/{paths.blob(blob_digest)}"

    def exists(self, passport_id: str, blob_digest: str) -> bool:
        """Whether a blob is already stored."""
        return self._bucket.blob(self._name(passport_id, blob_digest)).exists()

    def put(
        self,
        passport_id: str,
        data: bytes,
        *,
        filename: str,
        media_type: str,
    ) -> Attachment:
        """Store some bytes and describe them.

        Storing the same bytes twice is a no-op returning the same
        attachment, so an interrupted upload can be retried without
        checking first.

        Args:
            passport_id: Whose passport.
            data: The file's contents.
            filename: What it was called when uploaded. Recorded as data
                and never used to locate the bytes, so a filename
                carrying a patient identifier never reaches an object
                key.
            media_type: What kind of file it is.

        Returns:
            The attachment to record, naming the hash rather than a path.

        Raises:
            BlobConflictError: If an object exists at that hash holding
                different bytes.
            BlobError: If the upload failed.
        """
        blob_digest = digest(data)
        blob = self._bucket.blob(self._name(passport_id, blob_digest))

        attachment = Attachment(
            hash=blob_digest,
            filename=filename,
            size_bytes=len(data),
            media_type=media_type,
        )

        if blob.exists():
            if blob.download_as_bytes() != data:
                raise BlobConflictError(
                    f"A blob at {blob_digest} already holds different bytes. "
                    "Refusing to overwrite: every record referring to that "
                    "hash would silently refer to something else."
                )

            # Same bytes, already stored. Idempotent by construction.
            return attachment

        try:
            # Conditional on the object not existing, so two uploads of
            # different bytes racing at one hash cannot both land. The
            # hash makes that near-impossible; the precondition makes it
            # impossible.
            blob.upload_from_string(
                data,
                content_type=media_type,
                if_generation_match=_MUST_NOT_EXIST,
            )
        except Exception as error:
            if _is_precondition_failed(error):
                # Something stored it between the check and the upload.
                # Same hash means same bytes, so this is success.
                return attachment

            raise BlobError(
                f"Could not store blob {blob_digest}: {error}"
            ) from error

        return attachment

    def get(self, passport_id: str, blob_digest: str) -> bytes:
        """Read a blob back.

        Raises:
            BlobNotFoundError: If there is no such blob.
            BlobError: If the download failed.
        """
        blob = self._bucket.blob(self._name(passport_id, blob_digest))

        if not blob.exists():
            raise BlobNotFoundError(
                f"No blob {blob_digest} for passport {passport_id}."
            )

        try:
            return blob.download_as_bytes()
        except Exception as error:
            raise BlobError(
                f"Could not read blob {blob_digest}: {error}"
            ) from error

    def verify(self, passport_id: str, blob_digest: str) -> bool:
        """Whether a stored blob still hashes to its own name.

        Raises:
            BlobNotFoundError: If there is no such blob.
        """
        expected = (
            blob_digest
            if blob_digest.startswith("sha256:")
            else f"sha256:{blob_digest}"
        )

        return digest(self.get(passport_id, blob_digest)) == expected


def build_store(bucket_name: str, client: Any = None) -> GcsPassportStore:
    """Build a bucket-backed passport store.

    The composition point for production. Takes a bucket name rather than
    reading settings, so the caller that knows about configuration stays
    outside this package and every module here keeps importing without
    ``app.config``.

    Args:
        bucket_name: The bucket holding passports.
        client: A Cloud Storage client. Built from the ambient
            credentials when omitted, which is what Cloud Run wants.

    Returns:
        A store over that bucket.
    """
    return GcsPassportStore(_bucket_for(bucket_name, client))


def build_blob_store(bucket_name: str, client: Any = None) -> GcsBlobStore:
    """Build a bucket-backed evidence store.

    Args:
        bucket_name: The same bucket the repositories live in.
        client: A Cloud Storage client, built from ambient credentials
            when omitted.

    Returns:
        A blob store over that bucket.
    """
    return GcsBlobStore(_bucket_for(bucket_name, client))


def _bucket_for(bucket_name: str, client: Any) -> _Bucket:
    """Resolve a bucket, building a default client if none was given.

    The import is deferred to here so the module stays importable
    wherever the library is absent — tooling that reads a passport off
    disk, and the tests, which drive a fake.
    """
    if client is None:
        from google.cloud import storage  # type: ignore[import-untyped]

        client = storage.Client()

    bucket: _Bucket = client.bucket(bucket_name)
    return bucket
