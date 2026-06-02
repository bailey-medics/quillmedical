"""Rename organizations table to organisations (British spelling).

Revision ID: org002
Revises: 50cac628e9c6
Create Date: 2026-06-02 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "org002"
down_revision: Union[str, None] = "50cac628e9c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("organizations", "organisations")


def downgrade() -> None:
    op.rename_table("organisations", "organizations")
