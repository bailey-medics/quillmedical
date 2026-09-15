"""Tests for the script that adds a flower name."""

from __future__ import annotations

import unittest

import add_flower_name
import name_appender
from script_test_support import NameScriptTestCase


class AddFlowerNameTests(NameScriptTestCase):
    name = add_flower_name.FLOWER_NAME
    script_module = "add_flower_name"


class ShippedFlowerFileTests(unittest.TestCase):
    def test_the_flower_file_is_there_and_lists_its_own_name(self) -> None:
        path = name_appender.TEXT_FILES_DIR / "daffodil.md"

        self.assertTrue(path.is_file(), f"{path} is missing")
        self.assertTrue(name_appender.has_name(path, "Daffodil"))


if __name__ == "__main__":
    unittest.main()
