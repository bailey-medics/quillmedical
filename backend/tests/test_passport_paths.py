"""Tests for app/features/passport/paths.py.

The layout is described in one module, so it is tested in one place. No
filesystem here: these functions return relative paths and touch nothing,
which is the property that makes them safe to call before deciding
whether to write.

The refusals matter more than the happy paths. Every one of these
functions takes a component that may have come out of a YAML file
somebody hand-edited, so a name that escapes the repository has to be
impossible rather than unlikely.
"""

from __future__ import annotations

import pytest

from app.features.passport import paths
from app.features.passport.paths import PassportPathError


class TestShard:
    """Sharding is derived from the id, never recorded."""

    def test_first_four_characters_become_two_levels(self) -> None:
        assert str(paths.shard("3f2a8c1e4b7d49f0a6c2e8b1d5a7f309")) == (
            "3f/2a/3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
        )

    @pytest.mark.parametrize(
        "bad",
        [
            "3F2A8C1E4B7D49F0A6C2E8B1D5A7F309",  # upper case
            "3f2a8c1e4b7d49f0a6c2e8b1d5a7f30",  # 31 characters
            "3f2a8c1e-4b7d-49f0-a6c2-e8b1d5a7f309",  # hyphenated
            "../../etc/passwd",
            "",
        ],
    )
    def test_refuses_anything_but_32_hex(self, bad: str) -> None:
        with pytest.raises(PassportPathError):
            paths.shard(bad)


class TestBlob:
    """The hash is the only pointer, so it must resolve one way."""

    def test_digest_becomes_a_fanned_out_path(self) -> None:
        digest = "ab12cd34" * 8
        assert str(paths.blob(digest)) == (f"files/sha256/ab/12/{digest}")

    def test_the_sha256_prefix_is_optional(self) -> None:
        digest = "ab12cd34" * 8
        assert paths.blob(digest) == paths.blob(f"sha256:{digest}")

    def test_refuses_another_algorithm(self) -> None:
        """A record naming a hash the store cannot resolve is worse than
        one that fails to write."""
        with pytest.raises(PassportPathError, match="expected 64"):
            paths.blob("md5:" + "ab" * 16)

    def test_refuses_a_short_digest(self) -> None:
        with pytest.raises(PassportPathError):
            paths.blob("abc123")


class TestCompetencyGroupedPaths:
    """Where a directory is a competency, it is named by the id."""

    def test_logbook_groups_by_competency_id_verbatim(self) -> None:
        assert str(paths.logbook_dir("perform_bronchoscopy")) == (
            "logbook/perform_bronchoscopy"
        )

    def test_logbook_entry_carries_the_write_time_stem(self) -> None:
        assert (
            str(
                paths.logbook_entry(
                    "perform_bronchoscopy", "2026-03-14-143207"
                )
            )
            == "logbook/perform_bronchoscopy/2026-03-14-143207.yaml"
        )

    def test_refuses_a_path_shaped_competency_id(self) -> None:
        """Hierarchy lives in the definition, never in the identifier."""
        with pytest.raises(PassportPathError):
            paths.logbook_dir("prescribing/chemotherapy")

    @pytest.mark.parametrize(
        "bad",
        ["Perform_Bronchoscopy", "perform bronchoscopy", "..", ".hidden", ""],
    )
    def test_refuses_a_malformed_competency_id(self, bad: str) -> None:
        with pytest.raises(PassportPathError):
            paths.logbook_dir(bad)

    @pytest.mark.parametrize(
        "bad",
        [
            "2026-03-14-14:32:07",  # colons, which Windows rejects
            "2026-03-14",  # no time
            "../../../etc/passwd",
            "",
        ],
    )
    def test_refuses_a_malformed_entry_filename(self, bad: str) -> None:
        with pytest.raises(PassportPathError):
            paths.logbook_entry("perform_bronchoscopy", bad)


