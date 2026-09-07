"""record who promoted a bank version and when

Promotion decides which version a cohort sits, so "who moved this, and when"
needs an answer. Both nullable: existing rows were pinned at creation by the
settings endpoint, not promoted by anyone, and rows predating that carry no
pointer at all.

ON DELETE SET NULL rather than a cascade — the fact a promotion happened
must survive the person leaving.

Revision ID: adb43829b601
Revises: c0c00cf32914
Create Date: 2026-09-07 06:24:16.201099

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "adb43829b601"
down_revision: str | None = "c0c00cf32914"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "question_bank_org_status",
        sa.Column("active_version_set_by", sa.Integer(), nullable=True),
    )
    op.add_column(
        "question_bank_org_status",
        sa.Column(
            "active_version_set_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.create_foreign_key(
        "fk_qb_org_status_active_version_set_by",
        "question_bank_org_status",
        "users",
        ["active_version_set_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # migration-check: allow-destructive
    # Reversing two additive columns; the audit they carry is not derivable,
    # but nothing read it before this revision.
    op.drop_constraint(
        "fk_qb_org_status_active_version_set_by",
        "question_bank_org_status",
        type_="foreignkey",
    )
    op.drop_column("question_bank_org_status", "active_version_set_at")
    op.drop_column("question_bank_org_status", "active_version_set_by")
