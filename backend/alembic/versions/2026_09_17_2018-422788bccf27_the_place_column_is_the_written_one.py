"""the place column is the written one

Teaching and the passport now write only ``org_unit_id``, so the
organisation columns beside it stop being required and the unique rules
they carried are restated in place ids.

Both constraints exist at once on purpose. Once ``organisation_id`` goes
unwritten the older constraint sees a null on every new row and stops
rejecting anything, because Postgres treats nulls as distinct — so the
place-keyed one has to be in place before the writes stop, not after.
The older columns are dropped in the step that follows this one.

``module_media_link.organisation_id`` is not relaxed: it is where the
object sits in the bucket rather than who owns the row, and it outlives
the organisations table.

Revision ID: 422788bccf27
Revises: cc065829b0fb
Create Date: 2026-09-17 20:18:32.023217

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "422788bccf27"
down_revision: str | None = "cc065829b0fb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


#: Tables whose organisation column stops being required, with the
#: unique constraint (if any) that has to be restated in place ids.
RELAXED: tuple[tuple[str, str | None, tuple[str, ...]], ...] = (
    ("assessments", None, ()),
    (
        "passport_assessor_registration_verification",
        "uq_assessor_registration_verified_at_place",
        (
            "user_id",
            "registration_authority",
            "registration_number",
            "org_unit_id",
        ),
    ),
    (
        "question_bank_configs",
        "uq_qb_config_place_bank_ver",
        ("org_unit_id", "question_bank_id", "version"),
    ),
    ("question_bank_items", None, ()),
    (
        "question_bank_org_status",
        "uq_qb_org_status_place_bank",
        ("org_unit_id", "question_bank_id"),
    ),
    ("question_bank_syncs", None, ()),
    (
        "teaching_org_settings",
        "uq_teaching_org_settings_place",
        ("org_unit_id",),
    ),
)


def upgrade() -> None:
    for table, constraint, columns in RELAXED:
        op.alter_column(
            table,
            "organisation_id",
            existing_type=sa.INTEGER(),
            nullable=True,
        )
        if constraint is not None:
            op.create_unique_constraint(constraint, table, list(columns))

    # The media link keeps its organisation column, so its rule is added
    # rather than moved: the queries read the place, so the place is what
    # must be unique.
    op.create_unique_constraint(
        "uq_module_media_link_place_bank_key",
        "module_media_link",
        ["org_unit_id", "question_bank_id", "media_key"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_module_media_link_place_bank_key",
        "module_media_link",
        type_="unique",
    )

    for table, constraint, _columns in reversed(RELAXED):
        if constraint is not None:
            op.drop_constraint(constraint, table, type_="unique")
        # Rows written by this revision carry no organisation id, so the
        # column cannot simply be tightened again — the values are
        # derived back from the place before it is.
        op.execute(
            sa.text(
                f"UPDATE {table} SET organisation_id = organisations.id "  # noqa: S608
                "FROM organisations "
                f"WHERE organisations.org_unit_id = {table}.org_unit_id "  # noqa: S608
                f"AND {table}.organisation_id IS NULL"  # noqa: S608
            )
        )
        op.alter_column(
            table,
            "organisation_id",
            existing_type=sa.INTEGER(),
            nullable=False,
        )
