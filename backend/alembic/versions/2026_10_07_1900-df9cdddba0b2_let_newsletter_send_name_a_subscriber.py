"""Let newsletter_send record a send to a mailing-list subscriber.

A newsletter now goes to account holders and to subscribers who have no
account. Each row names one or the other: ``user_id`` becomes nullable,
``subscriber_id`` is added, and a check requires exactly one of them.

Revision ID: df9cdddba0b2
Revises: 0bb2924fa0d6
Create Date: 2026-10-07 19:00:38.873036

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "df9cdddba0b2"
down_revision: str | None = "0bb2924fa0d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "newsletter_send",
        sa.Column("subscriber_id", sa.Integer(), nullable=True),
    )
    op.alter_column(
        "newsletter_send",
        "user_id",
        existing_type=sa.INTEGER(),
        nullable=True,
    )
    op.create_index(
        "ix_newsletter_send_subscriber",
        "newsletter_send",
        ["subscriber_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_newsletter_send_campaign_subscriber",
        "newsletter_send",
        ["campaign", "subscriber_id"],
    )
    op.create_foreign_key(
        "fk_newsletter_send_subscriber",
        "newsletter_send",
        "newsletter_subscriber",
        ["subscriber_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Autogenerate does not see check constraints, so this one is written
    # by hand to match the model's.
    op.create_check_constraint(
        "ck_newsletter_send_one_recipient",
        "newsletter_send",
        "(user_id IS NULL) <> (subscriber_id IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_newsletter_send_one_recipient", "newsletter_send", type_="check"
    )
    op.drop_constraint(
        "fk_newsletter_send_subscriber", "newsletter_send", type_="foreignkey"
    )
    op.drop_constraint(
        "uq_newsletter_send_campaign_subscriber",
        "newsletter_send",
        type_="unique",
    )
    op.drop_index(
        "ix_newsletter_send_subscriber", table_name="newsletter_send"
    )
    # A send to a subscriber has no user to name, so it cannot be kept
    # once user_id is required again.
    op.execute("DELETE FROM newsletter_send WHERE user_id IS NULL")
    op.alter_column(
        "newsletter_send",
        "user_id",
        existing_type=sa.INTEGER(),
        nullable=False,
    )
    op.drop_column("newsletter_send", "subscriber_id")
