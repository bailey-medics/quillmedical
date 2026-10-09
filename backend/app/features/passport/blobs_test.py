"""Evidence stored under its own hash, asked of blobs.py itself."""

import hashlib
import re
from pathlib import Path

import pytest

from app.features.passport import paths
from app.features.passport.blobs import (
    BlobConflictError,
    BlobError,
    BlobNotFoundError,
    BlobStore,
    digest,
    digest_file,
)
from app.features.passport.paths import PassportPathError
from app.features.passport.schemas import Attachment

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
OTHER_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90"

SCAN = b"a scanned certificate"
#: The published SHA-256 of no bytes at all.
EMPTY_DIGEST = (
    "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
)
ABSENT_DIGEST = "sha256:" + "ab" * 32
#: Longer than the 64 KiB read, and not a whole number of reads.
SEVERAL_READS = bytes(range(256)) * 1000 + b"tail"


def _put(store: BlobStore, data: bytes = SCAN, **overrides: str) -> Attachment:
    described = {"filename": "scan.pdf", "media_type": "application/pdf"}
    described.update(overrides)

    return store.put(PASSPORT_ID, data, **described)


def _where(
    root: Path, blob_digest: str, passport_id: str = PASSPORT_ID
) -> Path:
    """Where the layout puts a blob, worked out apart from the store."""
    return root / paths.shard(passport_id) / paths.blob(blob_digest)


