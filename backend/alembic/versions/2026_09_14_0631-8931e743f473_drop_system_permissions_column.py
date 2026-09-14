"""drop system permissions column

The four-level rank that said what someone was on the platform. Three of
its rungs — ``single-user``, ``staff`` and ``admin`` — described a person
at a *place* and became organisation and site membership plus
competencies. The fourth, ``superadmin``, said they operate Quill itself,
which is true everywhere or nowhere, and became ``platform_role``.

The contract half of an expand-migrate-contract sequence begun in
``a1c4e7b93d20``, which added ``platform_role`` and backfilled it. Every
caller moved before this ran; see
docs/docs/plans/2026-09-09-platform-role-plan.md.

Revision ID: 8931e743f473
Revises: 3530eb2d528b
Create Date: 2026-09-14 06:31:04.581173

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8931e743f473"
down_revision: str | None = "ab53ececc274"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # migration-check: allow-destructive
    #
    # Every read moved to `platform_role` or to a competency before this
    # ran, so nothing consults the column by the time it goes.
    op.drop_column("users", "system_permissions")


def downgrade() -> None:
    """Restore the column, defaulted rather than backfilled.

    A server default is required: the table has rows, and a NOT NULL
    column cannot be added to populated data without one. Every row comes
    back as ``single-user``, which is the column's own former default.

    The original values are **not** recoverable — nothing else records
    them. A downgrade therefore restores the shape of the schema and not
    its content, and anything relying on the old ranks would need the
    values reconstructed from `platform_role` and membership by hand.
    """
    op.add_column(
        "users",
        sa.Column(
            "system_permissions",
            sa.VARCHAR(length=20),
            nullable=False,
            server_default="single-user",
        ),
    )
