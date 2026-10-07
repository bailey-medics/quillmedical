"""Tests for app/cbac/competencies.py.

Covers:
- The real shared/competency-definitions/ directory validates against
  CompetencyEntry with no errors
- Every file in the directory is merged into one catalogue, and ids are
  unique across the whole directory rather than within a file
- get_competency_details / is_valid_competency lookups
- CompetencyEntry rejects malformed data (extra fields, missing fields)
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.cbac.competencies import (
    ASSESSABLE_COMPETENCY_IDS,
    COMPETENCIES,
    COMPETENCY_DEFINITIONS_DIR,
    COMPETENCY_IDS,
    FRAMEWORK_IDS,
    PASSPORT_ONLY_COMPETENCY_IDS,
    RETIRED_COMPETENCY_IDS,
    CompetencyEntry,
    _load_catalogue,
    _load_competencies,
    framework_competencies,
    get_competency_details,
    is_valid_competency,
    validate_competency_ids,
)


def test_all_real_competencies_loaded() -> None:
    assert len(COMPETENCIES) > 0
    assert len(COMPETENCIES) == len(COMPETENCY_IDS)
    assert "prescribe_non_controlled" in COMPETENCY_IDS
    assert "access_patient_records" in COMPETENCY_IDS


def test_every_definition_file_is_merged() -> None:
    """Ids from both kinds of definition file reach one catalogue.

    The split is for the reader; the code sees one flat catalogue. A
    clinical id and a feature-admin id are both present, so a file that
    stopped being read would fail here rather than silently shrinking
    what anyone may do.
    """
    assert "certify_death" in COMPETENCY_IDS  # clinical.yaml
    assert "manage_teaching" in COMPETENCY_IDS  # teaching.yaml


def test_real_directory_holds_more_than_one_file() -> None:
    """Guards the merge itself, not just the loader's ability to merge."""
    files = sorted(COMPETENCY_DEFINITIONS_DIR.glob("*.yaml"))
    assert len(files) > 1, (
        "Expected the catalogue to be split across files; found "
        f"{[f.name for f in files]}"
    )


def test_ids_are_unique_across_the_whole_directory() -> None:
    assert len(set(COMPETENCY_IDS)) == len(COMPETENCY_IDS)


def test_load_merges_files_in_filename_order(tmp_path: Path) -> None:
    (tmp_path / "b_second.yaml").write_text(
        'competencies:\n  - id: second\n    display_name: "Second"\n'
    )
    (tmp_path / "a_first.yaml").write_text(
        'competencies:\n  - id: first\n    display_name: "First"\n'
    )

    loaded = _load_competencies(tmp_path)

    # Sorted by filename, so the merged order is the same everywhere
    # rather than whatever order the filesystem happens to return.
    assert [c.id for c in loaded] == ["first", "second"]


def test_load_rejects_an_id_defined_in_two_files(tmp_path: Path) -> None:
    """A duplicate id must fail loudly, naming both files.

    Ids are referenced from stored records, so if one were defined twice
    which definition applied would depend on filename order.
    """
    (tmp_path / "clinical.yaml").write_text(
        'competencies:\n  - id: shared_id\n    display_name: "One"\n'
    )
    (tmp_path / "feature-admin.yaml").write_text(
        'competencies:\n  - id: shared_id\n    display_name: "Two"\n'
    )

    with pytest.raises(ValueError, match="Duplicate competency id"):
        _load_competencies(tmp_path)


def test_levels_are_optional(tmp_path: Path) -> None:
    """A competency without levels is signed off or it is not.

    Most are: cannulation has no honest middle state. Levels must stay
    optional or every existing entry would need an invented scale.
    """
    (tmp_path / "clinical.yaml").write_text(
        'competencies:\n  - id: plain\n    display_name: "Plain"\n'
    )

    loaded = _load_competencies(tmp_path)

    assert loaded[0].levels is None
    assert loaded[0].expires_after_months is None


