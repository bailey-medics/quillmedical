"""retire the unused assessor invite name and registration columns

Revision ID: dcc9fd1b7cd2
Revises: 02ee55a90547
Create Date: 2026-09-22 10:59:06.971762

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "dcc9fd1b7cd2"
down_revision: str | None = "02ee55a90547"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # migration-check: allow-destructive
    #
    # A contract migration, and it removes nothing anybody stored. All
    # three columns were written as empty strings on every invitation
    # and read by nothing: the holder gives an address and nothing
    # else, and the assessor states their own name and registration
    # when they accept, which is what the sign-off records.
    #
    # The code that wrote them went in the same change, so no still
    # serving revision references these columns.
    op.drop_column("passport_assessor_invite", "registration_authority")
    # migration-check: allow-destructive
    op.drop_column("passport_assessor_invite", "name")
    # migration-check: allow-destructive
    op.drop_column("passport_assessor_invite", "registration_number")


def downgrade() -> None:
    # `server_default=""` on each, which autogenerate does not add: the
    # columns are NOT NULL, so restoring them onto a table that already
    # holds invitations would fail outright without one. An empty
    # string is also what every existing row held, so this restores the
    # shape and the contents both.
    op.add_column(
        "passport_assessor_invite",
        sa.Column(
            "registration_number",
            sa.VARCHAR(length=50),
            nullable=False,
            server_default="",
        ),
    )
    op.add_column(
        "passport_assessor_invite",
        sa.Column(
            "name",
            sa.VARCHAR(length=255),
            nullable=False,
            server_default="",
        ),
    )
    op.add_column(
        "passport_assessor_invite",
        sa.Column(
            "registration_authority",
            sa.VARCHAR(length=50),
            nullable=False,
            server_default="",
        ),
    )
