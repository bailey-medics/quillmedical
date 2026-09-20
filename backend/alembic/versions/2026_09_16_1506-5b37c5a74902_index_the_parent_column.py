"""index the parent column

Every walk up or down the tree goes through ``sites.parent_id``, and
scoping now walks it on every admin request. Only the name column was
indexed, so each walk scanned the whole table.

Revision ID: 5b37c5a74902
Revises: a6b7c8d9e0f1
Create Date: 2026-09-16 15:06:25.934699

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5b37c5a74902"
down_revision: str | None = "a6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        op.f("ix_sites_parent_id"), "sites", ["parent_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_sites_parent_id"), table_name="sites")