def test_levels_keep_their_declared_order(tmp_path: Path) -> None:
    """Order is the scale, so it must survive loading unsorted."""
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: scaled\n"
        '    display_name: "Scaled"\n'
        "    levels:\n"
        '      - id: observe_only\n        name: "Observe only"\n'
        '      - id: supervised\n        name: "With supervision"\n'
        '      - id: unsupervised\n        name: "Unsupervised"\n'
    )

    loaded = _load_competencies(tmp_path)

    assert loaded[0].levels is not None
    assert [lvl.id for lvl in loaded[0].levels] == [
        "observe_only",
        "supervised",
        "unsupervised",
    ]


def test_load_rejects_duplicate_level_ids(tmp_path: Path) -> None:
    """A sign-off stores the level id, so two the same is ambiguous."""
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: scaled\n"
        '    display_name: "Scaled"\n'
        "    levels:\n"
        '      - id: supervised\n        name: "One"\n'
        '      - id: supervised\n        name: "Two"\n'
    )

    with pytest.raises(ValueError, match="duplicate level ids"):
        _load_competencies(tmp_path)


def test_load_rejects_an_empty_level_list(tmp_path: Path) -> None:
    """Omitting levels and declaring none must not be different things."""
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: scaled\n"
        '    display_name: "Scaled"\n'
        "    levels: []\n"
    )

    with pytest.raises(ValueError, match="empty level list"):
        _load_competencies(tmp_path)


def test_scopes_are_optional(tmp_path: Path) -> None:
    """Most competencies are assessed as a whole."""
    (tmp_path / "clinical.yaml").write_text(
        'competencies:\n  - id: plain\n    display_name: "Plain"\n'
    )

    assert _load_competencies(tmp_path)[0].scopes is None


def test_scopes_keep_their_declared_order(tmp_path: Path) -> None:
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: scoped\n"
        '    display_name: "Scoped"\n'
        "    scopes:\n"
        '      - id: lung\n        name: "Lung"\n'
        '      - id: breast\n        name: "Breast"\n'
        '      - id: other\n        name: "Other"\n'
    )

    loaded = _load_competencies(tmp_path)

    assert loaded[0].scopes is not None
    assert [scope.id for scope in loaded[0].scopes] == [
        "lung",
        "breast",
        "other",
    ]


def test_load_rejects_duplicate_scope_ids(tmp_path: Path) -> None:
    """A record stores the scope id, so two the same is ambiguous."""
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: scoped\n"
        '    display_name: "Scoped"\n'
        "    scopes:\n"
        '      - id: lung\n        name: "One"\n'
        '      - id: lung\n        name: "Two"\n'
        '      - id: other\n        name: "Other"\n'
    )

    with pytest.raises(ValueError, match="duplicate scope ids"):
        _load_competencies(tmp_path)


def test_load_rejects_an_empty_scope_list(tmp_path: Path) -> None:
    """Omitting scopes and declaring none must not be different things."""
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: scoped\n"
        '    display_name: "Scoped"\n'
        "    scopes: []\n"
    )

    with pytest.raises(ValueError, match="empty scope list"):
        _load_competencies(tmp_path)


def test_load_rejects_scopes_with_no_other(tmp_path: Path) -> None:
    """Without it, somebody whose scope is not listed cannot ask at all."""
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: scoped\n"
        '    display_name: "Scoped"\n'
        "    scopes:\n"
        '      - id: lung\n        name: "Lung"\n'
    )

    with pytest.raises(ValueError, match="no 'other'"):
        _load_competencies(tmp_path)


def test_the_real_catalogue_has_a_scoped_competency() -> None:
    """Guards the field against being quietly dropped, as for levels."""
    scoped = [c for c in COMPETENCIES if c.scopes]

    assert scoped, "Expected at least one competency to declare scopes"
    assert all(
        "other" in [scope.id for scope in c.scopes or []] for c in scoped
    )


# --- Frameworks ---------------------------------------------------------

_FRAMEWORK = (
    "framework:\n"
    "  id: sheet\n"
    '  name: "A sign-off sheet"\n'
    '  publisher: "A trust"\n'
    '  version: "2026"\n'
    "  specialties: [oncology]\n"
)


