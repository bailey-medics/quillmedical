"""list a closed account itself for a decision before it is emptied

Revision ID: 14174110383c
Revises: 9173f9fa9d4a
Create Date: 2026-10-13 14:55:42.430851

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "14174110383c"
down_revision: str | None = "9173f9fa9d4a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "retention_review",
        sa.Column(
            "subject",
            sa.String(length=20),
            server_default="records",
            nullable=False,
        ),
    )
    op.alter_column(
        "retention_review",
        "org_unit_id",
        existing_type=sa.INTEGER(),
        nullable=True,
    )
    op.create_index(
        "uq_retention_review_one_undecided_account",
        "retention_review",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text(
            "decision = 'undecided' AND subject = 'account'"
        ),
        sqlite_where=sa.text("decision = 'undecided' AND subject = 'account'"),
    )
    # Written by hand: autogenerate does not compare check constraints.
    op.create_check_constraint(
        "ck_retention_review_subject",
        "retention_review",
        "subject IN ('records', 'account')",
    )
    op.create_check_constraint(
        "ck_retention_review_records_have_a_place",
        "retention_review",
        "(subject = 'records') = (org_unit_id IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_retention_review_records_have_a_place",
        "retention_review",
        type_="check",
    )
    op.drop_constraint(
        "ck_retention_review_subject", "retention_review", type_="check"
    )
    op.drop_index(
        "uq_retention_review_one_undecided_account",
        table_name="retention_review",
        postgresql_where=sa.text(
            "decision = 'undecided' AND subject = 'account'"
        ),
        sqlite_where=sa.text("decision = 'undecided' AND subject = 'account'"),
    )
    # A row about an account has no organisation, and the column is
    # about to need one again. The rows go: before this migration there
    # was nothing they could mean.
    op.execute("DELETE FROM retention_review WHERE subject = 'account'")
    op.alter_column(
        "retention_review",
        "org_unit_id",
        existing_type=sa.INTEGER(),
        nullable=False,
    )
    op.drop_column("retention_review", "subject")
