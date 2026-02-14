"""add_system_permissions_to_users

Revision ID: sp001
Revises: cbac001
Create Date: 2026-02-11 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "sp001"
down_revision: Union[str, None] = "cbac001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add system_permissions field to users table.

    System permissions provide administrative access control orthogonal to
    clinical competencies. Default value is "patient" for public users.

    Permission levels:
        - patient: Own records only
        - staff: Clinical application access
        - admin: User management, patient admin, audit logs
        - superadmin: System configuration, database access, break-glass
    """
    op.add_column(
        "users",
        sa.Column(
            "system_permissions",
            sa.String(length=20),
            nullable=False,
            server_default="patient",
        ),
    )


def downgrade() -> None:
    """Remove system_permissions field from users table."""
    op.drop_column("users", "system_permissions")
