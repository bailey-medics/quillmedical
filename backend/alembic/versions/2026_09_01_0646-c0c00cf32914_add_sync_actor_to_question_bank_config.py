"""add sync actor to question bank config

Records what performed a sync, not only who. The CI path had no user and
passed 0, which violated the users foreign key, so every pipeline sync
failed — invisibly, because the endpoint still returned 200. It now passes
null, and this column says a null means the deploy pipeline rather than an
unrecorded person.

Existing rows were all synced through the admin UI by a signed-in user, so
the server default backfills them correctly.

Revision ID: c0c00cf32914
Revises: 7145b83e82ca
Create Date: 2026-09-01 06:46:37.138780

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c0c00cf32914"
down_revision: str | None = "7145b83e82ca"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # server_default is required alongside nullable=False: the table has
    # rows, and every one of them was a user-initiated sync.
    op.add_column(
        "question_bank_configs",
        sa.Column(
            "synced_by_actor",
            sa.String(length=16),
            server_default="user",
            nullable=False,
        ),
    )


def downgrade() -> None:
    # migration-check: allow-destructive
    # Reversing an additive column; the data it carries is derivable from
    # synced_by being null.
    op.drop_column("question_bank_configs", "synced_by_actor")