def test_a_file_with_a_framework_block_is_a_framework(tmp_path: Path) -> None:
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK
        + "competencies:\n"
        + '  - id: sheet_item\n    display_name: "An item"\n'
        + "    assessable: true\n"
    )

    entries, frameworks = _load_catalogue(tmp_path)

    assert [framework.id for framework in frameworks] == ["sheet"]
    assert frameworks[0].publisher == "A trust"
    assert entries[0].framework_id == "sheet"


def test_a_file_with_no_block_is_no_framework(tmp_path: Path) -> None:
    (tmp_path / "admin.yaml").write_text(
        'competencies:\n  - id: plain\n    display_name: "Plain"\n'
    )

    entries, frameworks = _load_catalogue(tmp_path)

    assert frameworks == []
    assert entries[0].framework_id is None


def test_a_framework_is_named_for_its_file(tmp_path: Path) -> None:
    """What makes a file a framework is the block; its id is the name."""
    (tmp_path / "other.yaml").write_text(
        _FRAMEWORK + 'competencies:\n  - id: x\n    display_name: "X"\n'
    )

    with pytest.raises(ValueError, match="its file's name"):
        _load_catalogue(tmp_path)


def test_a_framework_naming_an_unlisted_specialty_is_refused(
    tmp_path: Path,
) -> None:
    """A misspelt one would hide the framework from the filter silently."""
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK.replace("[oncology]", "[not_a_specialty]")
        + 'competencies:\n  - id: x\n    display_name: "X"\n'
    )

    with pytest.raises(ValueError, match="not_a_specialty"):
        _load_catalogue(tmp_path)


def test_an_entry_cannot_name_its_own_framework(tmp_path: Path) -> None:
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK
        + "competencies:\n"
        + '  - id: x\n    display_name: "X"\n    framework_id: elsewhere\n'
    )

    with pytest.raises(ValueError, match="sets framework_id"):
        _load_catalogue(tmp_path)


def test_an_assessable_entry_in_no_framework_is_refused(
    tmp_path: Path,
) -> None:
    """The passport offers only what a framework contains."""
    (tmp_path / "admin.yaml").write_text(
        "competencies:\n"
        '  - id: skill\n    display_name: "A skill"\n    assessable: true\n'
    )

    with pytest.raises(ValueError, match="belongs to no framework"):
        _load_catalogue(tmp_path)


def test_a_retired_assessable_entry_needs_no_framework(
    tmp_path: Path,
) -> None:
    """Retired entries stay readable, wherever they are filed."""
    (tmp_path / "retired.yaml").write_text(
        "competencies:\n"
        '  - id: skill\n    display_name: "A skill"\n'
        "    assessable: true\n    retired_on: 2026-10-07\n"
    )

    assert _load_catalogue(tmp_path)[0][0].retired_on is not None


_PASSPORT_ONLY = _FRAMEWORK + "  passport_only: true\n"


def test_a_passport_only_entry_starts_with_its_frameworks_id(
    tmp_path: Path,
) -> None:
    (tmp_path / "sheet.yaml").write_text(
        _PASSPORT_ONLY
        + "competencies:\n"
        + '  - id: prescribe\n    display_name: "P"\n    assessable: true\n'
    )

    with pytest.raises(ValueError, match="must start with 'sheet_'"):
        _load_catalogue(tmp_path)


def test_a_passport_only_entry_must_be_assessable(tmp_path: Path) -> None:
    (tmp_path / "sheet.yaml").write_text(
        _PASSPORT_ONLY
        + 'competencies:\n  - id: sheet_x\n    display_name: "X"\n'
    )

    with pytest.raises(ValueError, match="is not assessable"):
        _load_catalogue(tmp_path)


def test_a_passport_only_entry_may_be_on_no_may_grant_list(
    tmp_path: Path,
) -> None:
    (tmp_path / "sheet.yaml").write_text(
        _PASSPORT_ONLY
        + "competencies:\n"
        + '  - id: sheet_x\n    display_name: "X"\n    assessable: true\n'
    )
    (tmp_path / "admin.yaml").write_text(
        "competencies:\n"
        '  - id: manager\n    display_name: "M"\n    may_grant: [sheet_x]\n'
    )

    with pytest.raises(ValueError, match="granted to nobody"):
        _load_catalogue(tmp_path)


