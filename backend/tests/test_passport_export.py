"""Tests for app/features/passport/export.py.

The zip is the artefact a registrar carries between trusts, so what
matters is that it is complete and stands on its own. Three things are
asserted beyond "a zip came out":

**Every canonical file is in it.** Not a rendering of the record but a
byte-for-byte copy, so a holder can open the YAML in a text editor and
read exactly what the repository holds.

**The history is in it.** ``passport.bundle`` is the only file carrying
who changed what and when, so a bundle without it would look complete
while having lost the audit trail.

**A broken rendering does not deny the export.** The record is what
matters and is already written by the time the views are attempted. A
holder with the files and no PDF is far better off than one with
nothing, so a failure there is logged and skipped.
"""

from __future__ import annotations

import zipfile
from datetime import date
from io import BytesIO
from pathlib import Path

import pytest

from app.features.passport import export, records, service
from app.features.passport.commits import Actor
from app.features.passport.schemas import Certificate, LogbookEntry, Reflection
from app.features.passport.store import (
    LocalPassportStore,
    PassportNotFoundError,
)

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
COMPETENCY = "prescribe_sact"
LEVEL = "review_and_authorise"


@pytest.fixture
def holder() -> Actor:
    return Actor(
        name="Dr Priya Kapoor",
        role="specialty_trainee_3_plus",
        email="priya@example.nhs.uk",
        registrations=("GMC 1234567",),
    )


@pytest.fixture
def assessor() -> Actor:
    return Actor(
        name="Dr Amara Okonkwo",
        role="consultant",
        email="amara@example.nhs.uk",
        registrations=("GMC 7654321",),
    )


@pytest.fixture
def store(tmp_path: Path, holder: Actor) -> LocalPassportStore:
    created = LocalPassportStore(tmp_path)
    service.create_passport(
        created,
        PASSPORT_ID,
        holder,
        user_id="1",
        registrations=[{"body": "GMC", "number": "1234567"}],
    )
    return created


@pytest.fixture
def populated(
    store: LocalPassportStore, holder: Actor, assessor: Actor
) -> LocalPassportStore:
    """A passport with one of everything in it."""
    name, _ = service.request_sign_off(
        store,
        PASSPORT_ID,
        holder,
        competency_id=COMPETENCY,
        observed_on=date(2026, 3, 14),
        level_id=LEVEL,
    )
    service.sign_off(
        store,
        PASSPORT_ID,
        assessor,
        name=name,
        assessor_user_id="2",
        holder_user_id="1",
        meaning="directly observed",
        declaration_confirmed=True,
        level_id=LEVEL,
        registrations=[{"body": "GMC", "number": "7654321"}],
    )
    records.add_logbook_entry(
        store,
        PASSPORT_ID,
        holder,
        COMPETENCY,
        LogbookEntry(performed_on=date(2026, 3, 12)),
    )
    records.add_certificate(
        store,
        PASSPORT_ID,
        holder,
        Certificate(
            id=service.next_id(),
            title="SACT course",
            issuer="UKONS",
            awarded_on=date(2026, 2, 11),
        ),
    )
    records.add_reflection(
        store,
        PASSPORT_ID,
        holder,
        Reflection(title="Airway", written_on=date(2026, 3, 14)),
        "Something private about a hard day.",
    )
    return store


def _names(data: bytes) -> list[str]:
    """What is in the zip."""
    with zipfile.ZipFile(BytesIO(data)) as archive:
        return archive.namelist()


def _read(data: bytes, name: str) -> bytes:
    """One file out of the zip."""
    with zipfile.ZipFile(BytesIO(data)) as archive:
        return archive.read(name)


class TestTheBundleIsComplete:
    def test_it_holds_the_five_things_a_holder_needs(
        self, populated: LocalPassportStore
    ) -> None:
        names = _names(export.build_bundle(populated, PASSPORT_ID))

        assert "README.md" in names
        assert "VERIFY.md" in names
        assert "passport.md" in names
        assert "passport.pdf" in names
        assert "passport.bundle" in names

    def test_the_canonical_files_are_copied_in(
        self, populated: LocalPassportStore
    ) -> None:
        names = _names(export.build_bundle(populated, PASSPORT_ID))

        assert "passport/manifest.yaml" in names
        assert "passport/profile.yaml" in names
        assert "passport/competencies.yaml" in names

    def test_nested_records_are_copied_in(
        self, populated: LocalPassportStore
    ) -> None:
        """The walk has to reach sign-offs, logbook entries and the rest."""
        names = _names(export.build_bundle(populated, PASSPORT_ID))

        assert any(n.startswith("passport/sign-offs/") for n in names)
        assert any(n.startswith("passport/logbook/") for n in names)
        assert any(n.startswith("passport/certificates/") for n in names)
        assert any(n.startswith("passport/reflections/") for n in names)

    def test_the_record_is_copied_byte_for_byte(
        self, populated: LocalPassportStore
    ) -> None:
        """Not re-serialised from the models.

        A round trip through Pydantic could quietly normalise something,
        and then the export would be a rendering of the record rather
        than a copy of it.
        """
        from app.features.passport import paths

        bundle = export.build_bundle(populated, PASSPORT_ID)
        original = populated.read(PASSPORT_ID, paths.PROFILE)

        assert _read(bundle, "passport/profile.yaml") == original


