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
    COMPETENCIES,
    COMPETENCY_DEFINITIONS_DIR,
    COMPETENCY_IDS,
    MAX_FRAMEWORK_FILE_BYTES,
    CompetencyEntry,
    _load_catalogue,
    get_competency_details,
    is_valid_competency,
    load_framework_text,
    validate_competency_ids,
)
from tests.frameworks import files_catalogue


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
    assert "certify_death" in COMPETENCY_IDS  # clinical-permissions.yaml
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

    loaded = _load_catalogue(tmp_path)[0]

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
        _load_catalogue(tmp_path)[0]


def test_levels_are_optional(tmp_path: Path) -> None:
    """A competency without levels is signed off or it is not.

    Most are: cannulation has no honest middle state. Levels must stay
    optional or every existing entry would need an invented scale.
    """
    (tmp_path / "clinical.yaml").write_text(
        'competencies:\n  - id: plain\n    display_name: "Plain"\n'
    )

    loaded = _load_catalogue(tmp_path)[0]

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

    loaded = _load_catalogue(tmp_path)[0]

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
        _load_catalogue(tmp_path)[0]


def test_load_rejects_an_empty_level_list(tmp_path: Path) -> None:
    """Omitting levels and declaring none must not be different things."""
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: scaled\n"
        '    display_name: "Scaled"\n'
        "    levels: []\n"
    )

    with pytest.raises(ValueError, match="empty level list"):
        _load_catalogue(tmp_path)[0]


def test_scopes_are_optional(tmp_path: Path) -> None:
    """Most competencies are assessed as a whole."""
    (tmp_path / "clinical.yaml").write_text(
        'competencies:\n  - id: plain\n    display_name: "Plain"\n'
    )

    assert _load_catalogue(tmp_path)[0][0].scopes is None


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

    loaded = _load_catalogue(tmp_path)[0]

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
        _load_catalogue(tmp_path)[0]


def test_load_rejects_an_empty_scope_list(tmp_path: Path) -> None:
    """Omitting scopes and declaring none must not be different things."""
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: scoped\n"
        '    display_name: "Scoped"\n'
        "    scopes: []\n"
    )

    with pytest.raises(ValueError, match="empty scope list"):
        _load_catalogue(tmp_path)[0]


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
        _load_catalogue(tmp_path)[0]


def test_the_real_catalogue_has_a_scoped_competency() -> None:
    """Guards the field against being quietly dropped, as for levels."""
    scoped = [c for c in files_catalogue().entries.values() if c.scopes]

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
    "  version: 1\n"
    '  description: "A test sheet."\n'
    "  specialties: [oncology]\n"
)


_SHEET_TEXT = (
    _FRAMEWORK
    + "competencies:\n"
    + '  - id: sheet_item\n    display_name: "An item"\n'
    + "    assessable: true\n"
)


def test_a_framework_is_read_from_its_text() -> None:
    """A version read from git history, with no file of its own."""
    framework, entries = load_framework_text(_SHEET_TEXT, "sheet")

    assert framework.id == "sheet"
    assert [entry.id for entry in entries] == ["sheet_item"]
    assert entries[0].framework_id == "sheet"


def test_a_framework_text_must_declare_the_framework_named() -> None:
    with pytest.raises(ValueError, match="is declared in other.yaml"):
        load_framework_text(_SHEET_TEXT, "other")


def test_a_framework_text_must_declare_a_framework() -> None:
    text = 'competencies:\n  - id: manage\n    display_name: "Manage"\n'

    with pytest.raises(ValueError, match="declares no framework"):
        load_framework_text(text, "sheet")


def test_a_framework_text_with_an_alias_is_refused() -> None:
    """An alias lets a small file expand hugely in memory."""
    text = _SHEET_TEXT.replace(
        '    display_name: "An item"\n',
        '    display_name: &words "An item"\n',
    ) + (
        "  - id: sheet_other\n    display_name: *words\n"
        "    assessable: true\n"
    )

    with pytest.raises(ValueError, match="uses a YAML alias"):
        load_framework_text(text, "sheet")


def test_a_framework_text_too_large_is_refused() -> None:
    text = _SHEET_TEXT + "#" * MAX_FRAMEWORK_FILE_BYTES

    with pytest.raises(ValueError, match="is larger than"):
        load_framework_text(text, "sheet")


def test_a_framework_text_repeating_an_id_is_refused() -> None:
    text = _SHEET_TEXT + (
        '  - id: sheet_item\n    display_name: "Again"\n'
        "    assessable: true\n"
    )

    with pytest.raises(ValueError, match="Duplicate competency ids"):
        load_framework_text(text, "sheet")


