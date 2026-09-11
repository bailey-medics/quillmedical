"""Tests for app/features/passport/gcs_store.py.

A fake bucket rather than a mocked one. The properties worth testing here
are about generations — an upload conditional on the object not having
moved — and a ``MagicMock`` would happily accept any precondition and
report success, which is precisely the bug these tests exist to catch. So
the fake implements the generation rule for real: every upload bumps it,
and a mismatched ``if_generation_match`` raises the 412 the library
raises.

The repositories underneath are real git repositories, bundled and
unbundled with real ``git``, because bundling is the one thing this
backend does that the local store does not, and a fake bundle would test
nothing.

Four groups matter:

- **Round trip.** What goes into the bucket comes back out, with its
  history intact. Everything else assumes this.
- **Generation mismatch.** Two writers, one bundle: the second is refused
  rather than overwriting the first. This is the property that a single
  process cannot test and that Cloud Run needs.
- **Failure leaves the bucket alone.** A write that fails part-way must
  not leave a half-written bundle, and the passport must still be
  readable afterwards.
- **Blob addressing.** Evidence lands at the hash of its own bytes, and
  the same bytes twice is one object.
"""

from __future__ import annotations

from pathlib import PurePosixPath

import pytest

from app.features.passport import paths
from app.features.passport.blobs import BlobConflictError, BlobNotFoundError
from app.features.passport.commits import Actor, CommitMessage
from app.features.passport.gcs_store import (
    PREFIX,
    GcsBlobStore,
    GcsPassportStore,
    _Blob,
)
from app.features.passport.store import (
    ConcurrentWriteError,
    PassportExistsError,
    PassportHead,
    PassportNotFoundError,
    StoreError,
    initial_files,
)

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
OTHER_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90"


class PreconditionFailed(Exception):
    """What the Cloud Storage library raises on a failed precondition.

    Carries ``code = 412`` because that is what the real exception
    carries, and what the module matches on rather than importing
    ``google.api_core``.
    """

    code = 412


class FakeBlob:
    """One object in the fake bucket, with real generation semantics."""

    def __init__(self, bucket: FakeBucket, name: str) -> None:
        self._bucket = bucket
        self._name = name

    @property
    def generation(self) -> int | None:
        stored = self._bucket.objects.get(self._name)
        return None if stored is None else stored[1]

    def exists(self) -> bool:
        return self._name in self._bucket.objects

    def download_as_bytes(self) -> bytes:
        stored = self._bucket.objects.get(self._name)

        if stored is None:
            raise FileNotFoundError(self._name)

        return stored[0]

    def upload_from_string(
        self,
        data: bytes,
        *,
        content_type: str = "application/octet-stream",
        if_generation_match: int | None = None,
    ) -> None:
        self._bucket.uploads.append(self._name)

        if self._bucket.fail_next_upload:
            self._bucket.fail_next_upload = False
            raise RuntimeError("the network went away mid-upload")

        # Simulate another writer landing between this caller's download
        # and its upload — the window the generation check exists to
        # close, and the one a single process cannot otherwise reach.
        if self._bucket.bump_before_next_upload:
            self._bucket.bump_before_next_upload = False
            existing = self._bucket.objects.get(self._name)

            if existing is not None:
                self._bucket.generation += 1
                self._bucket.objects[self._name] = (
                    existing[0],
                    self._bucket.generation,
                )

        stored = self._bucket.objects.get(self._name)
        current = 0 if stored is None else stored[1]

        if if_generation_match is not None and if_generation_match != current:
            raise PreconditionFailed(
                f"generation {current} does not match "
                f"{if_generation_match}"
            )

        self._bucket.generation += 1
        self._bucket.objects[self._name] = (data, self._bucket.generation)

    def reload(self) -> None:
        return None


