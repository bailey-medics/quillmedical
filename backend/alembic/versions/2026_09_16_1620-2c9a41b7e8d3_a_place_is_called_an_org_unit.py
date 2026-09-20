"""a place is called an org_unit

The tree is about governance, not geography: everything hanging off a node
is a governance fact — who belongs here, who holds which post, whose rules
apply — while a vocabulary of hospital, ward and room reads as physical.
An organisation is a node of it as much as a ward is, so the table cannot
go on being called ``sites``.

The tables that hang off a place are renamed with it, so nothing is left
saying "organisation" about a row that names a place.

**Postgres does not rename a table's auto-named indexes**, so each one is
renamed explicitly; otherwise autogenerate would flag them against the
model's expected names forever. Renaming an index is lock-light and
rebuilds nothing.

The dead many-to-many between organisations and sites goes too. Nothing
has read or written it since ownership moved onto the parent column, and
it holds no rows.

Revision ID: 2c9a41b7e8d3
Revises: 13db821d08b5
Create Date: 2026-09-16 16:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2c9a41b7e8d3"
down_revision: str | None = "13db821d08b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES: tuple[tuple[str, str], ...] = (
    ("sites", "org_unit"),
    ("site_member", "org_unit_member"),
    ("organisation_features", "org_unit_feature"),
    ("organisation_patient_member", "org_unit_patient_member"),
    ("message_organisation", "message_org_unit"),
)

INDEXES: tuple[tuple[str, str], ...] = (
    ("ix_sites_name", "ix_org_unit_name"),
    ("ix_sites_parent_id", "ix_org_unit_parent_id"),
    ("sites_pkey", "org_unit_pkey"),
    ("site_member_pkey", "org_unit_member_pkey"),
    (
        "ix_organisation_features_feature_key",
        "ix_org_unit_feature_feature_key",
    ),
    (
        "ix_organisation_features_org_unit_id",
        "ix_org_unit_feature_org_unit_id",
    ),
    ("organisation_features_pkey", "org_unit_feature_pkey"),
    (
        "organisation_patient_member_pkey",
        "org_unit_patient_member_pkey",
    ),
    ("message_organisation_pkey", "message_org_unit_pkey"),
)

CHECKS: tuple[tuple[str, str, str], ...] = (
    (
        "org_unit_feature",
        "ck_organisation_features_place_required",
        "ck_org_unit_feature_place_required",
    ),
)


def upgrade() -> None:
    for old, new in TABLES:
        op.rename_table(old, new)
    for old, new in INDEXES:
        op.execute(f'ALTER INDEX "{old}" RENAME TO "{new}"')
    for table, old, new in CHECKS:
        op.execute(
            f'ALTER TABLE "{table}" RENAME CONSTRAINT "{old}" TO "{new}"'
        )

    op.drop_table("organisation_site")  # migration-check: allow-destructive


def downgrade() -> None:
    op.create_table(
        "organisation_site",
        sa.Column("organisation_id", sa.Integer(), nullable=False),
        sa.Column("site_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organisation_id"], ["organisations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["site_id"], ["org_unit.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("organisation_id", "site_id"),
    )

    for table, old, new in CHECKS:
        op.execute(
            f'ALTER TABLE "{table}" RENAME CONSTRAINT "{new}" TO "{old}"'
        )
    for old, new in INDEXES:
        op.execute(f'ALTER INDEX "{new}" RENAME TO "{old}"')
    for old, new in TABLES:
        op.rename_table(new, old)
