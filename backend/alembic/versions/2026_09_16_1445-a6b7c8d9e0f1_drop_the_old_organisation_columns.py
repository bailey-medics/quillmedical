"""drop the old organisation columns

The contract half. Features, patient lists and conversation links all
name a place now, so the columns that named an organisation have nothing
left to say. The primary keys of the two association tables move across
with them.

The downgrade rebuilds the columns, the keys and the values, so nothing
is lost by going back a step.

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-09-16 14:45:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a6b7c8d9e0f1"
down_revision: str | None = "f5a6b7c8d9e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The association tables key on the place now, so the old key has to
    # go before the column under it does. Postgres marks a new key's
    # columns NOT NULL itself, which is what makes the place required
    # here without a server default that would make no sense for an id.
    op.drop_constraint(  # migration-check: allow-destructive
        "organisation_patient_member_pkey",
        "organisation_patient_member",
        type_="primary",
    )
    op.create_primary_key(
        "organisation_patient_member_pkey",
        "organisation_patient_member",
        ["org_unit_id", "patient_id"],
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "message_organisation_pkey",
        "message_organisation",
        type_="primary",
    )
    op.create_primary_key(
        "message_organisation_pkey",
        "message_organisation",
        ["conversation_id", "org_unit_id"],
    )

    op.drop_constraint(  # migration-check: allow-destructive
        "uq_org_feature", "organisation_features", type_="unique"
    )
    op.drop_index(
        op.f("ix_organisation_features_organisation_id"),
        table_name="organisation_features",
    )

    for table in (
        "organisation_features",
        "organisation_patient_member",
        "message_organisation",
    ):
        # migration-check: allow-destructive
        op.drop_column(table, "organisation_id")


def downgrade() -> None:
    bind = op.get_bind()

    for table, ondelete in (
        ("organisation_features", "CASCADE"),
        ("organisation_patient_member", None),
        ("message_organisation", "CASCADE"),
    ):
        op.add_column(
            table, sa.Column("organisation_id", sa.Integer(), nullable=True)
        )
        op.create_foreign_key(
            f"{table}_organisation_id_fkey",
            table,
            "organisations",
            ["organisation_id"],
            ["id"],
            ondelete=ondelete,
        )
        bind.execute(
            sa.text(
                f"UPDATE {table} SET organisation_id = ("
                "  SELECT o.id FROM organisations o"
                f"  WHERE o.org_unit_id = {table}.org_unit_id"
                ")"
            )
        )

    op.create_index(
        op.f("ix_organisation_features_organisation_id"),
        "organisation_features",
        ["organisation_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_org_feature",
        "organisation_features",
        ["organisation_id", "feature_key"],
    )

    op.drop_constraint(  # migration-check: allow-destructive
        "organisation_patient_member_pkey",
        "organisation_patient_member",
        type_="primary",
    )
    op.create_primary_key(
        "organisation_patient_member_pkey",
        "organisation_patient_member",
        ["organisation_id", "patient_id"],
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "message_organisation_pkey",
        "message_organisation",
        type_="primary",
    )
    op.create_primary_key(
        "message_organisation_pkey",
        "message_organisation",
        ["conversation_id", "organisation_id"],
    )