class FakeBucket:
    """A bucket that keeps bytes and generations in a dict."""

    def __init__(self) -> None:
        #: name -> (bytes, generation)
        self.objects: dict[str, tuple[bytes, int]] = {}
        self.generation = 0
        self.fail_next_upload = False
        #: Move the object on the next upload attempt, as another writer
        #: landing in the window between this caller's download and its
        #: upload would. The only way to reach that race in one process.
        self.bump_before_next_upload = False
        self.uploads: list[str] = []

    def blob(self, name: str) -> _Blob:
        # Declared as the protocol rather than FakeBlob: the store takes
        # a _Bucket, and a narrower return type would not satisfy it.
        return FakeBlob(self, name)


@pytest.fixture
def bucket() -> FakeBucket:
    return FakeBucket()


@pytest.fixture
def passport_store(bucket: FakeBucket) -> GcsPassportStore:
    return GcsPassportStore(bucket)


@pytest.fixture
def blob_store(bucket: FakeBucket) -> GcsBlobStore:
    return GcsBlobStore(bucket)


@pytest.fixture
def actor() -> Actor:
    return Actor(
        name="Dr Amara Okonkwo",
        role="Consultant",
        email="amara@example.nhs.uk",
        registrations=("GMC 1234567",),
    )


def _message(summary: str = "a change") -> CommitMessage:
    return CommitMessage(
        subject=f"passport:create: {summary}",
        trailers=(("Actor-Name", "Dr Amara Okonkwo"),),
    )


def _created(
    passport_store: GcsPassportStore,
    actor: Actor,
    passport_id: str = PASSPORT_ID,
) -> str:
    return passport_store.create(
        passport_id,
        initial_files("passport_id: x\n", "user_id: y\n", "z: 1\n"),
        _message("new passport"),
        actor,
    )


class TestCreate:
    def test_uploads_a_bundle(
        self,
        passport_store: GcsPassportStore,
        bucket: FakeBucket,
        actor: Actor,
    ) -> None:
        _created(passport_store, actor)

        expected = f"{PREFIX}/{paths.shard(PASSPORT_ID)}.bundle"

        assert expected in bucket.objects
        assert passport_store.exists(PASSPORT_ID)

    def test_the_first_commit_is_readable_afterwards(
        self, passport_store: GcsPassportStore, actor: Actor
    ) -> None:
        commit = _created(passport_store, actor)

        assert passport_store.head(PASSPORT_ID).commit == commit
        assert (
            passport_store.read(PASSPORT_ID, paths.MANIFEST)
            == b"passport_id: x\n"
        )

    def test_refuses_a_passport_that_already_exists(
        self, passport_store: GcsPassportStore, actor: Actor
    ) -> None:
        _created(passport_store, actor)

        with pytest.raises(PassportExistsError):
            _created(passport_store, actor)

    def test_uploads_conditionally_on_the_object_not_existing(
        self,
        passport_store: GcsPassportStore,
        bucket: FakeBucket,
        actor: Actor,
    ) -> None:
        """Two instances creating one passport: the loser is refused.

        The existence check cannot close this on its own — both callers
        can pass it before either uploads — so the precondition is what
        actually prevents one creation overwriting the other.
        """
        _created(passport_store, actor)

        name = f"{PREFIX}/{paths.shard(PASSPORT_ID)}.bundle"
        blob = bucket.blob(name)

        with pytest.raises(PreconditionFailed):
            blob.upload_from_string(b"anything", if_generation_match=0)

    def test_unknown_passport_is_not_found(
        self, passport_store: GcsPassportStore
    ) -> None:
        with pytest.raises(PassportNotFoundError):
            passport_store.head(PASSPORT_ID)


