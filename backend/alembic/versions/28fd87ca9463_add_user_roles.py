"""add_user_roles

Revision ID: 28fd87ca9463
Revises: 8a6bfd7b4ce9
Create Date: 2026-02-05 13:34:15.819795

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "28fd87ca9463"
down_revision: Union[str, None] = "8a6bfd7b4ce9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add standard user roles to the roles table."""
    conn = op.get_bind()

    # Define all roles with descriptions as comments
    roles = [
        (
            "System Administrator",
            "Full system configuration access, NO patient data access",
        ),
        (
            "Clinical Administrator",
            "Administrative access to clinical systems and workflows",
        ),
        ("Clinician", "Healthcare professional with patient care access"),
        (
            "Clinical Support Staff",
            "Support staff assisting with clinical operations",
        ),
        ("Patient", "Patient user with access to their own records"),
        (
            "Patient Advocate",
            "Family/carers/solicitor with delegated access to patient records",
        ),
    ]

    # Insert roles if they don't already exist
    for role_name, description in roles:
        # Check if role exists
        result = conn.execute(
            text("SELECT id FROM roles WHERE name = :name"),
            {"name": role_name},
        )
        if not result.fetchone():
            conn.execute(
                text("INSERT INTO roles (name) VALUES (:name)"),
                {"name": role_name},
            )


def downgrade() -> None:
    """Remove the standard user roles."""
    conn = op.get_bind()

    roles = [
        "System Administrator",
        "Clinical Administrator",
        "Clinician",
        "Clinical Support Staff",
        "Patient",
        "Patient Advocate",
    ]

    for role_name in roles:
        conn.execute(
            text("DELETE FROM roles WHERE name = :name"), {"name": role_name}
        )
