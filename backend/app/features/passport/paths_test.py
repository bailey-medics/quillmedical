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


class TestFrameworkFirstPaths:
    """A sign-off and a logbook live under their framework and competency."""

    def test_logbook_sits_in_the_competency_folder(self) -> None:
        assert str(
            paths.logbook_dir("quill_2_test", "quill_2_test_insert_a_cannula")
        ) == ("frameworks/quill_2_test/quill_2_test_insert_a_cannula/logbook")

    def test_logbook_entry_carries_the_write_time_stem(self) -> None:
        assert (
            str(
                paths.logbook_entry(
                    "quill_2_test",
                    "quill_2_test_insert_a_cannula",
                    "2026-03-14-143207",
                )
            )
            == "frameworks/quill_2_test/quill_2_test_insert_a_cannula/logbook/"
            "2026-03-14-143207.yaml"
        )

    def test_a_sign_off_sits_beside_its_logbook(self) -> None:
        sign_off = "quill_test_give_a_course.2026-04-02-lung"

        assert str(paths.sign_off_file("quill_test", sign_off)) == (
            "frameworks/quill_test/quill_test_give_a_course/"
            "sign-offs/2026-04-02-lung/sign-off.yaml"
        )

    def test_narratives_sit_beside_the_record(self) -> None:
        sign_off = "quill_2_test_insert_a_cannula.2026-03-14"

        assert (
            paths.sign_off_reflection("quill_2_test", sign_off).name
            == "reflection.md"
        )
        assert (
            paths.sign_off_assessment("quill_2_test", sign_off).name
            == "assessment.md"
        )

    def test_a_sign_off_id_splits_back_apart(self) -> None:
        sign_off = paths.sign_off_id(
            "quill_2_test_insert_a_cannula", "2026-03-14-2"
        )

        assert sign_off == "quill_2_test_insert_a_cannula.2026-03-14-2"
        assert paths.split_sign_off_id(sign_off) == (
            "quill_2_test_insert_a_cannula",
            "2026-03-14-2",
        )

    def test_refuses_a_path_shaped_competency_id(self) -> None:
        """Hierarchy lives in the definition, never in the identifier."""
        with pytest.raises(PassportPathError):
            paths.logbook_dir("quill_2_test", "prescribing/chemotherapy")

    @pytest.mark.parametrize(
        "bad",
        ["Perform_Bronchoscopy", "perform bronchoscopy", "..", ".hidden", ""],
    )
    def test_refuses_a_malformed_competency_id(self, bad: str) -> None:
        with pytest.raises(PassportPathError):
            paths.logbook_dir("quill_2_test", bad)

    @pytest.mark.parametrize("bad", ["../x", "Clinical", ""])
    def test_refuses_a_malformed_framework_id(self, bad: str) -> None:
        with pytest.raises(PassportPathError):
            paths.framework_dir(bad)

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
            paths.logbook_entry("quill_2_test", "quill_2_test_x", bad)

    @pytest.mark.parametrize(
        "bad",
        [
            "quill_2_test_x",  # no folder
            "quill_2_test_x.thing",  # no date
            "quill_2_test_x.2026-3-14",  # unpadded
            "quill_2_test_x.../escape",
            "Clinical.2026-03-14",
            ".2026-03-14",
            "",
        ],
    )
    def test_refuses_a_sign_off_id_this_layout_would_not_make(
        self, bad: str
    ) -> None:
        with pytest.raises(PassportPathError):
            paths.sign_off_dir("quill_2_test", bad)


class TestRecordsNotUnderAFramework:
    """Certificates, reflections and CPD are tied to no one competency."""

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
        "bad", ["bronchoscopy-course", "2026-3-14-thing", "../x", ""]
    )
    def test_refuses_a_name_this_layout_would_not_generate(
        self, bad: str
    ) -> None:
        with pytest.raises(PassportPathError):
            paths.certificate_dir(bad)


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
        paths.sign_off_file("quill_2_test", "quill_2_test_thing.2026-03-14"),
        paths.certificate_file("2026-03-14-a-thing"),
        paths.logbook_entry(
            "quill_2_test",
            "quill_2_test_insert_a_cannula",
            "2026-03-14-143207",
        ),
        paths.reflection_file("2026-03-14-a-thing"),
        paths.cpd_entry(2026, "2026-03-14-143207"),
        paths.blob("ab12cd34" * 8),
        paths.shard("3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"),
    ]

    for path in candidates:
        assert not path.is_absolute(), f"{path} is absolute"
        assert ".." not in path.parts, f"{path} escapes upwards"