class TestHumanNamedPaths:
    """Where a directory is a label, the id lives inside the file."""

    def test_sign_off_directory_reads_as_a_chronology(self) -> None:
        assert str(paths.sign_off_dir("2026-03-14-perform-bronchoscopy")) == (
            "sign-offs/2026-03-14-perform-bronchoscopy"
        )

    def test_sign_off_file_is_the_record(self) -> None:
        assert (
            str(paths.sign_off_file("2026-03-14-perform-bronchoscopy"))
            == "sign-offs/2026-03-14-perform-bronchoscopy/sign-off.yaml"
        )

    def test_narratives_sit_beside_the_record(self) -> None:
        name = "2026-03-14-perform-bronchoscopy"
        assert paths.sign_off_reflection(name).name == "reflection.md"
        assert paths.sign_off_assessment(name).name == "assessment.md"

    def test_a_same_day_clash_is_suffixed(self) -> None:
        assert str(
            paths.sign_off_dir("2026-03-14-perform-bronchoscopy-2")
        ).endswith("-2")

    def test_certificates_stay_flat(self) -> None:
        """One course legitimately supports several competencies."""
        assert (
            str(paths.certificate_file("2025-11-04-bronchoscopy-course"))
            == "certificates/2025-11-04-bronchoscopy-course/certificate.yaml"
        )

    def test_reflection_holds_its_prose(self) -> None:
        assert (
            str(paths.reflection_file("2026-03-14-difficult-airway"))
            == "reflections/2026-03-14-difficult-airway/reflection.md"
        )

    @pytest.mark.parametrize(
        "bad",
        [
            "perform-bronchoscopy",  # no date
            "2026-3-14-thing",  # unpadded
            "../../escape",
            ".git",
            "",
        ],
    )
    def test_refuses_a_name_this_layout_would_not_generate(
        self, bad: str
    ) -> None:
        with pytest.raises(PassportPathError):
            paths.sign_off_dir(bad)


class TestCpd:
    """Grouped by year, because appraisal asks what you did this year."""

    def test_year_is_the_directory(self) -> None:
        assert str(paths.cpd_dir(2026)) == "cpd/2026"

    def test_entry_sits_under_its_year(self) -> None:
        assert str(paths.cpd_entry(2026, "2026-02-11-171930")) == (
            "cpd/2026/2026-02-11-171930.yaml"
        )

    @pytest.mark.parametrize("bad", [12, 0, -2026, 99999])
    def test_refuses_a_year_that_is_not_four_digits(self, bad: int) -> None:
        """A directory named "12" would sort oddly forever."""
        with pytest.raises(PassportPathError, match="four digits"):
            paths.cpd_dir(bad)


def test_gitignore_keeps_evidence_out_of_git() -> None:
    """Blobs are content-addressed beside the repository, not committed.

    The trailing slash is deliberate: without it the pattern would also
    match a *file* called ``files`` that something else created.
    """
    assert paths.GITIGNORE_CONTENT == "files/\n"


def test_every_path_is_relative() -> None:
    """Nothing here may return an absolute path.

    The store resolves these against a real directory, so an absolute
    path would write outside the passport it belongs to.
    """
    candidates = [
        paths.MANIFEST,
        paths.PROFILE,
        paths.INDEX,
        paths.README,
        paths.GITIGNORE,
        paths.sign_off_file("2026-03-14-a-thing"),
        paths.certificate_file("2026-03-14-a-thing"),
        paths.logbook_entry("perform_cannulation", "2026-03-14-143207"),
        paths.reflection_file("2026-03-14-a-thing"),
        paths.cpd_entry(2026, "2026-03-14-143207"),
        paths.blob("ab12cd34" * 8),
        paths.shard("3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"),
    ]

    for path in candidates:
        assert not path.is_absolute(), f"{path} is absolute"
        assert ".." not in path.parts, f"{path} escapes upwards"
