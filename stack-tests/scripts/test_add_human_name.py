"""Tests for the script that adds a human name."""

from __future__ import annotations

import unittest

import add_human_name
import name_appender
from script_test_support import NameScriptTestCase


class AddHumanNameTests(NameScriptTestCase):
    name = add_human_name.HUMAN_NAME
    script_module = "add_human_name"


class ShippedHumanFileTests(unittest.TestCase):
    def test_the_human_file_is_there_and_lists_its_own_name(self) -> None:
        path = name_appender.TEXT_FILES_DIR / "grace.md"

        self.assertTrue(path.is_file(), f"{path} is missing")
        self.assertTrue(name_appender.has_name(path, "Grace"))


if __name__ == "__main__":
    unittest.main()