def test_a_framework_text_with_no_competencies_is_refused() -> None:
    with pytest.raises(ValueError, match="lists no competencies"):
        load_framework_text(_FRAMEWORK, "sheet")


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


def test_every_frameworks_entry_starts_with_its_frameworks_id(
    tmp_path: Path,
) -> None:
    """No framework is excused, Quill's own included: no flag says so."""
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK
        + "competencies:\n"
        + '  - id: prescribe\n    display_name: "P"\n    assessable: true\n'
    )

    with pytest.raises(ValueError, match="must start with 'sheet_'"):
        _load_catalogue(tmp_path)


def test_every_frameworks_entry_must_be_assessable(tmp_path: Path) -> None:
    """A permission goes in a file that declares no framework."""
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK + 'competencies:\n  - id: sheet_x\n    display_name: "X"\n'
    )

    with pytest.raises(ValueError, match="is not assessable"):
        _load_catalogue(tmp_path)


def test_no_frameworks_entry_may_be_on_a_may_grant_list(
    tmp_path: Path,
) -> None:
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK
        + "competencies:\n"
        + '  - id: sheet_x\n    display_name: "X"\n    assessable: true\n'
    )
    (tmp_path / "admin.yaml").write_text(
        "competencies:\n"
        '  - id: manager\n    display_name: "M"\n    may_grant: [sheet_x]\n'
    )

    with pytest.raises(ValueError, match="granted to nobody"):
        _load_catalogue(tmp_path)


def test_a_frameworks_version_is_a_whole_number(tmp_path: Path) -> None:
    """A quoted "2" is the edition-label mistake this field replaced."""
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK.replace("  version: 1\n", '  version: "2"\n')
        + "competencies:\n"
        + '  - id: sheet_x\n    display_name: "X"\n    assessable: true\n'
    )

    with pytest.raises(ValidationError, match="version"):
        _load_catalogue(tmp_path)


def test_a_framework_needs_a_description(tmp_path: Path) -> None:
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK.replace('  description: "A test sheet."\n', "")
        + "competencies:\n"
        + '  - id: sheet_x\n    display_name: "X"\n    assessable: true\n'
    )

    with pytest.raises(ValidationError, match="description"):
        _load_catalogue(tmp_path)


def test_a_retired_frameworks_entry_names_the_version_it_left(
    tmp_path: Path,
) -> None:
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK
        + "competencies:\n"
        + '  - id: sheet_x\n    display_name: "X"\n    assessable: true\n'
        + "    retired_on: 2026-11-02\n"
    )

    with pytest.raises(ValueError, match="no retired_in_version"):
        _load_catalogue(tmp_path)


def test_a_competency_cannot_leave_in_a_version_not_yet_made(
    tmp_path: Path,
) -> None:
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK
        + "competencies:\n"
        + '  - id: sheet_x\n    display_name: "X"\n    assessable: true\n'
        + "    retired_on: 2026-11-02\n    retired_in_version: 2\n"
    )

    with pytest.raises(ValueError, match="is at version 1"):
        _load_catalogue(tmp_path)


def test_retired_in_version_needs_a_retirement(tmp_path: Path) -> None:
    (tmp_path / "sheet.yaml").write_text(
        _FRAMEWORK.replace("  version: 1\n", "  version: 2\n")
        + "competencies:\n"
        + '  - id: sheet_x\n    display_name: "X"\n    assessable: true\n'
        + "    retired_in_version: 2\n"
    )

    with pytest.raises(ValueError, match="is not retired"):
        _load_catalogue(tmp_path)


def test_a_retired_entry_in_no_framework_names_no_version(
    tmp_path: Path,
) -> None:
    (tmp_path / "old.yaml").write_text(
        "competencies:\n"
        '  - id: skill\n    display_name: "A skill"\n'
        "    retired_on: 2026-10-07\n    retired_in_version: 2\n"
    )

    with pytest.raises(ValueError, match="belongs to no framework"):
        _load_catalogue(tmp_path)


def test_the_fixture_frameworks_versions() -> None:
    """Each fixture framework is read at the version its file holds."""
    versions = {f.id: f.version for f in files_catalogue().frameworks.values()}

    assert versions == {
        "quill_2_test": 2,
        "quill_test": 5,
    }


def test_the_catalogue_holds_permissions_only() -> None:
    """A framework's competencies are read from the tables, not here."""
    assert COMPETENCIES
    assert all(c.framework_id is None for c in COMPETENCIES)
    assert "quill_2_test_insert_a_cannula" not in COMPETENCY_IDS
    assert "prescribe_controlled_schedule_2" in COMPETENCY_IDS
    # A procedure is not a permission: Quill cannot stop anybody doing one.
    assert "perform_cannulation" not in COMPETENCY_IDS


