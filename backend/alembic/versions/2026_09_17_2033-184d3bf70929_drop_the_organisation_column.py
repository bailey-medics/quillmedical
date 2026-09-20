"""drop the organisation column

The contract half of moving teaching and the passport off
``organisations.id``. Nothing has written these columns since the
previous revision, and nothing has read them since the one before that,
so they go — with the indexes and the unique rules that named them,
which were restated in place ids a revision ago.

``org_unit_id`` becomes required in the same step. It could not be
tightened earlier: the revision serving alongside the previous migration
still inserted rows without it.

``module_media_link.organisation_id`` stays. It is where the object sits
in the bucket rather than who owns the row — media lives at
``{organisation_id}/{module}/{asset}`` and the signed cookie's prefix
covers that path — so only its unique rule moves.

Revision ID: 184d3bf70929
Revises: 422788bccf27
Create Date: 2026-09-17 20:33:49.117499

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "184d3bf70929"
down_revision: str | None = "422788bccf27"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


#: Each table losing its organisation column, with the index, foreign
#: key and unique constraint that named it. The passport's foreign key
#: is truncated because Postgres caps an identifier at 63 characters.
DROPPED: tuple[tuple[str, str, str, str | None, tuple[str, ...]], ...] = (
    (
        "assessments",
        "ix_assessments_organisation_id",
        "assessments_organisation_id_fkey",
        None,
        (),
    ),
    (
        "passport_assessor_registration_verification",
        "ix_passport_assessor_registration_verification_organisation_id",
        "passport_assessor_registration_verificatio_organisation_id_fkey",
        "uq_assessor_registration_verified_here",
        (
            "user_id",
            "registration_authority",
            "registration_number",
            "organisation_id",
        ),
    ),
    (
        "question_bank_configs",
        "ix_question_bank_configs_organisation_id",
        "question_bank_configs_organisation_id_fkey",
        "uq_qb_config_org_bank_ver",
        ("organisation_id", "question_bank_id", "version"),
    ),
    (
        "question_bank_items",
        "ix_question_bank_items_organisation_id",
        "question_bank_items_organisation_id_fkey",
        None,
        (),
    ),
    (
        "question_bank_org_status",
        "ix_question_bank_org_status_organisation_id",
        "question_bank_org_status_organisation_id_fkey",
        "uq_qb_org_status_org_bank",
        ("organisation_id", "question_bank_id"),
    ),
    (
        "question_bank_syncs",
        "ix_question_bank_syncs_organisation_id",
        "question_bank_syncs_organisation_id_fkey",
        None,
        (),
    ),
    (
        "teaching_org_settings",
        "ix_teaching_org_settings_organisation_id",
        "teaching_org_settings_organisation_id_fkey",
        "uq_teaching_org_settings_org",
        ("organisation_id",),
    ),
)

#: Every table whose place column becomes required, which is the seven
#: above plus the media link, whose organisation column stays.
TIGHTENED: tuple[str, ...] = tuple(t for t, *_ in DROPPED) + (
    "module_media_link",
)


def upgrade() -> None:
    for table in TIGHTENED:
        # ``server_default=None`` says this column has no default, which
        # is true and is what the checker asks for on a tightening. An
        # actual default would be wrong here: there is no sensible
        # stand-in for a foreign key, and every row was backfilled by
        # revision cc065829b0fb.
        op.alter_column(
            table,
            "org_unit_id",
            existing_type=sa.INTEGER(),
            nullable=False,
            server_default=None,
        )

    for table, index, foreign_key, unique, _columns in DROPPED:
        # migration-check: allow-destructive
        # Seven columns, their indexes, their foreign keys and four
        # unique constraints. Nothing has read them since revision
        # cc065829b0fb or written them since 422788bccf27, and the rules
        # they carried are enforced in place ids by that same revision.
        op.drop_index(index, table_name=table)
        if unique is not None:
            # migration-check: allow-destructive
            op.drop_constraint(unique, table, type_="unique")
        # migration-check: allow-destructive
        op.drop_constraint(foreign_key, table, type_="foreignkey")
        # migration-check: allow-destructive
        op.drop_column(table, "organisation_id")

    # migration-check: allow-destructive
    # The media link keeps its column and loses only the rule, because
    # the place is what its queries read.
    op.drop_constraint(
        "uq_module_media_link_org_bank_key",
        "module_media_link",
        type_="unique",
    )


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_module_media_link_org_bank_key",
        "module_media_link",
        ["organisation_id", "question_bank_id", "media_key"],
    )

    for table, index, foreign_key, unique, columns in reversed(DROPPED):
        op.add_column(
            table,
            sa.Column("organisation_id", sa.INTEGER(), nullable=True),
        )
        # Filled from the place, so a rollback finds the column as the
        # revision before this one left it rather than empty. Before the
        # unique constraint, which the restored values then satisfy.
        op.execute(
            sa.text(
                f"UPDATE {table} SET organisation_id = organisations.id "  # noqa: S608
                "FROM organisations "
                f"WHERE organisations.org_unit_id = {table}.org_unit_id"  # noqa: S608
            )
        )
        op.create_index(index, table, ["organisation_id"], unique=False)
        op.create_foreign_key(
            foreign_key,
            table,
            "organisations",
            ["organisation_id"],
            ["id"],
            ondelete="CASCADE",
        )
        if unique is not None:
            op.create_unique_constraint(unique, table, list(columns))

    for table in reversed(TIGHTENED):
        op.alter_column(
            table,
            "org_unit_id",
            existing_type=sa.INTEGER(),
            nullable=True,
        )
