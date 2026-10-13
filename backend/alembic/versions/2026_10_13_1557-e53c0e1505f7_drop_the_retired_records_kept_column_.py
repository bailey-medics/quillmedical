"""drop the retired records kept column from teaching settings

Revision ID: e53c0e1505f7
Revises: 639f360f9aa7
Create Date: 2026-10-13 15:57:30.942609

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e53c0e1505f7"
down_revision: str | None = "639f360f9aa7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The period moved to org_unit.records_kept_months_after_closure in
    # the migration before this one, which copied every value across.
    # Nothing has read or written this column since, so dropping it
    # loses no information.
    # migration-check: allow-destructive
    op.drop_column(
        "teaching_org_settings", "records_kept_months_after_closure"
    )


def downgrade() -> None:
    # The column comes back and is filled from the organisation's own,
    # which is what the older code read.
    op.add_column(
        "teaching_org_settings",
        sa.Column(
            "records_kept_months_after_closure",
            sa.INTEGER(),
            autoincrement=False,
            nullable=True,
        ),
    )
    op.execute("""
        UPDATE teaching_org_settings AS settings
        SET records_kept_months_after_closure =
            org_unit.records_kept_months_after_closure
        FROM org_unit
        WHERE settings.org_unit_id = org_unit.id
        """)
