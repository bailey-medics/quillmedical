"""Rename organisations name index to British spelling

The ``org002`` migration renamed the ``organizations`` table to
``organisations`` but Postgres leaves the auto-named index untouched on a
table rename, so the index kept its American ``ix_organizations_name``
spelling. Rename it in place to match the model metadata
(``ix_organisations_name``). ``ALTER INDEX ... RENAME`` is an instant,
lock-light catalogue update that preserves the underlying index, so no
rebuild is required.

Revision ID: b66133f32f7b
Revises: teach001
Create Date: 2026-08-10 19:33:08.208303

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b66133f32f7b'
down_revision: Union[str, None] = 'teach001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER INDEX ix_organizations_name "
        "RENAME TO ix_organisations_name"
    )


def downgrade() -> None:
    op.execute(
        "ALTER INDEX ix_organisations_name "
        "RENAME TO ix_organizations_name"
    )