def test_every_assessable_competency_is_in_a_framework() -> None:
    """The real catalogue, since the loader would refuse to start."""
    for competency in COMPETENCIES:
        if competency.assessable and competency.retired_on is None:
            assert competency.framework_id in FRAMEWORK_IDS


def test_a_frameworks_items_are_its_assessable_entries() -> None:
    """clinical.yaml holds permissions beside its skills."""
    items = {c.id for c in framework_competencies("clinical")}

    assert "perform_cannulation" in items
    assert all(get_competency_details(i).assessable for i in items)  # type: ignore[union-attr]
    in_file = {c.id for c in COMPETENCIES if c.framework_id == "clinical"}
    assert items < in_file


def test_no_real_framework_is_passport_only_yet() -> None:
    assert PASSPORT_ONLY_COMPETENCY_IDS == ()


def test_a_passport_only_id_is_refused_where_competencies_are_granted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.cbac import competencies

    monkeypatch.setattr(
        competencies, "PASSPORT_ONLY_COMPETENCY_IDS", ("perform_cannulation",)
    )

    with pytest.raises(ValueError, match="granted to nobody"):
        validate_competency_ids(["perform_cannulation"])


def test_expires_after_months_is_read(tmp_path: Path) -> None:
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: lapsing\n"
        '    display_name: "Lapsing"\n'
        "    expires_after_months: 12\n"
    )

    assert _load_competencies(tmp_path)[0].expires_after_months == 12


def test_the_real_catalogue_has_a_levelled_competency() -> None:
    """Guards the passport fields against being quietly dropped.

    Levels reached the catalogue for the clinician passport; CBAC
    ignores them, so nothing else would notice them disappearing.
    """
    levelled = [c for c in COMPETENCIES if c.levels]

    assert levelled, "Expected at least one competency to declare levels"
    assert all(
        len(c.levels or []) >= 2 for c in levelled
    ), "A scale with one step is not a scale; omit levels instead"


def test_load_rejects_an_empty_directory(tmp_path: Path) -> None:
    """No files means a bad path or a missing mount, not an empty set.

    Returning nothing would leave every user holding no competencies,
    which fails open in the sense that matters: nobody could be refused
    for a reason anyone could see.
    """
    with pytest.raises(FileNotFoundError, match="No competency definitions"):
        _load_competencies(tmp_path)


def test_get_competency_details_known_id() -> None:
    details = get_competency_details("prescribe_controlled_schedule_2")
    assert details is not None
    assert details.id == "prescribe_controlled_schedule_2"
    assert details.display_name == "Prescribe Schedule 2 Controlled Drugs"


def test_get_competency_details_unknown_id() -> None:
    assert get_competency_details("does-not-exist") is None


def test_is_valid_competency() -> None:
    assert is_valid_competency("prescribe_non_controlled") is True
    assert is_valid_competency("does-not-exist") is False


def test_competency_entry_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        CompetencyEntry(
            id="x",
            display_name="X",
            risk_level="low",  # type: ignore[call-arg]
        )


def test_competency_entry_rejects_missing_display_name() -> None:
    with pytest.raises(ValidationError):
        CompetencyEntry(id="x")  # type: ignore[call-arg]


def test_competency_entry_is_not_assessable_unless_it_says_so() -> None:
    """Opt-in, so a permission added for access control stays out of
    the passport until somebody decides it belongs there."""
    assert CompetencyEntry(id="x", display_name="X").assessable is False


def test_assessable_ids_hold_skills_and_no_permissions() -> None:
    assert "perform_cannulation" in ASSESSABLE_COMPETENCY_IDS
    assert "prescribe_sact" in ASSESSABLE_COMPETENCY_IDS
    for permission in (
        "manage_users",
        "access_own_patient_records",
        "passport_write",
        "assess_clinician_passport",
    ):
        assert permission not in ASSESSABLE_COMPETENCY_IDS


def test_assessable_ids_are_all_active() -> None:
    assert not set(ASSESSABLE_COMPETENCY_IDS) & set(RETIRED_COMPETENCY_IDS)
