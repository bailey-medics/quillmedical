"""Checks that hold across every `add_*_name.py` script at once.

There is one of these scripts per phase of the plan, and they are all
built the same way. Finding them by their file name rather than listing
them means a new script is covered the moment it is written, and a
script that drifts from the shape is caught here rather than in review.
"""

from __future__ import annotations

import importlib
import unittest
from pathlib import Path

import name_appender

SCRIPTS_DIR = Path(__file__).resolve().parent


def name_constants() -> dict[str, list[str]]:
    """Map each `add_*_name.py` script to the names it exports."""
    found: dict[str, list[str]] = {}
    for path in sorted(SCRIPTS_DIR.glob("add_*_name.py")):
        module = importlib.import_module(path.stem)
        found[path.stem] = [
            value
            for key, value in vars(module).items()
            if key.endswith("_NAME") and isinstance(value, str)
        ]
    return found


class AllNameScriptsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.constants = name_constants()

    def test_there_is_at_least_one_script_to_check(self) -> None:
        self.assertTrue(self.constants, "no add_*_name.py scripts found")

    def test_each_script_contributes_exactly_one_name(self) -> None:
        for script, names in self.constants.items():
            with self.subTest(script=script):
                self.assertEqual(len(names), 1, f"{script} exports {names}")

    def test_no_two_scripts_contribute_the_same_name(self) -> None:
        names = [name for pair in self.constants.values() for name in pair]
        self.assertCountEqual(names, set(names), "a name is used twice")

    def test_every_name_is_usable(self) -> None:
        for script, names in self.constants.items():
            for name in names:
                with self.subTest(script=script, name=name):
                    self.assertEqual(name_appender._checked_name(name), name)


if __name__ == "__main__":
    unittest.main()
