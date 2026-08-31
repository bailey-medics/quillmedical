"""Certificate block validation, shared by the merge gate and sync.

These cover the gaps that motivated the consolidation. Before the checks
were driven off ``CertificateStyle``:

* ``exam_ref`` and ``margin`` were not validated at all;
* unknown keys were ignored, so a misspelled ``colour`` silently did
  nothing;
* the certificate block was only ever checked at sync — after merge, after
  publish — so a malformed one reached GCS and failed quietly.

The last point is covered by ``TestMergeGate``, which drives the same
directory-level validator the content repos' CI runs.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.features.teaching.tooling.validate import (
    CERTIFICATE_BACKGROUND,
    certificate_enabled,
    validate_certificate_config,
    validate_modules_dir,
)

#: A variable question the merged validator accepts. The per-item checks
#: require question_type, mapping options and correct_option_id.
_VALID_VARIABLE_QUESTION: dict[str, object] = {
    "question_type": "single",
    "options": [
        {"id": "a", "label": "A", "tags": ["correct"]},
        {"id": "b", "label": "B", "tags": ["incorrect"]},
    ],
    "correct_option_id": "a",
    "images": [],
}


def _style(**overrides: object) -> dict[str, object]:
    """A minimal certificate block that validates cleanly."""
    field = {"font": "Helvetica", "size": 14, "colour": "#404040", "y": 0.5}
    block: dict[str, object] = {
        "orientation": "portrait",
        "title": dict(field),
        "subtitle": dict(field),
        "candidate_name": dict(field),
        "pass_summary": dict(field),
        "date": dict(field),
    }
    block.update(overrides)
    return block


class TestValidBlocks:
    def test_minimal_block_passes(self) -> None:
        assert validate_certificate_config(_style()) == []

    def test_optional_fields_may_be_present(self) -> None:
        block = _style(exam_ref={"size": 11, "colour": "#888888", "y": 0.3})
        assert validate_certificate_config(block) == []

    def test_margin_may_be_present(self) -> None:
        assert validate_certificate_config(_style(margin=30)) == []


class TestRequiredFieldsStillEnforced:
    """The model has defaults, but presence is required separately."""

    @pytest.mark.parametrize(
        "missing",
        ["title", "subtitle", "candidate_name", "pass_summary", "date"],
    )
    def test_missing_text_field_is_reported(self, missing: str) -> None:
        block = _style()
        del block[missing]
        errors = validate_certificate_config(block)
        assert any(f"missing '{missing}'" in e for e in errors)

    def test_non_mapping_section_is_reported(self) -> None:
        errors = validate_certificate_config("not a mapping")
        assert errors == ["'certificate' section must be a mapping"]


class TestGapsNowClosed:
    """Each of these passed validation before the schema drove it."""

    def test_exam_ref_is_now_validated(self) -> None:
        block = _style(exam_ref={"size": 999, "colour": "#888888"})
        errors = validate_certificate_config(block)
        assert any("exam_ref" in e for e in errors)

    def test_margin_is_now_validated(self) -> None:
        errors = validate_certificate_config(_style(margin=5000))
        assert any("margin" in e for e in errors)

    def test_mistyped_colour_key_is_now_rejected(self) -> None:
        block = _style()
        block["title"] = {"colours": "#FF0000"}
        errors = validate_certificate_config(block)
        assert any("colours" in e for e in errors)

    def test_unknown_top_level_key_is_now_rejected(self) -> None:
        errors = validate_certificate_config(_style(logo="logo.png"))
        assert any("logo" in e for e in errors)

    def test_boolean_margin_is_rejected(self) -> None:
        """``margin: yes`` used to read as 1 — bool subclasses int."""
        errors = validate_certificate_config(_style(margin=True))
        assert any("margin" in e for e in errors)


class TestMessagesAreActionable:
    def test_colour_error_stays_human_readable(self) -> None:
        """Pydantic's raw pattern message is useless to a content author."""
        block = _style()
        block["title"] = {"colour": "FF0000"}
        errors = validate_certificate_config(block)
        assert any("hex colour" in e for e in errors)
        assert not any("should match pattern" in e for e in errors)

    def test_errors_name_the_offending_field(self) -> None:
        block = _style()
        block["date"] = {"size": 500}
        errors = validate_certificate_config(block)
        assert any("certificate.date.size" in e for e in errors)