def test_every_framework_competency_is_assessable() -> None:
    """The real frameworks, since the loader would refuse to start."""
    for entry in files_catalogue().entries.values():
        assert entry.assessable
        assert entry.framework_id is not None


def test_a_framework_holds_ids_of_its_own() -> None:
    """A framework's competencies and the permissions never share an id."""
    items = {c.id for c in files_catalogue().competencies["quill_2_test"]}
    permissions = {c.id for c in COMPETENCIES if c.framework_id is None}

    assert "quill_2_test_insert_a_cannula" in items
    assert all(i.startswith("quill_2_test_") for i in items)
    assert not items & permissions
    assert len(items) == 8


def test_a_permission_keeps_its_id_and_is_no_longer_assessable() -> None:
    """Who may do what in the app is unchanged by the split."""
    permission = get_competency_details("prescribe_controlled_schedule_2")

    assert permission is not None
    assert permission.framework_id is None
    assert not permission.assessable


def test_quills_own_frameworks_competency_is_refused_as_a_grant() -> None:
    """Refused by what it is: it is not a permission."""
    with pytest.raises(ValueError, match="Only a permission may be granted"):
        validate_competency_ids(["quill_2_test_insert_a_cannula"])


def test_a_framework_keeps_its_competencies_in_the_files_order() -> None:
    """The order a framework's file gives, which is the order it is read."""
    prefix = "quill_test_"
    expected = [
        "take_a_history",
        "examine_the_chest",
        "explain_a_result",
        "hand_over_a_patient",
        "give_a_course",
        "refer_to_a_team",
        "use_the_old_system",
    ]

    items = files_catalogue().competencies["quill_test"]

    assert [c.id for c in items] == [prefix + e for e in expected]
    assert all(c.id not in COMPETENCY_IDS for c in items)


def test_framework_ids_are_refused_as_grants() -> None:
    with pytest.raises(ValueError, match="Only a permission may be granted"):
        validate_competency_ids(["quill_test_take_a_history"])


def test_a_permission_is_still_granted() -> None:
    """The refusal of framework ids takes nothing from the permissions."""
    assert validate_competency_ids(["prescribe_non_controlled"]) == [
        "prescribe_non_controlled"
    ]


def test_expires_after_months_is_read(tmp_path: Path) -> None:
    (tmp_path / "clinical.yaml").write_text(
        "competencies:\n"
        "  - id: lapsing\n"
        '    display_name: "Lapsing"\n'
        "    expires_after_months: 12\n"
    )

    assert _load_catalogue(tmp_path)[0][0].expires_after_months == 12


def test_the_real_catalogue_has_a_levelled_competency() -> None:
    """Guards the passport fields against being quietly dropped.

    Levels reached the catalogue for the clinician passport; CBAC
    ignores them, so nothing else would notice them disappearing.
    """
    levelled = [c for c in files_catalogue().entries.values() if c.levels]

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
        _load_catalogue(tmp_path)[0]


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


_LEVELLED_TEXT = (
    _FRAMEWORK.replace("  version: 1\n", "  version: 2\n")
    + "competencies:\n"
    + '  - id: sheet_item\n    display_name: "An item"\n'
    + "    assessable: true\n"
    + "    levels:\n"
    + '      - id: observed\n        name: "Observed"\n'
    + "{retired}"
    + '      - id: independent\n        name: "Independent"\n'
)


def test_a_level_is_retired_with_the_version_that_left_it_out() -> None:
    """Retired, never removed: it keeps its place on the scale."""
    text = _LEVELLED_TEXT.format(
        retired="        retired_on: 2026-11-04\n"
        "        retired_in_version: 2\n"
    )

    _, entries = load_framework_text(text, "sheet")

    observed = (entries[0].levels or [])[0]
    assert observed.retired_on is not None
    assert observed.retired_in_version == 2


def test_a_level_retired_with_no_version_is_refused() -> None:
    text = _LEVELLED_TEXT.format(retired="        retired_on: 2026-11-04\n")

    with pytest.raises(ValueError, match="retired with no retired_in_version"):
        load_framework_text(text, "sheet")


def test_the_other_scope_is_never_retired() -> None:
    """Every scope list keeps offering it, so nobody is blocked."""
    text = (
        _FRAMEWORK.replace("  version: 1\n", "  version: 2\n")
        + "competencies:\n"
        + '  - id: sheet_item\n    display_name: "An item"\n'
        + "    assessable: true\n"
        + "    scopes:\n"
        + '      - id: lung\n        name: "Lung"\n'
        + '      - id: other\n        name: "Other"\n'
        + "        retired_on: 2026-11-04\n"
        + "        retired_in_version: 2\n"
    )

    with pytest.raises(ValueError, match="never retired"):
        load_framework_text(text, "sheet")