class TestRoundTrip:
    def test_a_write_is_readable_back(
        self, passport_store: GcsPassportStore, actor: Actor
    ) -> None:
        _created(passport_store, actor)
        head = passport_store.head(PASSPORT_ID)

        passport_store.write(
            PASSPORT_ID,
            {PurePosixPath("competencies.yaml"): "entries: []\n"},
            _message("update the index"),
            actor,
            head,
        )

        assert (
            passport_store.read(
                PASSPORT_ID, PurePosixPath("competencies.yaml")
            )
            == b"entries: []\n"
        )

    def test_history_survives_the_bundle_round_trip(
        self, passport_store: GcsPassportStore, actor: Actor
    ) -> None:
        """Every commit, not just the tip.

        A bundle carrying only the latest state would pass every other
        test here and quietly destroy the audit trail, which is the one
        thing the passport is for.
        """
        first = _created(passport_store, actor)

        second = passport_store.write(
            PASSPORT_ID,
            {PurePosixPath("competencies.yaml"): "entries: []\n"},
            _message("second"),
            actor,
            PassportHead(commit=first),
        )

        third = passport_store.write(
            PASSPORT_ID,
            {PurePosixPath("competencies.yaml"): "entries: [a]\n"},
            _message("third"),
            actor,
            PassportHead(commit=second),
        )

        assert passport_store.head(PASSPORT_ID).commit == third
        assert first != second != third

    def test_list_dir_sees_what_was_written(
        self, passport_store: GcsPassportStore, actor: Actor
    ) -> None:
        _created(passport_store, actor)
        head = passport_store.head(PASSPORT_ID)

        passport_store.write(
            PASSPORT_ID,
            {
                PurePosixPath(
                    "sign-offs/2026-03-14-perform-bronchoscopy/sign-off.yaml"
                ): "id: x\n"
            },
            _message("a sign-off"),
            actor,
            head,
        )

        entries = passport_store.list_dir(PASSPORT_ID, paths.SIGN_OFFS)

        assert entries == [paths.SIGN_OFFS / "2026-03-14-perform-bronchoscopy"]

    def test_passports_do_not_see_each_other(
        self, passport_store: GcsPassportStore, actor: Actor
    ) -> None:
        _created(passport_store, actor)
        _created(passport_store, actor, OTHER_ID)

        head = passport_store.head(PASSPORT_ID)
        passport_store.write(
            PASSPORT_ID,
            {PurePosixPath("competencies.yaml"): "entries: [mine]\n"},
            _message("mine"),
            actor,
            head,
        )

        assert (
            passport_store.read(OTHER_ID, PurePosixPath("competencies.yaml"))
            == b"z: 1\n"
        )


class TestConcurrency:
    def test_a_stale_head_is_refused(
        self, passport_store: GcsPassportStore, actor: Actor
    ) -> None:
        first = _created(passport_store, actor)

        passport_store.write(
            PASSPORT_ID,
            {PurePosixPath("competencies.yaml"): "entries: [a]\n"},
            _message("first writer"),
            actor,
            PassportHead(commit=first),
        )

        with pytest.raises(ConcurrentWriteError):
            passport_store.write(
                PASSPORT_ID,
                {PurePosixPath("competencies.yaml"): "entries: [b]\n"},
                _message("second writer"),
                actor,
                PassportHead(commit=first),
            )

    def test_a_generation_mismatch_is_refused(
        self,
        passport_store: GcsPassportStore,
        bucket: FakeBucket,
        actor: Actor,
    ) -> None:
        """The race a single process cannot see.

        Both instances read the same HEAD, so the HEAD assertion passes
        for both. What stops the second overwriting the first is the
        generation the bundle was downloaded at, which has moved by the
        time it uploads.
        """
        first = _created(passport_store, actor)

        # The bundle moves after this write has downloaded it and before
        # it uploads, so the HEAD it read is still current and only the
        # generation can refuse the write. Restoring old bytes under the
        # current generation would not test this: the store re-downloads
        # inside the write, so it would simply read the newer generation
        # and its precondition would match.
        bucket.bump_before_next_upload = True

        with pytest.raises(ConcurrentWriteError):
            passport_store.write(
                PASSPORT_ID,
                {PurePosixPath("competencies.yaml"): "entries: [mine]\n"},
                _message("this instance"),
                actor,
                PassportHead(commit=first),
            )

    def test_a_refused_write_leaves_the_bundle_alone(
        self,
        passport_store: GcsPassportStore,
        bucket: FakeBucket,
        actor: Actor,
    ) -> None:
        first = _created(passport_store, actor)

        passport_store.write(
            PASSPORT_ID,
            {PurePosixPath("competencies.yaml"): "entries: [theirs]\n"},
            _message("the other instance"),
            actor,
            PassportHead(commit=first),
        )

        theirs = passport_store.head(PASSPORT_ID).commit

        with pytest.raises(ConcurrentWriteError):
            passport_store.write(
                PASSPORT_ID,
                {PurePosixPath("competencies.yaml"): "entries: [mine]\n"},
                _message("this instance"),
                actor,
                PassportHead(commit=first),
            )

        assert passport_store.head(PASSPORT_ID).commit == theirs
        assert (
            passport_store.read(
                PASSPORT_ID, PurePosixPath("competencies.yaml")
            )
            == b"entries: [theirs]\n"
        )


