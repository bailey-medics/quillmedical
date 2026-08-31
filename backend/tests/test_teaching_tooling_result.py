"""The validation result type shared by both gates.

First unit of collapsing the two validators into one. The sync and CI
validators each had their own result class: sync's carried warnings,
``item_count``, a ``bank_id``/``version`` header and a ``to_dict()`` the
API and ``QuestionBankSync`` rows depend on; CI's had errors only. This is
the merged shape, and these tests pin the behaviour each side relied on.
"""

from __future__ import annotations

from app.features.teaching.tooling.validate import (
    ValidationError,
    ValidationMessage,
    ValidationResult,
)


class TestIsValid:
    """``is_valid`` is derived, not stored."""

    def test_a_fresh_result_is_valid(self) -> None:
        assert ValidationResult().is_valid

    def test_an_error_invalidates(self) -> None:
        result = ValidationResult()
        result.add_error("a/path", "something wrong")
        assert not result.is_valid

    def test_a_warning_does_not_invalidate(self) -> None:
        """Warnings inform; only errors block a sync."""
        result = ValidationResult()
        result.add_warning("a/path", "worth knowing")
        assert result.is_valid
        assert len(result.warnings) == 1

    def test_it_cannot_drift_from_the_error_list(self) -> None:
        """The old shape stored a flag that had to be kept in step."""
        result = ValidationResult()
        result.add_error("a/path", "boom")
        result.errors.clear()
        assert result.is_valid


class TestSyncPayloadShape:
    """``to_dict`` feeds the sync API and QuestionBankSync rows."""

    def test_message_serialises_to_path_and_message(self) -> None:
        message = ValidationMessage(path="bank/config.yaml", message="bad")
        assert message.to_dict() == {
            "path": "bank/config.yaml",
            "message": "bad",
        }

    def test_errors_and_warnings_both_serialise(self) -> None:
        result = ValidationResult()
        result.add_error("p1", "e1")
        result.add_warning("p2", "w1")
        assert [e.to_dict() for e in result.errors] == [
            {"path": "p1", "message": "e1"}
        ]
        assert [w.to_dict() for w in result.warnings] == [
            {"path": "p2", "message": "w1"}
        ]

    def test_the_old_name_still_resolves(self) -> None:
        """``ValidationError`` was the CI-side name for the same shape."""
        assert ValidationError is ValidationMessage


class TestBankSummary:
    """The sync style, used when a result describes one question bank."""

    def _bank_result(self) -> ValidationResult:
        return ValidationResult(bank_id="test-bank", version=3, item_count=7)

    def test_names_the_bank_and_version(self) -> None:
        summary = self._bank_result().summary()
        assert "test-bank" in summary
        assert "v3" in summary

    def test_reports_the_item_count(self) -> None:
        assert "7 items found" in self._bank_result().summary()

    def test_says_valid_when_clean(self) -> None:
        assert "VALID" in self._bank_result().summary()

    def test_says_sync_blocked_when_not(self) -> None:
        result = self._bank_result()
        result.add_error("p", "e")
        summary = result.summary()
        assert "INVALID" in summary
        assert "sync blocked" in summary

    def test_counts_errors_and_warnings(self) -> None:
        result = self._bank_result()
        result.add_error("p", "e")
        result.add_warning("p", "w")
        summary = result.summary()
        assert "1 error(s)" in summary
        assert "1 warning(s)" in summary


class TestModulesSummary:
    """The CI style, used when a result describes a modules/ tree."""

    def test_reports_modules_checked(self) -> None:
        result = ValidationResult(modules_checked=4)
        assert "Checked 4 module(s)." in result.summary()

    def test_says_all_valid_when_clean(self) -> None:
        assert "All valid." in ValidationResult(modules_checked=1).summary()

    def test_lists_each_error(self) -> None:
        result = ValidationResult(modules_checked=1)
        result.add_error("bank/module.yaml", "module.yaml is missing")
        summary = result.summary()
        assert "1 error(s) found:" in summary
        assert "bank/module.yaml" in summary
        assert "module.yaml is missing" in summary

    def test_bank_id_selects_the_other_style(self) -> None:
        """The two styles are chosen by whether a bank is named."""
        assert "Checked" in ValidationResult().summary()
        assert "Checked" not in ValidationResult(bank_id="b").summary()
