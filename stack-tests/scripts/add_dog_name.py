#!/usr/bin/env python3
"""Add one dog name to every Markdown file in the text-files folder."""

from __future__ import annotations

import sys

from name_appender import run

#: The dog name this script contributes.
DOG_NAME = "Bella"


if __name__ == "__main__":
    sys.exit(run(DOG_NAME))
