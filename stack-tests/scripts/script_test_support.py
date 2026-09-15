"""Shared test support for the `add_*_name.py` scripts.

Every one of those scripts is the same shape: a constant holding one
name, handed to `name_appender.run`. The checks worth making are
therefore the same too, so they are written once here and each script's
own test module sets the two class attributes and inherits them.
"""

from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory

import name_appender


class NameScriptTestCase(unittest.TestCase):
    """Checks that every `add_*_name.py` script must pass.

    Subclasses set `name` to the constant the script exports and
    `script_module` to the script's module name. The base class itself
    is skipped, so it does not fail for having no name to test.
    """

    #: The name the script under test contributes.
    name: str = ""

    #: The script's module name, used only in failure messages.
    script_module: str = ""

    def setUp(self) -> None:
        if not self.name:
            self.skipTest("base class, nothing to test")
        folder = TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.directory = Path(folder.name)

    def run_script(self) -> tuple[int, str]:
        """Run the script against the throwaway folder."""
        output = io.StringIO()
        with redirect_stdout(output):
            code = name_appender.run(
                self.name, ["--directory", str(self.directory)]
            )
        return code, output.getvalue()

    def test_the_name_is_usable(self) -> None:
        self.assertEqual(
            name_appender._checked_name(self.name),
            self.name,
            f"{self.script_module} exports a name that needs trimming",
        )

    def test_adds_its_name_to_every_file(self) -> None:
        first = self.directory / "first.md"
        second = self.directory / "second.md"
        first.write_text("# First\n", encoding="utf-8")
        second.write_text("# Second\n", encoding="utf-8")

        code, _ = self.run_script()

        self.assertEqual(code, 0)
        for path in (first, second):
            self.assertTrue(name_appender.has_name(path, self.name))

    def test_running_it_twice_changes_nothing_the_second_time(self) -> None:
        path = self.directory / "first.md"
        path.write_text("# First\n", encoding="utf-8")

        self.run_script()
        after_first = path.read_text(encoding="utf-8")
        code, printed = self.run_script()

        self.assertEqual(code, 0)
        self.assertIn("Nothing to do", printed)
        self.assertEqual(path.read_text(encoding="utf-8"), after_first)

    def test_a_missing_folder_fails_cleanly(self) -> None:
        output = io.StringIO()
        with redirect_stdout(output):
            code = name_appender.run(
                self.name, ["--directory", str(self.directory / "nowhere")]
            )

        self.assertEqual(code, 1)
        self.assertIn("Could not add", output.getvalue())
