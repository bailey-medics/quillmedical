"""The bucket has the repository's shape.

A module used to be split across three prefixes on the way in, with
``assessment/`` renamed to ``questions/``. Reading it back meant
reassembling those pieces, which is code the Phase 7 sweep would have had to
carry as well. The deploy now mirrors each module whole to
``modules/<bank_id>/``, so a bucket path is a repository path.
"""

from __future__ import annotations

from pathlib import Path

from app.features.teaching.storage import (
    LocalStorageBackend,
    assessment_prefix,
    learning_prefix,
    module_prefix,
)

_STORAGE = Path(__file__).parent.parent / "app" / "features" / "teaching"


class TestThePrefixesMirrorTheRepository:
    def test_a_module_lives_under_modules(self) -> None:
        assert module_prefix("my-bank") == "modules/my-bank/"

    def test_the_assessment_keeps_its_repository_name(self) -> None:
        """It was questions/<bank_id>/; the rename is what forced the
        reconstruction on the way back out."""
        assert assessment_prefix("my-bank") == "modules/my-bank/assessment/"

    def test_learning_sits_beside_it(self) -> None:
        assert learning_prefix("my-bank") == "modules/my-bank/learning/"

    def test_both_sections_are_under_the_one_module(self) -> None:
        """The property the sweep depends on: one prefix per module, so a
        module downloads without knowing which sections it has."""
        for prefix in (assessment_prefix("b"), learning_prefix("b")):
            assert prefix.startswith(module_prefix("b"))


class TestNothingStillBuildsTheOldLayout:
    def test_no_legacy_prefixes_remain_in_storage(self) -> None:
        """A missed call site would read from a prefix the deploy no longer
        writes, and fail only in production against a real bucket."""
        source = (_STORAGE / "storage.py").read_text()

        assert '"questions/' not in source
        assert 'f"learning/' not in source

    def test_the_certificate_background_moved_too(self) -> None:
        source = (_STORAGE / "certificate.py").read_text()

        assert '"questions/' not in source
        assert "assessment_prefix" in source


class TestTheDevRouteMatchesTheUrlsItServes:
    def test_local_urls_use_the_module_layout(self) -> None:
        backend = LocalStorageBackend("/api/teaching/images")

        url = backend.get_image_url("my-bank", "question_001", "wli.png")

        assert url == (
            "/api/teaching/images/modules/my-bank/assessment"
            "/question_001/wli.png"
        )

    def test_the_route_registered_for_it_has_the_same_shape(self) -> None:
        """These are declared in different files and only agree by hand, so
        a mismatch would 404 every image in local development."""
        main = (_STORAGE.parent.parent / "main.py").read_text()

        assert '"/api/teaching/images/modules/{bank_id}"' in main
        assert '"/assessment/{item_folder}/{filename}"' in main
