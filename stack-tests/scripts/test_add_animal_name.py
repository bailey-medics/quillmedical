"""Tests for the script that adds an animal name."""

from __future__ import annotations

import unittest

import add_animal_name
import name_appender
from script_test_support import NameScriptTestCase


class AddAnimalNameTests(NameScriptTestCase):
    name = add_animal_name.ANIMAL_NAME
    script_module = "add_animal_name"


class ShippedAnimalFileTests(unittest.TestCase):
    def test_the_animal_file_is_there_and_lists_its_own_name(self) -> None:
        path = name_appender.TEXT_FILES_DIR / "otter.md"

        self.assertTrue(path.is_file(), f"{path} is missing")
        self.assertTrue(name_appender.has_name(path, "Otter"))


if __name__ == "__main__":
    unittest.main()