def _files_under(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*") if path.is_file())


# --- digest and digest_file -------------------------------------------------


def test_a_digest_is_the_sha256_of_the_bytes_with_its_prefix() -> None:
    assert digest(b"") == EMPTY_DIGEST
    assert digest(SCAN) == "sha256:" + hashlib.sha256(SCAN).hexdigest()


def test_a_digest_is_in_the_form_a_record_stores() -> None:
    """The prefix, then 64 lower-case hex characters, as Attachment asks."""
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", digest(SCAN))


def test_different_bytes_have_different_digests() -> None:
    assert digest(b"original") != digest(b"original ")


@pytest.mark.parametrize("data", [b"", SCAN, SEVERAL_READS])
def test_a_file_hashes_to_the_digest_of_its_bytes(
    tmp_path: Path, data: bytes
) -> None:
    """However many reads it takes, and for a file with nothing in it."""
    source = tmp_path / "evidence.bin"
    source.write_bytes(data)

    assert digest_file(source) == digest(data)


def test_hashing_a_file_that_is_not_there_is_a_blob_error(
    tmp_path: Path,
) -> None:
    missing = tmp_path / "missing.pdf"

    with pytest.raises(BlobError, match="Could not read") as refused:
        digest_file(missing)

    assert isinstance(refused.value.__cause__, OSError)


def test_hashing_a_directory_is_a_blob_error(tmp_path: Path) -> None:
    with pytest.raises(BlobError, match="Could not read"):
        digest_file(tmp_path)


# --- the errors -------------------------------------------------------------


@pytest.mark.parametrize("error", [BlobNotFoundError, BlobConflictError])
def test_every_refusal_can_be_caught_as_a_blob_error(
    error: type[Exception],
) -> None:
    assert issubclass(error, BlobError)


# --- put --------------------------------------------------------------------


def test_storing_describes_the_bytes_by_hash_size_and_what_was_said(
    tmp_path: Path,
) -> None:
    attachment = _put(
        BlobStore(tmp_path), filename="dops.jpg", media_type="image/jpeg"
    )

    assert attachment == Attachment(
        hash=digest(SCAN),
        filename="dops.jpg",
        size_bytes=len(SCAN),
        media_type="image/jpeg",
    )


def test_the_bytes_land_beside_the_passport_under_their_own_hash(
    tmp_path: Path,
) -> None:
    attachment = _put(BlobStore(tmp_path))

    bare = attachment.hash.removeprefix("sha256:")
    expected = (
        tmp_path
        / "3f"
        / "2a"
        / PASSPORT_ID
        / "files"
        / "sha256"
        / bare[:2]
        / bare[2:4]
        / bare
    )
    assert _files_under(tmp_path) == [expected]
    assert expected.read_bytes() == SCAN


def test_storing_leaves_no_part_written_file_behind(tmp_path: Path) -> None:
    _put(BlobStore(tmp_path))

    assert [path.suffix for path in _files_under(tmp_path)] == [""]


def test_storing_the_same_bytes_again_writes_nothing_more(
    tmp_path: Path,
) -> None:
    """So an interrupted upload is retried without checking first."""
    store = BlobStore(tmp_path)
    first = _put(store)
    written = _where(tmp_path, first.hash).stat().st_mtime_ns

    second = _put(store)

    assert second == first
    assert len(_files_under(tmp_path)) == 1
    assert _where(tmp_path, first.hash).stat().st_mtime_ns == written


def test_a_second_upload_is_described_as_it_was_named_that_time(
    tmp_path: Path,
) -> None:
    """One blob, and each record keeps the filename it was given."""
    store = BlobStore(tmp_path)
    _put(store, filename="first.pdf", media_type="application/pdf")

    second = _put(store, filename="second.png", media_type="image/png")

    assert (second.filename, second.media_type) == ("second.png", "image/png")
    assert second.hash == digest(SCAN)
    assert second.size_bytes == len(SCAN)


def test_a_file_with_nothing_in_it_is_stored_and_is_not_an_absent_one(
    tmp_path: Path,
) -> None:
    store = BlobStore(tmp_path)

    attachment = _put(store, b"")

    assert attachment.hash == EMPTY_DIGEST
    assert attachment.size_bytes == 0
    assert store.exists(PASSPORT_ID, EMPTY_DIGEST)
    assert store.get(PASSPORT_ID, EMPTY_DIGEST) == b""


def test_different_bytes_at_a_hash_are_refused_and_left_as_they_were(
    tmp_path: Path,
) -> None:
    """Something else wrote there: overwriting would hide that it had."""
    store = BlobStore(tmp_path)
    attachment = _put(store)
    _where(tmp_path, attachment.hash).write_bytes(b"planted")

    with pytest.raises(BlobConflictError, match="Refusing to overwrite"):
        _put(store)

    assert _where(tmp_path, attachment.hash).read_bytes() == b"planted"


def test_a_refused_overwrite_does_not_name_the_file_that_was_uploaded(
    tmp_path: Path,
) -> None:
    """A filename can carry a patient's name, and errors are logged."""
    store = BlobStore(tmp_path)
    attachment = _put(store)
    _where(tmp_path, attachment.hash).write_bytes(b"planted")

    with pytest.raises(BlobConflictError) as refused:
        _put(store, filename="NHS1234567-Smith.pdf")

    assert "Smith" not in str(refused.value)
    assert attachment.hash in str(refused.value)


def test_a_write_that_cannot_be_made_is_a_blob_error(tmp_path: Path) -> None:
    """A file stands where the blob directory should be."""
    passport_dir = tmp_path / paths.shard(PASSPORT_ID)
    passport_dir.mkdir(parents=True)
    (passport_dir / paths.FILES).write_text("in the way")

    with pytest.raises(BlobError, match="Could not store blob") as refused:
        _put(BlobStore(tmp_path))

    assert isinstance(refused.value.__cause__, OSError)
    assert not isinstance(refused.value, BlobConflictError)


def test_a_write_that_fails_part_way_leaves_nothing_under_the_hash(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A short file at a valid hash could not be told from a whole one."""
    store = BlobStore(tmp_path)

    def fail(self: Path, target: Path) -> Path:
        raise OSError("disk full")

    with monkeypatch.context() as patched:
        patched.setattr(Path, "replace", fail)

        with pytest.raises(BlobError, match="disk full"):
            _put(store)

    assert not store.exists(PASSPORT_ID, digest(SCAN))
    assert list(tmp_path.rglob("*.partial")) == []
    with pytest.raises(BlobNotFoundError):
        store.get(PASSPORT_ID, digest(SCAN))


def test_a_write_that_failed_part_way_can_be_tried_again(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = BlobStore(tmp_path)

    def fail(self: Path, target: Path) -> Path:
        raise OSError("disk full")

    with monkeypatch.context() as patched:
        patched.setattr(Path, "replace", fail)

        with pytest.raises(BlobError):
            _put(store)

    attachment = _put(store)

    assert store.get(PASSPORT_ID, attachment.hash) == SCAN
    assert store.verify(PASSPORT_ID, attachment.hash)
    assert [path.suffix for path in _files_under(tmp_path)] == [""]


# --- exists and get ---------------------------------------------------------


def test_a_blob_exists_only_once_it_has_been_stored(tmp_path: Path) -> None:
    store = BlobStore(tmp_path)

    assert not store.exists(PASSPORT_ID, digest(SCAN))

    _put(store)

    assert store.exists(PASSPORT_ID, digest(SCAN))
    assert not store.exists(PASSPORT_ID, ABSENT_DIGEST)


def test_a_blob_is_found_by_its_hash_with_or_without_the_prefix(
    tmp_path: Path,
) -> None:
    store = BlobStore(tmp_path)
    attachment = _put(store)
    bare = attachment.hash.removeprefix("sha256:")

    assert store.exists(PASSPORT_ID, bare)
    assert store.get(PASSPORT_ID, bare) == SCAN
    assert store.verify(PASSPORT_ID, bare)


def test_a_blob_reads_back_as_the_bytes_stored(tmp_path: Path) -> None:
    store = BlobStore(tmp_path)
    attachment = _put(store, SEVERAL_READS)

    assert store.get(PASSPORT_ID, attachment.hash) == SEVERAL_READS


def test_reading_a_blob_that_is_not_there_says_which_and_whose(
    tmp_path: Path,
) -> None:
    """A broken reference, never an empty file."""
    with pytest.raises(BlobNotFoundError) as refused:
        BlobStore(tmp_path).get(PASSPORT_ID, ABSENT_DIGEST)

    assert ABSENT_DIGEST in str(refused.value)
    assert PASSPORT_ID in str(refused.value)


def test_a_directory_at_a_hash_is_not_a_blob(tmp_path: Path) -> None:
    store = BlobStore(tmp_path)
    _where(tmp_path, ABSENT_DIGEST).mkdir(parents=True)

    assert not store.exists(PASSPORT_ID, ABSENT_DIGEST)
    with pytest.raises(BlobNotFoundError):
        store.get(PASSPORT_ID, ABSENT_DIGEST)


def test_a_read_that_fails_is_a_blob_error_and_not_a_missing_blob(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = BlobStore(tmp_path)
    attachment = _put(store)

    def fail(self: Path) -> bytes:
        raise OSError("input/output error")

    monkeypatch.setattr(Path, "read_bytes", fail)

    with pytest.raises(BlobError, match="Could not read blob") as refused:
        store.get(PASSPORT_ID, attachment.hash)

    assert not isinstance(refused.value, BlobNotFoundError)


# --- one passport's evidence is its own -------------------------------------


def test_evidence_stored_for_one_passport_is_not_found_for_another(
    tmp_path: Path,
) -> None:
    store = BlobStore(tmp_path)
    attachment = _put(store)

    assert not store.exists(OTHER_ID, attachment.hash)
    with pytest.raises(BlobNotFoundError):
        store.get(OTHER_ID, attachment.hash)
    with pytest.raises(BlobNotFoundError):
        store.verify(OTHER_ID, attachment.hash)


def test_the_same_bytes_for_two_passports_are_kept_beside_each(
    tmp_path: Path,
) -> None:
    """So a passport and its evidence move together."""
    store = BlobStore(tmp_path)
    mine = _put(store)

    theirs = store.put(
        OTHER_ID, SCAN, filename="scan.pdf", media_type="application/pdf"
    )

    assert theirs.hash == mine.hash
    assert _files_under(tmp_path) == sorted(
        [
            _where(tmp_path, mine.hash),
            _where(tmp_path, mine.hash, OTHER_ID),
        ]
    )


# --- verify -----------------------------------------------------------------


def test_a_stored_blob_verifies_against_its_own_name(tmp_path: Path) -> None:
    store = BlobStore(tmp_path)
    attachment = _put(store, SEVERAL_READS)

    assert store.verify(PASSPORT_ID, attachment.hash) is True


@pytest.mark.parametrize("altered", [b"", SCAN[:-1], SCAN + b" "])
def test_bytes_that_no_longer_match_their_name_do_not_verify(
    tmp_path: Path, altered: bytes
) -> None:
    """Emptied, cut short or added to: all found with no stored checksum."""
    store = BlobStore(tmp_path)
    attachment = _put(store)
    _where(tmp_path, attachment.hash).write_bytes(altered)

    assert store.verify(PASSPORT_ID, attachment.hash) is False
    assert (
        store.verify(PASSPORT_ID, attachment.hash.removeprefix("sha256:"))
        is False
    )


def test_verifying_a_blob_that_is_not_there_is_refused_not_failed(
    tmp_path: Path,
) -> None:
    """Missing and corrupt are different findings."""
    with pytest.raises(BlobNotFoundError):
        BlobStore(tmp_path).verify(PASSPORT_ID, ABSENT_DIGEST)


# --- what decides a path is validated ---------------------------------------


@pytest.mark.parametrize(
    "passport_id",
    ["", "../../etc", PASSPORT_ID.upper(), PASSPORT_ID[:-1], "3f2a/" * 6],
)
def test_a_malformed_passport_id_reaches_no_path(
    tmp_path: Path, passport_id: str
) -> None:
    store = BlobStore(tmp_path)

    with pytest.raises(PassportPathError):
        store.exists(passport_id, ABSENT_DIGEST)
    with pytest.raises(PassportPathError):
        store.get(passport_id, ABSENT_DIGEST)
    with pytest.raises(PassportPathError):
        store.verify(passport_id, ABSENT_DIGEST)
    with pytest.raises(PassportPathError):
        store.put(
            passport_id, SCAN, filename="a.pdf", media_type="application/pdf"
        )

    assert _files_under(tmp_path) == []


@pytest.mark.parametrize(
    "blob_digest",
    [
        "",
        "sha256:",
        "md5:" + "ab" * 16,
        "sha256:" + "AB" * 32,
        "sha256:" + "ab" * 31,
        "../" * 20 + "passwd",
    ],
)
def test_a_malformed_digest_reaches_no_path(
    tmp_path: Path, blob_digest: str
) -> None:
    store = BlobStore(tmp_path)

    with pytest.raises(PassportPathError):
        store.exists(PASSPORT_ID, blob_digest)
    with pytest.raises(PassportPathError):
        store.get(PASSPORT_ID, blob_digest)
    with pytest.raises(PassportPathError):
        store.verify(PASSPORT_ID, blob_digest)
