"""add active_version pointer to question bank org status

Each organisation now points at the bank version its candidates receive,
rather than always getting the highest synced version. Sync imports new
versions but never moves the pointer, so revising a live bank no longer
puts the revision in front of candidates without a deliberate step.

Existing rows are backfilled to the highest version already synced for
that organisation and bank, so no live bank changes behaviour on deploy.

Revision ID: 7145b83e82ca
Revises: fa4401ce1b92
Create Date: 2026-08-31 11:33:57.273823

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7145b83e82ca"
down_revision: str | None = "fa4401ce1b92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "question_bank_org_status",
        sa.Column("active_version", sa.Integer(), nullable=True),
    )

    # Backfill to what each organisation is already being served: the
    # highest synced version of that bank. Without this every live bank
    # would point at nothing and stop serving the moment this deploys.
    op.execute(sa.text("""
            UPDATE question_bank_org_status AS s
            SET active_version = c.max_version
            FROM (
                SELECT organisation_id,
                       question_bank_id,
                       MAX(version) AS max_version
                FROM question_bank_configs
                GROUP BY organisation_id, question_bank_id
            ) AS c
            WHERE s.organisation_id = c.organisation_id
              AND s.question_bank_id = c.question_bank_id
            """))


def downgrade() -> None:
    op.drop_column("question_bank_org_status", "active_version")