class TestTheHistoryTravels:
    def test_the_git_bundle_is_a_real_one(
        self, populated: LocalPassportStore
    ) -> None:
        """The only file carrying who changed what and when."""
        data = _read(
            export.build_bundle(populated, PASSPORT_ID), "passport.bundle"
        )

        assert data.startswith(b"# v2 git bundle")

    def test_it_can_be_cloned_back(
        self, populated: LocalPassportStore, tmp_path: Path
    ) -> None:
        """The claim the README makes, tested rather than asserted.

        A bundle that cannot be cloned would leave a holder believing
        they had their history when they had a broken file.
        """
        import subprocess

        bundle_path = tmp_path / "out.bundle"
        bundle_path.write_bytes(
            _read(
                export.build_bundle(populated, PASSPORT_ID),
                "passport.bundle",
            )
        )

        result = subprocess.run(
            ["git", "clone", str(bundle_path), str(tmp_path / "restored")],
            capture_output=True,
            check=False,
        )

        assert result.returncode == 0, result.stderr.decode()
        assert (tmp_path / "restored" / "profile.yaml").is_file()


class TestTheReadmeStandsAlone:
    def test_it_says_which_files_are_authoritative(
        self, populated: LocalPassportStore
    ) -> None:
        """Somebody unpacking this in ten years reaches for the PDF."""
        readme = _read(
            export.build_bundle(populated, PASSPORT_ID), "README.md"
        ).decode()

        assert "these files are right" in readme
        assert "passport.bundle" in readme

    def test_it_states_what_the_record_does_not_claim(
        self, populated: LocalPassportStore
    ) -> None:
        """A fingerprint on official-looking paper invites over-confidence."""
        readme = _read(
            export.build_bundle(populated, PASSPORT_ID), "README.md"
        ).decode()

        assert "not signatures" in readme
        assert "verified" in readme

    def test_it_explains_why_reflections_are_not_in_the_pdf(
        self, populated: LocalPassportStore
    ) -> None:
        readme = _read(
            export.build_bundle(populated, PASSPORT_ID), "README.md"
        ).decode()

        assert "legal proceedings" in readme


class TestReflectionsAreInTheRecordButNotThePdf:
    def test_the_writing_is_in_the_canonical_files(
        self, populated: LocalPassportStore
    ) -> None:
        """They are the holder's own, so their copy has them."""
        bundle = export.build_bundle(populated, PASSPORT_ID)
        names = _names(bundle)
        reflection = next(
            n for n in names if n.startswith("passport/reflections/")
        )

        assert b"Something private" in _read(bundle, reflection)

    def test_the_writing_is_not_in_the_pdf(
        self, populated: LocalPassportStore
    ) -> None:
        bundle = export.build_bundle(populated, PASSPORT_ID)

        assert b"Something private" not in _read(bundle, "passport.pdf")


class TestNothingDeniesTheExport:
    def test_a_broken_rendering_still_yields_the_record(
        self,
        populated: LocalPassportStore,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """The record is already written by the time views are attempted.

        A holder with the files and no PDF is far better off than one
        with nothing.
        """

        def explode(*args: object, **kwargs: object) -> bytes:
            raise RuntimeError("reportlab fell over")

        monkeypatch.setattr(export.pdf, "render_pdf", explode)

        names = _names(export.build_bundle(populated, PASSPORT_ID))

        assert "passport.pdf" not in names
        assert "passport/profile.yaml" in names
        assert "passport.bundle" in names

    def test_an_unknown_passport_raises(
        self, store: LocalPassportStore
    ) -> None:
        """The one failure the export does raise."""
        with pytest.raises(PassportNotFoundError):
            export.build_bundle(store, "a1b2c3d4e5f60718293a4b5c6d7e8f90")

    def test_an_empty_passport_still_exports(
        self, store: LocalPassportStore
    ) -> None:
        """Somebody who created one this morning can still take it away."""
        names = _names(export.build_bundle(store, PASSPORT_ID))

        assert "README.md" in names
        assert "passport/manifest.yaml" in names
