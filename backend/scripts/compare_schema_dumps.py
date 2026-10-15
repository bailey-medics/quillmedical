#!/usr/bin/env python3
"""Compare two ``pg_dump --schema-only`` files as schema, not as text.

Two databases built by different routes to the same schema, one by a
chain of migrations and one by the baseline that replaces it, dump
differently in three ways that are history rather than schema: the order
of a table's columns, the names Postgres gives NOT NULL constraints and
the names of the sequences behind serial columns, which a renamed table
keeps. This script reads past those and reports everything else: a
column present on one side only, a type or default that differs, an
index, a constraint or a trigger on one side only.

Usage::

    python backend/scripts/compare_schema_dumps.py before.sql after.sql

Exits 0 when the two agree and 1 with one line per difference when they
do not. ``just migrate-dump <file>`` writes a dump it can read.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

NOT_NULL_NAME = re.compile(r"CONSTRAINT \w+_not_null NOT NULL")
CREATE_TABLE = re.compile(r"CREATE TABLE public\.(\w+) \((.*?)\n\);", re.S)
ADD_CONSTRAINT = re.compile(
    r"^(ALTER TABLE ONLY public\.\w+\n    ADD CONSTRAINT .*?;)", re.M | re.S
)
CREATE_INDEX = re.compile(r"^(CREATE (?:UNIQUE )?INDEX .*?;)$", re.M | re.S)
SERIAL_DEFAULT = re.compile(
    r"^ALTER TABLE ONLY public\.(\w+) ALTER COLUMN (\w+) "
    r"SET DEFAULT nextval\('public\.\w+'::regclass\);",
    re.M,
)
OTHER_OBJECT = re.compile(
    r"^(CREATE (?:OR REPLACE )?(?:FUNCTION|TRIGGER|VIEW|TYPE) .*?;)$",
    re.M | re.S,
)


@dataclass
class Schema:
    """What a dump declares, with the historical noise stripped."""

    tables: dict[str, set[str]] = field(default_factory=dict)
    constraints: set[str] = field(default_factory=set)
    indexes: set[str] = field(default_factory=set)
    serials: set[str] = field(default_factory=set)
    others: set[str] = field(default_factory=set)


def _one_line(statement: str) -> str:
    return " ".join(statement.split())


def parse_dump(text: str) -> Schema:
    """Read a schema-only dump into the parts worth comparing."""
    schema = Schema()

    for match in CREATE_TABLE.finditer(text):
        name, body = match.group(1), match.group(2)
        columns: set[str] = set()

        for raw in body.split("\n"):
            line = raw.strip().rstrip(",")
            if line:
                columns.add(NOT_NULL_NAME.sub("NOT NULL", line))

        schema.tables[name] = columns

    for match in ADD_CONSTRAINT.finditer(text):
        schema.constraints.add(_one_line(match.group(1)))

    for match in CREATE_INDEX.finditer(text):
        schema.indexes.add(_one_line(match.group(1)))

    for match in SERIAL_DEFAULT.finditer(text):
        schema.serials.add(f"{match.group(1)}.{match.group(2)}")

    for match in OTHER_OBJECT.finditer(text):
        schema.others.add(_one_line(match.group(1)))

    return schema


def differences(before: Schema, after: Schema) -> list[str]:
    """One line per thing the two schemas disagree on, sorted."""
    found: list[str] = []

    for name in sorted(set(before.tables) | set(after.tables)):
        if name not in before.tables:
            found.append(f"table only after: {name}")
            continue
        if name not in after.tables:
            found.append(f"table only before: {name}")
            continue

        for column in sorted(before.tables[name] - after.tables[name]):
            found.append(f"{name}: only before: {column}")
        for column in sorted(after.tables[name] - before.tables[name]):
            found.append(f"{name}: only after: {column}")

    sets = [
        ("constraint", before.constraints, after.constraints),
        ("index", before.indexes, after.indexes),
        ("serial", before.serials, after.serials),
        ("object", before.others, after.others),
    ]

    for kind, first, second in sets:
        for item in sorted(first - second):
            found.append(f"{kind} only before: {item}")
        for item in sorted(second - first):
            found.append(f"{kind} only after: {item}")

    return found


def main(argv: list[str]) -> int:
    """Compare the two dumps named on the command line."""
    if len(argv) != 3:
        print(
            "Usage: compare_schema_dumps.py <before.sql> <after.sql>",
            file=sys.stderr,
        )
        return 2

    before = parse_dump(Path(argv[1]).read_text())
    after = parse_dump(Path(argv[2]).read_text())
    found = differences(before, after)

    for line in found:
        print(line)

    print(
        f"tables: before {len(before.tables)}, after {len(after.tables)}; "
        f"differences: {len(found)}"
    )

    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
