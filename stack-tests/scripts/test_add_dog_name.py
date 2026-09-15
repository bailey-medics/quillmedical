"""Tests for the script that adds a dog name."""

from __future__ import annotations

import unittest

import add_dog_name
import name_appender
from script_test_support import NameScriptTestCase


class AddDogNameTests(NameScriptTestCase):
    name = add_dog_name.DOG_NAME
    script_module = "add_dog_name"


class ShippedDogFileTests(unittest.TestCase):
    def test_the_dog_file_is_there_and_lists_its_own_name(self) -> None:
        path = name_appender.TEXT_FILES_DIR / "rex.md"

        self.assertTrue(path.is_file(), f"{path} is missing")
        self.assertTrue(name_appender.has_name(path, "Rex"))


class EveryPlannedFileIsPresentTests(unittest.TestCase):
    """The plan asks for one file per phase, so all four should be here."""

    def test_all_four_files_are_present(self) -> None:
        expected = ["daffodil.md", "grace.md", "otter.md", "rex.md"]
        found = [
            path.name
            for path in name_appender.markdown_files(
                name_appender.TEXT_FILES_DIR
            )
        ]

        self.assertEqual(found, expected)

    def test_there_is_one_script_for_each_file(self) -> None:
        scripts = sorted(
            path.name
            for path in name_appender.TEXT_FILES_DIR.parent.glob(
                "scripts/add_*_name.py"
            )
        )
        files = name_appender.markdown_files(name_appender.TEXT_FILES_DIR)

        self.assertEqual(len(scripts), len(files))


if __name__ == "__main__":
    unittest.main()
