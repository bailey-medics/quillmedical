"""drop assessor registration verification

Drops `passport_assessor_registration_verification`, where an organisation
admin recorded that they had checked an assessor's registration against a
register by hand.

**The table is empty, so nothing is lost.** The route that wrote to it was
never reached from any page and has been removed, along with every field
that read it. The rows it could have held carried no clinical data: which
number was checked, by which admin, for which org_unit and when.

The downgrade recreates the table as it stood at the previous revision,
with `org_unit_id` rather than the `organisation_id` of
`3530eb2d528b`, which created it: three later revisions moved it onto
the org_unit tree. It comes back empty, as it was.

See docs/docs/plans/2026-09-24-remove-registration-verification-plan.md.

Revision ID: 5871099a909e
Revises: 7c33ceaa4550
Create Date: 2026-09-24 15:00:04.797093

"""

# cspell:ignore verific

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5871099a909e"
down_revision: str | None = "7c33ceaa4550"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Empty: no page ever wrote to it. See the docstring above.
    op.drop_index(
        op.f("ix_passport_assessor_registration_verification_org_unit_id"),
        table_name="passport_assessor_registration_verification",
    )
    op.drop_index(
        op.f("ix_passport_assessor_registration_verification_user_id"),
        table_name="passport_assessor_registration_verification",
    )
    # migration-check: allow-destructive
    op.drop_table("passport_assessor_registration_verification")


def downgrade() -> None:
    """Recreate the table, empty, as it stood at the previous revision."""
    op.create_table(
        "passport_assessor_registration_verification",
        sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column(
            "user_id", sa.INTEGER(), autoincrement=False, nullable=False
        ),
        sa.Column(
            "registration_authority",
            sa.VARCHAR(length=50),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "registration_number",
            sa.VARCHAR(length=50),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "verified_by_user_id",
            sa.INTEGER(),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "verified_at",
            postgresql.TIMESTAMP(timezone=True),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "org_unit_id", sa.INTEGER(), autoincrement=False, nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["org_unit_id"],
            ["org_unit.id"],
            name=op.f(
                "fk_passport_assessor_registration_verification_org_unit_id"
            ),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f(
                "passport_assessor_registration_verification_user_id_fkey"
            ),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["verified_by_user_id"],
            ["users.id"],
            # Postgres truncated the generated name to 63 characters.
            name=op.f(
                "passport_assessor_registration_verific_verified_by_user_id_fkey"
            ),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "id", name=op.f("passport_assessor_registration_verification_pkey")
        ),
        sa.UniqueConstraint(
            "user_id",
            "registration_authority",
            "registration_number",
            "org_unit_id",
            name=op.f("uq_assessor_registration_verified_at_place"),
        ),
    )
    op.create_index(
        op.f("ix_passport_assessor_registration_verification_user_id"),
        "passport_assessor_registration_verification",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_passport_assessor_registration_verification_org_unit_id"),
        "passport_assessor_registration_verification",
        ["org_unit_id"],
        unique=False,
    )