class TestCertificateEnabled:
    def test_absent_results_section_means_disabled(self) -> None:
        assert certificate_enabled({}) is False

    def test_flag_off_means_disabled(self) -> None:
        assert (
            certificate_enabled({"results": {"certificate_download": False}})
            is False
        )

    def test_flag_on_means_enabled(self) -> None:
        assert (
            certificate_enabled({"results": {"certificate_download": True}})
            is True
        )

    def test_non_mapping_results_is_treated_as_disabled(self) -> None:
        assert certificate_enabled({"results": "nonsense"}) is False


class TestMergeGate:
    """The whole point: this now fails a pull request, not just sync."""

    def _bank(
        self, tmp_path: Path, cert: dict[str, object], *, background: bool
    ) -> Path:
        modules = tmp_path / "modules"
        assessment = modules / "my-bank" / "assessment"
        (assessment / "question_001").mkdir(parents=True)

        (modules / "my-bank" / "module.yaml").write_text(
            yaml.dump(
                {
                    "moduleId": "my-bank",
                    "title": "My bank",
                    "order": 1,
                    "status": "live",
                }
            )
        )
        (assessment / "assessment.yaml").write_text(
            yaml.dump(
                {
                    "version": 1,
                    "title": "My bank",
                    "description": "A bank",
                    "assessment": {
                        "items_per_attempt": 1,
                        "time_limit_minutes": 10,
                        "min_pool_size": 1,
                    },
                    "type": "variable",
                    "results": {"certificate_download": True},
                    "certificate": cert,
                }
            )
        )
        (assessment / "question_001" / "question.yaml").write_text(
            yaml.dump(_VALID_VARIABLE_QUESTION)
        )
        if background:
            (assessment / CERTIFICATE_BACKGROUND).write_bytes(b"fake-png")
        return modules

    def test_valid_certificate_passes_the_gate(self, tmp_path: Path) -> None:
        modules = self._bank(tmp_path, _style(), background=True)
        assert validate_modules_dir(modules).is_valid

    def test_malformed_certificate_fails_the_gate(
        self, tmp_path: Path
    ) -> None:
        """This is the case that used to reach GCS and fail silently."""
        bad = _style()
        bad["title"] = {"font": "NotAFont", "size": 14, "y": 0.5}
        modules = self._bank(tmp_path, bad, background=True)

        result = validate_modules_dir(modules)
        assert not result.is_valid
        assert any("title" in e.message for e in result.errors)

    def test_missing_background_fails_the_gate(self, tmp_path: Path) -> None:
        modules = self._bank(tmp_path, _style(), background=False)

        result = validate_modules_dir(modules)
        assert not result.is_valid
        assert any(CERTIFICATE_BACKGROUND in e.message for e in result.errors)

    def test_disabled_certificate_is_not_checked(self, tmp_path: Path) -> None:
        """No background and a broken block, but the flag is off."""
        modules = tmp_path / "modules"
        assessment = modules / "my-bank" / "assessment"
        (assessment / "question_001").mkdir(parents=True)
        (modules / "my-bank" / "module.yaml").write_text(
            yaml.dump(
                {
                    "moduleId": "my-bank",
                    "title": "My bank",
                    "order": 1,
                    "status": "live",
                }
            )
        )
        (assessment / "assessment.yaml").write_text(
            yaml.dump(
                {
                    "version": 1,
                    "title": "My bank",
                    "description": "A bank",
                    "assessment": {
                        "items_per_attempt": 1,
                        "time_limit_minutes": 10,
                        "min_pool_size": 1,
                    },
                    "type": "variable",
                    "certificate": {"title": {"font": "NotAFont"}},
                }
            )
        )
        (assessment / "question_001" / "question.yaml").write_text(
            yaml.dump(_VALID_VARIABLE_QUESTION)
        )

        assert validate_modules_dir(modules).is_valid