class TestFailure:
    def test_a_failed_upload_leaves_the_passport_readable(
        self,
        passport_store: GcsPassportStore,
        bucket: FakeBucket,
        actor: Actor,
    ) -> None:
        """A partial upload must not cost the passport its history.

        The commit happened in a temporary directory that is then thrown
        away, so a failed upload loses the change and keeps the record —
        which is the right way round.
        """
        first = _created(passport_store, actor)
        bucket.fail_next_upload = True

        with pytest.raises(StoreError):
            passport_store.write(
                PASSPORT_ID,
                {PurePosixPath("competencies.yaml"): "entries: [a]\n"},
                _message("doomed"),
                actor,
                PassportHead(commit=first),
            )

        assert passport_store.head(PASSPORT_ID).commit == first
        assert (
            passport_store.read(PASSPORT_ID, paths.MANIFEST)
            == b"passport_id: x\n"
        )

    def test_a_write_after_a_failure_succeeds(
        self,
        passport_store: GcsPassportStore,
        bucket: FakeBucket,
        actor: Actor,
    ) -> None:
        """Re-opening after a failure works, with nothing left stuck.

        Each operation downloads afresh into its own directory, so a
        failed write leaves no state for the next one to trip over.
        """
        first = _created(passport_store, actor)
        bucket.fail_next_upload = True

        with pytest.raises(StoreError):
            passport_store.write(
                PASSPORT_ID,
                {PurePosixPath("competencies.yaml"): "entries: [a]\n"},
                _message("doomed"),
                actor,
                PassportHead(commit=first),
            )

        commit = passport_store.write(
            PASSPORT_ID,
            {PurePosixPath("competencies.yaml"): "entries: [b]\n"},
            _message("the retry"),
            actor,
            PassportHead(commit=first),
        )

        assert passport_store.head(PASSPORT_ID).commit == commit
        assert (
            passport_store.read(
                PASSPORT_ID, PurePosixPath("competencies.yaml")
            )
            == b"entries: [b]\n"
        )

    def test_a_failed_create_uploads_nothing(
        self,
        passport_store: GcsPassportStore,
        bucket: FakeBucket,
        actor: Actor,
    ) -> None:
        bucket.fail_next_upload = True

        with pytest.raises(StoreError):
            _created(passport_store, actor)

        assert not passport_store.exists(PASSPORT_ID)

    def test_a_write_claiming_an_empty_history_is_refused(
        self, passport_store: GcsPassportStore, actor: Actor
    ) -> None:
        """A caller claiming the passport has no commits is refused.

        Through the public write path the HEAD assertion fires first, so
        this raises ``ConcurrentWriteError`` rather than
        ``NonFastForwardError`` — the same ordering the local store has,
        inherited rather than reimplemented. The rewrite refusal itself
        is tested where the rule lives, in ``test_passport_store.py``,
        which reaches it through the private commit seam because no
        public path can. What matters here is that the bundle backend
        does not open a route around either check.
        """
        first = _created(passport_store, actor)

        with pytest.raises(ConcurrentWriteError):
            passport_store.write(
                PASSPORT_ID,
                {PurePosixPath("competencies.yaml"): "entries: []\n"},
                _message("a rewrite"),
                actor,
                PassportHead(commit=None),
            )

        assert passport_store.head(PASSPORT_ID).commit == first


