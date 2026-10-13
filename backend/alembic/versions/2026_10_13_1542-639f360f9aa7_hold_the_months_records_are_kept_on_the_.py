"""hold the months records are kept on the org unit itself

Revision ID: 639f360f9aa7
Revises: 14174110383c
Create Date: 2026-10-13 15:42:49.909893

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "639f360f9aa7"
down_revision: str | None = "14174110383c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "org_unit",
        sa.Column(
            "records_kept_months_after_closure", sa.Integer(), nullable=True
        ),
    )
    # Carry across any period already set on the teaching settings row,
    # which is where it was held until now. That column is left in place
    # and dropped by a migration of its own.
    op.execute("""
        UPDATE org_unit
        SET records_kept_months_after_closure =
            settings.records_kept_months_after_closure
        FROM teaching_org_settings AS settings
        WHERE settings.org_unit_id = org_unit.id
          AND settings.records_kept_months_after_closure IS NOT NULL
        """)


def downgrade() -> None:
    # Hand the periods back to the teaching settings row first. One set
    # for an organisation with no such row has nowhere to go and is lost.
    op.execute("""
        UPDATE teaching_org_settings AS settings
        SET records_kept_months_after_closure =
            org_unit.records_kept_months_after_closure
        FROM org_unit
        WHERE settings.org_unit_id = org_unit.id
        """)
    op.drop_column("org_unit", "records_kept_months_after_closure")
