"""Add newsletter_subscriber, the mailing list of people with no account.

Over 800 people registered for Let's Do Digital conferences and webinars
and should be sent newsletters without being given Quill accounts. Each
row is one of them: an address, a name where there is one, and whether
they are subscribed. Somebody who unsubscribes keeps their row, so the
refusal is held.

Revision ID: 0bb2924fa0d6
Revises: 405882f25bc5
Create Date: 2026-10-07 18:55:51.078515

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0bb2924fa0d6"
down_revision: str | None = "405882f25bc5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "newsletter_subscriber",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column(
            "subscribed", sa.Boolean(), server_default="true", nullable=False
        ),
        sa.Column(
            "unsubscribed_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )


def downgrade() -> None:
    op.drop_table("newsletter_subscriber")
