#!/usr/bin/env python3
"""Add one human name to every Markdown file in the text-files folder."""

from __future__ import annotations

import sys

from name_appender import run

#: The human name this script contributes.
HUMAN_NAME = "Alice"


if __name__ == "__main__":
    sys.exit(run(HUMAN_NAME))
