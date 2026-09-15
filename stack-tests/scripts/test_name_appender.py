"""Tests for the shared name appending module."""

from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory

import name_appender


class TemporaryFolderTest(unittest.TestCase):
    """Base class giving each test its own throwaway folder."""

    def setUp(self) -> None:
        folder = TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.directory = Path(folder.name)

    def write(self, name: str, text: str) -> Path:
        path = self.directory / name
        path.write_text(text, encoding="utf-8")
        return path


class CheckedNameTests(unittest.TestCase):
    def test_trims_surrounding_whitespace(self) -> None:
        self.assertEqual(name_appender._checked_name("  Otter  "), "Otter")

    def test_rejects_an_empty_name(self) -> None:
        with self.assertRaises(ValueError):
            name_appender._checked_name("   ")

    def test_rejects_a_name_spread_over_two_lines(self) -> None:
        with self.assertRaises(ValueError):
            name_appender._checked_name("Otter\nBadger")

    def test_rejects_a_name_that_is_far_too_long(self) -> None:
        with self.assertRaises(ValueError):
            name_appender._checked_name(
                "O" * (name_appender.MAX_NAME_LENGTH + 1)
            )

    def test_accepts_a_name_of_exactly_the_maximum_length(self) -> None:
        longest = "O" * name_appender.MAX_NAME_LENGTH
        self.assertEqual(name_appender._checked_name(longest), longest)


class MarkdownFilesTests(TemporaryFolderTest):
    def test_finds_only_markdown_files_in_name_order(self) -> None:
        self.write("otter.md", "# Otter\n")
        self.write("badger.md", "# Badger\n")
        self.write("notes.txt", "not markdown\n")
        (self.directory / "images").mkdir()

        found = [
            path.name for path in name_appender.markdown_files(self.directory)
        ]

        self.assertEqual(found, ["badger.md", "otter.md"])

    def test_an_empty_folder_gives_an_empty_list(self) -> None:
        self.assertEqual(name_appender.markdown_files(self.directory), [])

    def test_a_missing_folder_is_reported(self) -> None:
        with self.assertRaises(FileNotFoundError):
            name_appender.markdown_files(self.directory / "nowhere")

    def test_a_file_where_a_folder_was_expected_is_reported(self) -> None:
        path = self.write("otter.md", "# Otter\n")
        with self.assertRaises(NotADirectoryError):
            name_appender.markdown_files(path)


class AppendNameTests(TemporaryFolderTest):
    def test_adds_the_name_as_a_list_item(self) -> None:
        path = self.write("otter.md", "# Otter\n\n- Otter\n")

        self.assertTrue(name_appender.append_name(path, "Badger"))
        self.assertEqual(
            path.read_text(encoding="utf-8"),
            "# Otter\n\n- Otter\n- Badger\n",
        )

    def test_running_twice_does_not_list_the_name_twice(self) -> None:
        path = self.write("otter.md", "# Otter\n")
        name_appender.append_name(path, "Badger")

        self.assertFalse(name_appender.append_name(path, "Badger"))
        self.assertEqual(
            path.read_text(encoding="utf-8"), "# Otter\n- Badger\n"
        )

    def test_starts_a_new_line_when_the_file_does_not_end_in_one(
        self,
    ) -> None:
        path = self.write("otter.md", "# Otter")

        name_appender.append_name(path, "Badger")

        self.assertEqual(
            path.read_text(encoding="utf-8"), "# Otter\n- Badger\n"
        )

    def test_writes_into_a_completely_empty_file(self) -> None:
        path = self.write("otter.md", "")

        name_appender.append_name(path, "Badger")

        self.assertEqual(path.read_text(encoding="utf-8"), "- Badger\n")

    def test_a_missing_file_is_reported(self) -> None:
        with self.assertRaises(FileNotFoundError):
            name_appender.append_name(self.directory / "nowhere.md", "Badger")

    def test_a_bad_name_is_rejected_before_the_file_is_touched(self) -> None:
        path = self.write("otter.md", "# Otter\n")

        with self.assertRaises(ValueError):
            name_appender.append_name(path, "  ")

        self.assertEqual(path.read_text(encoding="utf-8"), "# Otter\n")


class HasNameTests(TemporaryFolderTest):
    def test_finds_a_name_that_is_listed(self) -> None:
        path = self.write("otter.md", "# Otter\n\n- Badger\n")
        self.assertTrue(name_appender.has_name(path, "Badger"))

    def test_does_not_find_a_name_that_is_absent(self) -> None:
        path = self.write("otter.md", "# Otter\n\n- Badger\n")
        self.assertFalse(name_appender.has_name(path, "Otter"))

    def test_a_name_only_mentioned_in_prose_does_not_count(self) -> None:
        path = self.write("otter.md", "The badger and the Badger.\n")
        self.assertFalse(name_appender.has_name(path, "Badger"))


class AddNameToAllTests(TemporaryFolderTest):
    def test_adds_the_name_to_every_markdown_file(self) -> None:
        self.write("otter.md", "# Otter\n")
        self.write("badger.md", "# Badger\n")
        self.write("notes.txt", "untouched\n")

        changed = name_appender.add_name_to_all("Weasel", self.directory)

        self.assertEqual(
            [path.name for path in changed], ["badger.md", "otter.md"]
        )
        self.assertEqual(
            (self.directory / "notes.txt").read_text(encoding="utf-8"),
            "untouched\n",
        )

    def test_reports_only_the_files_it_changed(self) -> None:
        self.write("otter.md", "# Otter\n- Weasel\n")
        self.write("badger.md", "# Badger\n")

        changed = name_appender.add_name_to_all("Weasel", self.directory)

        self.assertEqual([path.name for path in changed], ["badger.md"])


class RunTests(TemporaryFolderTest):
    def run_script(self, name: str) -> tuple[int, str]:
        output = io.StringIO()
        with redirect_stdout(output):
            code = name_appender.run(
                name, ["--directory", str(self.directory)]
            )
        return code, output.getvalue()

    def test_reports_each_file_it_changed(self) -> None:
        self.write("otter.md", "# Otter\n")

        code, printed = self.run_script("Weasel")

        self.assertEqual(code, 0)
        self.assertIn("Added Weasel to otter.md", printed)

    def test_says_so_when_there_is_nothing_to_do(self) -> None:
        self.write("otter.md", "# Otter\n- Weasel\n")

        code, printed = self.run_script("Weasel")

        self.assertEqual(code, 0)
        self.assertIn("Nothing to do", printed)

    def test_a_missing_folder_fails_without_a_stack_trace(self) -> None:
        output = io.StringIO()
        with redirect_stdout(output):
            code = name_appender.run(
                "Weasel", ["--directory", str(self.directory / "nowhere")]
            )

        self.assertEqual(code, 1)
        self.assertIn("Could not add Weasel", output.getvalue())


if __name__ == "__main__":
    unittest.main()
