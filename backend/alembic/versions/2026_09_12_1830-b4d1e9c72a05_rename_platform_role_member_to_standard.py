"""rename platform role member to standard

`platform_role` held `member` for everyone who does not operate Quill.
That word already means something else here: membership of an
organisation or a site, which has its own tables and its own capacity
column. Two unrelated ideas behind one term is the mistake this column
exists to undo, so the value becomes `standard`.

Autogenerate cannot see this change. `compare_server_default` is off in
env.py by deliberate choice, and the Python-side `default=` never reaches
the schema at all, so `just migrate` produced an empty upgrade and
refused it. Written by hand for that reason, not to work around the
recipe.

Nothing reads the value for authorisation — `platform_role` is compared
against `superadmin` everywhere it is used, never against the other
value — so no code path changes behaviour when the rows are rewritten.

Revision ID: b4d1e9c72a05
Revises: a1c4e7b93d20
Create Date: 2026-09-12 18:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4d1e9c72a05"
down_revision: str | None = "a1c4e7b93d20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Rewrite `member` to `standard`, and move the server default."""
    # The default first, so a row inserted between the two statements
    # gets the new value rather than one the UPDATE has already passed.
    op.alter_column(
        "users",
        "platform_role",
        existing_type=sa.String(length=20),
        existing_nullable=False,
        server_default="standard",
    )
    op.execute("""
        UPDATE users
           SET platform_role = 'standard'
         WHERE platform_role = 'member'
        """)


def downgrade() -> None:
    """Put `member` back, losing nothing.

    The two values are a straight rename with no rows in any third
    state, so reversing is the same pair of statements the other way
    round.
    """
    op.alter_column(
        "users",
        "platform_role",
        existing_type=sa.String(length=20),
        existing_nullable=False,
        server_default="member",
    )
    op.execute("""
        UPDATE users
           SET platform_role = 'member'
         WHERE platform_role = 'standard'
        """)
