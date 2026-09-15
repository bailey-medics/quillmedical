#!/usr/bin/env python3
"""Add one animal name to every Markdown file in the text-files folder."""

from __future__ import annotations

import sys

from name_appender import run

#: The animal this script contributes.
ANIMAL_NAME = "Badger"


if __name__ == "__main__":
    sys.exit(run(ANIMAL_NAME))
