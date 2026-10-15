"""Tests for ``scripts/compare_schema_dumps.py``.

The script reads past three things a dump records that are history
rather than schema, and reports everything else. Each test here pins one
side of that line.
"""

from __future__ import annotations

from scripts.compare_schema_dumps import differences, parse_dump

TABLE = """
CREATE TABLE public.org_unit (
    id integer CONSTRAINT sites_id_not_null NOT NULL,
    name character varying(255) NOT NULL,
    parent_id integer
);

ALTER TABLE ONLY public.org_unit ALTER COLUMN id SET DEFAULT nextval('public.sites_id_seq'::regclass);

ALTER TABLE ONLY public.org_unit
    ADD CONSTRAINT org_unit_pkey PRIMARY KEY (id);

CREATE INDEX ix_org_unit_name ON public.org_unit USING btree (name);
"""


def _dump(body: str = TABLE) -> str:
    return "SET client_encoding = 'UTF8';\n" + body


def test_the_same_dump_has_no_differences() -> None:
    schema = parse_dump(_dump())

    assert differences(schema, schema) == []


def test_column_order_is_not_a_difference() -> None:
    reordered = TABLE.replace(
        "    name character varying(255) NOT NULL,\n    parent_id integer\n",
        "    parent_id integer,\n    name character varying(255) NOT NULL\n",
    )

    assert differences(parse_dump(_dump()), parse_dump(_dump(reordered))) == []


def test_a_named_not_null_constraint_is_not_a_difference() -> None:
    unnamed = TABLE.replace(
        "CONSTRAINT sites_id_not_null NOT NULL", "NOT NULL"
    )

    assert differences(parse_dump(_dump()), parse_dump(_dump(unnamed))) == []


def test_a_sequence_name_is_not_a_difference() -> None:
    renamed = TABLE.replace("sites_id_seq", "org_unit_id_seq")

    assert differences(parse_dump(_dump()), parse_dump(_dump(renamed))) == []


def test_a_missing_column_is_reported() -> None:
    without = TABLE.replace(",\n    parent_id integer\n", "\n")

    found = differences(parse_dump(_dump()), parse_dump(_dump(without)))

    assert found == ["org_unit: only before: parent_id integer"]


def test_a_changed_type_is_reported_on_both_sides() -> None:
    changed = TABLE.replace("character varying(255)", "character varying(50)")

    found = differences(parse_dump(_dump()), parse_dump(_dump(changed)))

    assert found == [
        "org_unit: only before: name character varying(255) NOT NULL",
        "org_unit: only after: name character varying(50) NOT NULL",
    ]


def test_a_constraint_name_is_a_difference() -> None:
    # A later migration addresses a constraint by name, so a fresh database
    # must name it as the deployed one does.
    renamed = TABLE.replace("org_unit_pkey", "sites_pkey")

    found = differences(parse_dump(_dump()), parse_dump(_dump(renamed)))

    assert len(found) == 2
    assert found[0].startswith("constraint only before: ")
    assert "org_unit_pkey" in found[0]
    assert "sites_pkey" in found[1]


def test_a_missing_index_and_table_are_reported() -> None:
    extra = (
        TABLE + "\nCREATE TABLE public.extra (\n    id integer NOT NULL\n);\n"
    )
    without_index = extra.replace(
        "CREATE INDEX ix_org_unit_name ON public.org_unit USING btree (name);",
        "",
    )

    found = differences(parse_dump(_dump()), parse_dump(_dump(without_index)))

    assert found == [
        "table only after: extra",
        "index only before: CREATE INDEX ix_org_unit_name ON public.org_unit "
        "USING btree (name);",
    ]