class TestBlobs:
    def test_a_blob_lands_at_the_hash_of_its_bytes(
        self, blob_store: GcsBlobStore, bucket: FakeBucket
    ) -> None:
        attachment = blob_store.put(
            PASSPORT_ID,
            b"a scanned certificate",
            filename="certificate.pdf",
            media_type="application/pdf",
        )

        expected = (
            f"{PREFIX}/{paths.shard(PASSPORT_ID)}/"
            f"{paths.blob(attachment.hash)}"
        )

        assert expected in bucket.objects
        assert attachment.size_bytes == len(b"a scanned certificate")

    def test_the_same_bytes_twice_is_one_object(
        self, blob_store: GcsBlobStore, bucket: FakeBucket
    ) -> None:
        first = blob_store.put(
            PASSPORT_ID,
            b"the same file",
            filename="a.pdf",
            media_type="application/pdf",
        )
        second = blob_store.put(
            PASSPORT_ID,
            b"the same file",
            filename="b.pdf",
            media_type="application/pdf",
        )

        assert first.hash == second.hash
        assert len(bucket.objects) == 1

    def test_a_blob_reads_back(self, blob_store: GcsBlobStore) -> None:
        attachment = blob_store.put(
            PASSPORT_ID,
            b"evidence",
            filename="a.pdf",
            media_type="application/pdf",
        )

        assert blob_store.get(PASSPORT_ID, attachment.hash) == b"evidence"
        assert blob_store.verify(PASSPORT_ID, attachment.hash)

    def test_a_missing_blob_is_not_found(
        self, blob_store: GcsBlobStore
    ) -> None:
        with pytest.raises(BlobNotFoundError):
            blob_store.get(PASSPORT_ID, "sha256:" + "ab" * 32)

    def test_different_bytes_at_one_hash_are_refused(
        self, blob_store: GcsBlobStore, bucket: FakeBucket
    ) -> None:
        """Corruption, not a collision — but refused either way.

        Reached by tampering with the bucket, because producing a real
        sha256 collision is not available to a test. What matters is that
        the store refuses rather than overwriting, since every record
        naming that hash would otherwise refer to something else.
        """
        attachment = blob_store.put(
            PASSPORT_ID,
            b"the original",
            filename="a.pdf",
            media_type="application/pdf",
        )

        name = (
            f"{PREFIX}/{paths.shard(PASSPORT_ID)}/"
            f"{paths.blob(attachment.hash)}"
        )
        bucket.objects[name] = (b"something else", bucket.objects[name][1])

        with pytest.raises(BlobConflictError):
            blob_store.put(
                PASSPORT_ID,
                b"the original",
                filename="a.pdf",
                media_type="application/pdf",
            )

    def test_a_filename_never_reaches_an_object_key(
        self, blob_store: GcsBlobStore, bucket: FakeBucket
    ) -> None:
        """A scan named for a patient must not name an object.

        The same property the local blob store pins, asserted again here
        because the key is built differently.
        """
        blob_store.put(
            PASSPORT_ID,
            b"evidence",
            filename="NHS1234567890-smith-john-dob-1970.pdf",
            media_type="application/pdf",
        )

        assert all("smith" not in name for name in bucket.objects)
        assert all("NHS" not in name for name in bucket.objects)

    def test_blobs_are_scoped_to_their_passport(
        self, blob_store: GcsBlobStore
    ) -> None:
        attachment = blob_store.put(
            PASSPORT_ID,
            b"evidence",
            filename="a.pdf",
            media_type="application/pdf",
        )

        assert not blob_store.exists(OTHER_ID, attachment.hash)
