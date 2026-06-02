"""rename patient to single-user in system_permissions

Revision ID: 50cac628e9c6
Revises: 2e24f1879e51
Create Date: 2026-06-02 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "50cac628e9c6"
down_revision: Union[str, None] = "2e24f1879e51"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename system_permissions values from old external subtypes to
    single-user.

    Collapses: patient, external_hcp, patient_advocate, teaching_delegate
    into: single-user
    """
    op.execute(
        "UPDATE users SET system_permissions = 'single-user' "
        "WHERE system_permissions IN "
        "('patient', 'external_hcp', 'patient_advocate', 'teaching_delegate')"
    )
    # Update the server default
    op.alter_column(
        "users",
        "system_permissions",
        server_default="single-user",
    )


def downgrade() -> None:
    """Revert single-user back to patient (lossy — external subtypes
    become patient)."""
    op.execute(
        "UPDATE users SET system_permissions = 'patient' "
        "WHERE system_permissions = 'single-user'"
    )
    op.alter_column(
        "users",
        "system_permissions",
        server_default="patient",
    )
