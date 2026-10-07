"""Drop users.marketing_synced_at, which nothing reads any more.

The column recorded when Resend, which held the mailing list, last
accepted a person's marketing preference. Quill keeps the list itself
now and tells no mail provider, so there is nothing to record. The code
that read and wrote it was removed in an earlier change, deployed first,
so no serving revision still expects the column.

What it held is not kept: a time Resend was last told is of no use once
Resend is not told. A downgrade puts the column back, empty.

Revision ID: a712f89d9543
Revises: 7f8cd9d9d82a
Create Date: 2026-10-07 18:02:46.964754

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a712f89d9543"
down_revision: str | None = "7f8cd9d9d82a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Deliberate, and its own migration: the contract half of an
    # expand-contract, run only once the code that used the column is gone.
    # migration-check: allow-destructive
    op.drop_column("users", "marketing_synced_at")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "marketing_synced_at",
            postgresql.TIMESTAMP(timezone=True),
            autoincrement=False,
            nullable=True,
        ),
    )
