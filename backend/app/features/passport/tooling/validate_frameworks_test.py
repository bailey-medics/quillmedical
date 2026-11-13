"""Tests for app/features/passport/tooling/validate_frameworks.py."""

from __future__ import annotations

from pathlib import Path

from app.cbac.competencies import COMPETENCIES
from app.features.passport.tooling.validate_frameworks import main, validate

_SHEET = """\
framework:
  id: sheet
  name: "A sign-off sheet"
  publisher: "A trust"
  version: 1
  description: "Pilot edition."
  specialties: [oncology]

competencies:
  - id: {id}
    display_name: "Refer a patient"
    assessable: true
"""


def _folder(tmp_path: Path, text: str, name: str = "sheet.yaml") -> Path:
    folder = tmp_path / "frameworks"
    folder.mkdir(exist_ok=True)
    (folder / name).write_text(text)

    return folder


def test_a_good_framework_passes(tmp_path: Path) -> None:
    folder = _folder(tmp_path, _SHEET.format(id="sheet_refer"))

    assert validate(folder) == []
    assert main([str(folder)]) == 0


def test_a_file_with_no_framework_is_refused(tmp_path: Path) -> None:
    folder = _folder(
        tmp_path,
        "competencies:\n  - id: refer\n    display_name: Refer\n",
        name="loose.yaml",
    )

    assert "loose.yaml declares no framework" in validate(folder)[0]


def test_the_loaders_own_rules_apply(tmp_path: Path) -> None:
    """A competency without the framework's prefix, as Quill refuses."""
    folder = _folder(tmp_path, _SHEET.format(id="refer"))

    assert "must start with 'sheet_'" in validate(folder)[0]


def test_a_permissions_id_is_refused(tmp_path: Path) -> None:
    permission = next(c for c in COMPETENCIES if c.framework_id is None)
    folder = _folder(tmp_path, _SHEET.format(id="sheet_refer"))
    text = (folder / "sheet.yaml").read_text()
    # Give the file a framework id that is a prefix of the permission, so
    # the loader's prefix rule passes and only the clash is left.
    prefix, _, rest = permission.id.partition("_")
    (folder / "sheet.yaml").write_text(
        text.replace("id: sheet\n", f"id: {prefix}\n").replace(
            "sheet_refer", permission.id
        )
    )
    (folder / "sheet.yaml").rename(folder / f"{prefix}.yaml")

    problems = validate(folder)

    assert rest
    assert problems == [
        f"{permission.id} is one of Quill's permissions. A framework "
        "competency needs an id of its own."
    ]


def test_a_missing_folder_is_refused(tmp_path: Path) -> None:
    assert main([str(tmp_path / "absent")]) == 1


def test_a_second_framework_is_refused(tmp_path: Path) -> None:
    """Each framework needs a repository of its own."""
    folder = _folder(tmp_path, _SHEET.format(id="sheet_refer"))
    chart = _SHEET.format(id="chart_refer").replace(
        "id: sheet\n", "id: chart\n"
    )
    (folder / "chart.yaml").write_text(chart)

    assert validate(folder) == [
        "A framework repository publishes one framework, so frameworks/ "
        "holds exactly one .yaml file. It holds chart.yaml, sheet.yaml."
    ]
    assert main([str(folder)]) == 1


def test_an_empty_folder_is_refused(tmp_path: Path) -> None:
    folder = tmp_path / "frameworks"
    folder.mkdir()

    assert validate(folder) == [
        "A framework repository publishes one framework, so frameworks/ "
        "holds exactly one .yaml file. It holds nothing."
    ]


def test_a_file_that_is_not_yaml_is_refused(tmp_path: Path) -> None:
    """A .yml or a README beside the framework is not passed over."""
    folder = _folder(tmp_path, _SHEET.format(id="sheet_refer"), "sheet.yml")

    assert "It holds sheet.yml." in validate(folder)[0]
