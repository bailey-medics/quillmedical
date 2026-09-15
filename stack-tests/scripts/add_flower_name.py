#!/usr/bin/env python3
"""Add one flower name to every Markdown file in the text-files folder."""

from __future__ import annotations

import sys

from name_appender import run

#: The flower this script contributes.
FLOWER_NAME = "Primrose"


if __name__ == "__main__":
    sys.exit(run(FLOWER_NAME))
